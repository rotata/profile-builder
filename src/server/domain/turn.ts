import { createUIMessageStream, isStepCount, type ModelMessage, streamText, toUIMessageStream } from "ai";
import { getConfig } from "@/server/config";
import { messagesRepo, transaction } from "@/server/db";
import { describeError, toApiError } from "@/server/llm/errors";
import { buildChatInstructions } from "@/server/llm/prompts";
import { chatModel } from "@/server/llm/provider";
import { log } from "@/server/log";
import type { AppUIMessage, ChatMessage } from "@/shared/contract";

type RunTurnInput = { userText: string; requestId: string };

function toModelMessage(message: ChatMessage): ModelMessage {
  return { role: message.role, content: message.text };
}

/**
 * One conversational turn:
 *   1. load server-owned history and stream the reply
 *   2. persist the user + assistant messages together
 *
 * A turn is only persisted if the assistant produced some text. If the
 * provider fails before the first token, nothing is saved, so the client can
 * simply retry without leaving a dangling user message in history. If it
 * fails mid-reply, the partial text is kept and marked "interrupted".
 *
 * Transport-agnostic: the route handler wraps the returned stream.
 */
export function runTurn({ userText, requestId }: RunTurnInput) {
  const model = getConfig().model;
  const history = messagesRepo.list();
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    text: userText,
    status: "complete",
    createdAt: new Date().toISOString(),
  };

  return createUIMessageStream<AppUIMessage>({
    onError: (error) => JSON.stringify(toApiError(error)),
    execute: async ({ writer }) => {
      const startedAt = Date.now();
      let replyText = "";
      let streamFailed = false;

      const result = streamText({
        model: chatModel(),
        instructions: buildChatInstructions(),
        messages: [...history.map(toModelMessage), toModelMessage(userMessage)],
        stopWhen: isStepCount(3),
        onChunk: ({ chunk }) => {
          if (chunk.type === "text-delta") replyText += chunk.text;
        },
        onEnd: ({ usage, finishReason }) =>
          log({
            kind: "llm.chat",
            requestId,
            model,
            latencyMs: Date.now() - startedAt,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            finishReason,
          }),
        onError: ({ error }) => {
          streamFailed = true;
          log({ kind: "llm.chat", requestId, model, latencyMs: Date.now() - startedAt, error: describeError(error) });
        },
      });

      // We send `finish` ourselves, after persisting: the client treats
      // `finish` as "turn complete", so it must not arrive before the turn
      // is durable (otherwise a quick reload can miss it).
      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          sendFinish: false,
          onError: (error) => JSON.stringify(toApiError(error)),
        }),
      );

      try {
        await result.finishReason;
      } catch {
        streamFailed = true;
      }

      if (!replyText.trim()) return; // nothing worth keeping; client retries cleanly

      persistTurn(userMessage, replyText, streamFailed);
      writer.write({ type: "finish" });
    },
  });
}

function persistTurn(userMessage: ChatMessage, replyText: string, interrupted: boolean) {
  transaction(() => {
    messagesRepo.insert(userMessage);
    messagesRepo.insert({
      id: crypto.randomUUID(),
      role: "assistant",
      text: replyText,
      status: interrupted ? "interrupted" : "complete",
      createdAt: new Date().toISOString(),
    });
  });
}
