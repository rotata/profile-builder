/**
 * A scripted language model for E2E tests and keyless demos (LLM_PROVIDER=mock).
 *
 * It speaks the real provider protocol (stream parts, finish reasons, usage),
 * so everything downstream — streaming, persistence, UI — runs the production
 * code path. What it does NOT exercise is model judgment; see evals/ for that.
 *
 * Triggers (in the latest user message):
 *   "[mock:fail]"  → the stream errors before any text (tests error handling)
 */
import type { LanguageModelV4Prompt as Prompt } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

/** Text of the most recent user message in a provider prompt. */
export function lastUserText(prompt: Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message.role === "user") {
      return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    }
  }
  return "";
}

/** Splits text into word-sized deltas so the UI visibly streams. */
function textParts(text: string, id = "text-1") {
  const words = text.split(/(?<=\s)/);
  return [
    { type: "text-start" as const, id },
    ...words.map((delta) => ({ type: "text-delta" as const, id, delta })),
    { type: "text-end" as const, id },
  ];
}

function finish(reason: "stop" | "tool-calls" = "stop") {
  return { type: "finish" as const, finishReason: { unified: reason, raw: undefined }, usage: USAGE };
}

export function scriptChatReply(): string {
  return (
    `Thanks for sharing that. I'm building your travel profile as we talk. ` +
    `What does a great day of travel look like for you — slow mornings and long lunches, or out the door at dawn?`
  );
}

export function createMockChatModel() {
  return new MockLanguageModelV4({
    modelId: "mock-chat",
    doStream: async ({ prompt }) => {
      const userText = lastUserText(prompt);
      if (userText.includes("[mock:fail]")) {
        return {
          stream: simulateReadableStream({
            chunks: [{ type: "error" as const, error: new Error("mock provider failure") }],
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 100,
          chunkDelayInMs: 30,
          chunks: [...textParts(scriptChatReply()), finish()],
        }),
      };
    },
  });
}
