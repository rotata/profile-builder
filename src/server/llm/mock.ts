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

// ---------------------------------------------------------------------------
// Extraction: keyword rules standing in for the model's judgment.
// ---------------------------------------------------------------------------

type MockUpdate = { field: string; op: "set" | "add" | "remove"; value: string; evidence: string; explicitChange: boolean };
type MockContradiction = { field: string; existingValue: string; candidateValue: string; evidence: string; reason: string };

function between(text: string, tag: string): string {
  return text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
}

const KEYWORD_RULES: Array<{ pattern: RegExp; field: string; op: "set" | "add"; value: string }> = [
  { pattern: /\bvegetarian\b/i, field: "dietary", op: "add", value: "vegetarian" },
  { pattern: /\bvegan\b/i, field: "dietary", op: "add", value: "vegan" },
  { pattern: /\bsolo\b/i, field: "companions", op: "set", value: "solo" },
  { pattern: /\b(my|with) (partner|wife|husband)\b/i, field: "companions", op: "set", value: "partner" },
  { pattern: /\bluxury\b/i, field: "budgetTier", op: "set", value: "luxury" },
  { pattern: /\bmid-?range\b/i, field: "budgetTier", op: "set", value: "midRange" },
  { pattern: /\b(on a budget|cheap|backpack)/i, field: "budgetTier", op: "set", value: "budget" },
  { pattern: /\b(slow|relaxed)\b/i, field: "travelPace", op: "set", value: "relaxed" },
  { pattern: /\bfood\b/i, field: "interests", op: "add", value: "food" },
  { pattern: /\bhiking\b/i, field: "interests", op: "add", value: "hiking" },
  { pattern: /\bmuseums?\b/i, field: "interests", op: "add", value: "museums" },
  { pattern: /\bboutique hotels?\b/i, field: "accommodation", op: "add", value: "boutique hotels" },
];

export function scriptExtraction(prompt: string): { updates: MockUpdate[]; contradictions: MockContradiction[] } {
  const message = between(prompt, "traveler_message");
  const updates: MockUpdate[] = [];
  const contradictions: MockContradiction[] = [];

  const explicitMeat = /\b(i eat meat now|no longer vegetarian|not vegetarian anymore)\b/i.exec(message);
  if (explicitMeat) {
    updates.push({ field: "dietary", op: "remove", value: "vegetarian", evidence: explicitMeat[0], explicitChange: true });
  } else {
    for (const rule of KEYWORD_RULES) {
      const match = rule.pattern.exec(message);
      if (match) updates.push({ field: rule.field, op: rule.op, value: rule.value, evidence: match[0], explicitChange: false });
    }
  }

  const steak = /\bsteakhouse\b/i.exec(message);
  if (steak) {
    contradictions.push({
      field: "dietary",
      existingValue: "vegetarian",
      candidateValue: "",
      evidence: steak[0],
      reason: "You mentioned a steakhouse, but your profile says you're vegetarian.",
    });
  }

  return { updates, contradictions };
}

export function createMockExtractionModel() {
  return new MockLanguageModelV4({
    modelId: "mock-extract",
    doGenerate: async ({ prompt }) => {
      const promptText = prompt
        .map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => ("text" in p ? p.text : "")).join("")))
        .join("\n");
      return {
        content: [{ type: "text", text: JSON.stringify(scriptExtraction(promptText)) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      };
    },
  });
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
