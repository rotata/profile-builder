import { createUIMessageStream, isStepCount, streamText, toUIMessageStream } from "ai";
import { getConfig } from "@/server/config";
import { describeError, toApiError } from "@/server/llm/errors";
import { buildChatInstructions } from "@/server/llm/prompts";
import { chatModel } from "@/server/llm/provider";
import { log } from "@/server/log";
import type { AppUIMessage } from "@/shared/contract";

type RunTurnInput = { userText: string; requestId: string };

/**
 * One conversational turn: stream the assistant's reply as a UI message stream.
 * Transport-agnostic: the route handler wraps the returned stream in a Response.
 */
export function runTurn({ userText, requestId }: RunTurnInput) {
  const model = getConfig().model;

  return createUIMessageStream<AppUIMessage>({
    onError: (error) => JSON.stringify(toApiError(error)),
    execute: async ({ writer }) => {
      const startedAt = Date.now();

      const result = streamText({
        model: chatModel(),
        instructions: buildChatInstructions(),
        messages: [{ role: "user", content: userText }],
        stopWhen: isStepCount(3),
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
        onError: ({ error }) =>
          log({ kind: "llm.chat", requestId, model, latencyMs: Date.now() - startedAt, error: describeError(error) }),
      });

      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          onError: (error) => JSON.stringify(toApiError(error)),
        }),
      );
    },
  });
}
