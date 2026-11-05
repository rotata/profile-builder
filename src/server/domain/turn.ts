import { createUIMessageStream, isStepCount, type ModelMessage, streamText, toUIMessageStream } from "ai";
import { getConfig } from "@/server/config";
import { conflictsRepo, messagesRepo, profileRepo, transaction } from "@/server/db";
import { applyExtraction } from "@/server/domain/conflicts";
import { extractProfileUpdates } from "@/server/domain/extraction";
import { describeError, toApiError } from "@/server/llm/errors";
import { buildChatInstructions } from "@/server/llm/prompts";
import { chatModel } from "@/server/llm/provider";
import { createDestinationTool } from "@/server/llm/tools";
import { log } from "@/server/log";
import type {
  AppUIMessage,
  ChatMessage,
  Conflict,
  DestinationLookup,
  TravelProfile,
  TurnResult,
} from "@/shared/contract";

type RunTurnInput = { userText: string; requestId: string };

function toModelMessage(message: ChatMessage): ModelMessage {
  return { role: message.role, content: message.text };
}

/**
 * One conversational turn:
 *   1. load server-owned history + profile, stream the reply
 *   2. persist the user + assistant messages together
 *   3. extract proposed profile changes from the exchange and apply them
 *   4. send the updated profile as the final `data-turn` event, then `finish`
 *
 * A turn is only persisted if the assistant produced some text. If the
 * provider fails before the first token, nothing is saved, so the client can
 * simply retry without leaving a dangling user message in history. If it
 * fails mid-reply, the partial text is kept (marked "interrupted") and
 * extraction is skipped. An extraction failure never fails the turn.
 *
 * Transport-agnostic: the route handler wraps the returned stream.
 */
export function runTurn({ userText, requestId }: RunTurnInput) {
  const model = getConfig().model;
  const history = messagesRepo.list();
  const profile = profileRepo.get();
  const openConflicts = conflictsRepo.listOpen();
  const previousAssistantText = history.findLast((m) => m.role === "assistant")?.text ?? null;
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    text: userText,
    lookups: [],
    status: "complete",
    createdAt: new Date().toISOString(),
  };

  return createUIMessageStream<AppUIMessage>({
    onError: (error) => JSON.stringify(toApiError(error)),
    execute: async ({ writer }) => {
      const startedAt = Date.now();
      let replyText = "";
      let streamFailed = false;
      const lookups: DestinationLookup[] = [];

      const getDestinationInfo = createDestinationTool({
        requestId,
        onLookup: (lookup) => {
          lookups.push(lookup);
          writer.write({ type: "data-lookup", id: `lookup-${lookups.length}`, data: lookup });
        },
      });

      const result = streamText({
        model: chatModel(),
        instructions: buildChatInstructions(profile, openConflicts),
        messages: [...history.map(toModelMessage), toModelMessage(userMessage)],
        tools: { getDestinationInfo },
        // Up to: tool call(s) → informed reply. Bounded so a looping model can't run away.
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

      persistTurn(userMessage, { text: replyText, lookups, interrupted: streamFailed });

      let turnResult: TurnResult = { profile, conflicts: openConflicts, extraction: "skipped" };
      if (!streamFailed) {
        writer.write({ type: "data-turn", data: { phase: "extracting" }, transient: true });
        turnResult = await updateProfile({ profile, openConflicts, previousAssistantText, userText, requestId });
      }
      writer.write({ type: "data-turn", data: { phase: "done", result: turnResult }, transient: true });
      writer.write({ type: "finish" });
    },
  });
}

function persistTurn(
  userMessage: ChatMessage,
  reply: { text: string; lookups: DestinationLookup[]; interrupted: boolean },
) {
  transaction(() => {
    messagesRepo.insert(userMessage);
    messagesRepo.insert({
      id: crypto.randomUUID(),
      role: "assistant",
      text: reply.text,
      lookups: reply.lookups,
      status: reply.interrupted ? "interrupted" : "complete",
      createdAt: new Date().toISOString(),
    });
  });
}

async function updateProfile(input: {
  profile: TravelProfile;
  openConflicts: Conflict[];
  previousAssistantText: string | null;
  userText: string;
  requestId: string;
}): Promise<TurnResult> {
  const { profile, openConflicts, requestId } = input;
  const outcome = await extractProfileUpdates(input);
  if (!outcome.ok) {
    log({ kind: "turn.extraction", requestId, outcome: "failed", error: outcome.error });
    return { profile, conflicts: openConflicts, extraction: "failed" };
  }

  const now = new Date().toISOString();
  const result = applyExtraction(profile, openConflicts, outcome.result, now);
  const changed = result.applied > 0 || result.newConflicts.length > 0 || result.resolved.length > 0;
  if (changed) {
    transaction(() => {
      profileRepo.save(result.profile);
      for (const c of result.newConflicts) conflictsRepo.insert(c);
      for (const r of result.resolved) conflictsRepo.resolve(r.id, r.status, now);
    });
  }

  const extraction = changed ? "applied" : "no_changes";
  log({
    kind: "turn.extraction",
    requestId,
    outcome: extraction,
    applied: result.applied,
    conflicts: result.newConflicts.length,
    dropped: [...outcome.dropped, ...result.ignored],
  });
  return { profile: result.profile, conflicts: conflictsRepo.listOpen(), extraction };
}
