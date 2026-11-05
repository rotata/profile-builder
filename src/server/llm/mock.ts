/**
 * A scripted language model for E2E tests and keyless demos (LLM_PROVIDER=mock).
 *
 * It speaks the real provider protocol (stream parts, finish reasons, usage),
 * so everything downstream — streaming, persistence, UI — runs the production
 * code path. What it does NOT exercise is model judgment; see evals/ for that.
 *
 * Triggers (in the latest user message):
 *   "[mock:fail]"            → the stream errors before any text (tests error handling)
 *   a destination name        → real getDestinationInfo tool call, then a reply
 *                               composed from the tool result (Lisbon → no data)
 *   keywords (see KEYWORD_RULES) → scripted extraction
 */
import type { LanguageModelV4Prompt as Prompt, LanguageModelV4StreamPart as StreamPart } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { DestinationToolResult } from "@/server/llm/tools";

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

  const place = MOCK_PLACES.exec(message);
  if (place) {
    updates.push({
      field: "destinationsOfInterest",
      op: "add",
      value: titleCase(place[0]),
      evidence: place[0],
      explicitChange: false,
    });
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

/** Places the mock "recognizes" as destinations (Lisbon deliberately has no data). */
const MOCK_PLACES = /\b(kyoto|paris|mexico city|reykjav[ií]k|marrakech|bangkok|lisbon)\b/i;

function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Builds the follow-up from the tool result — so E2E proves the result is actually used. */
export function scriptDestinationReply(result: DestinationToolResult): string {
  if (!result.found) {
    return `I don't have curated destination data for ${result.name}, so I won't guess at seasons or prices. What draws you to ${result.name}?`;
  }
  const { info } = result;
  return (
    `${info.name} is known for ${info.knownFor.slice(0, 2).join(" and ")}, and it's at its best in ${info.bestSeasons.join(" and ")}. ` +
    `Mid-range travelers spend about $${info.averageDailyBudgetUSD.midRange} a day there. ` +
    `Would you go in ${info.bestSeasons[0]}, or do you usually travel at another time of year?`
  );
}

function streamOf(chunks: StreamPart[]) {
  return { stream: simulateReadableStream({ initialDelayInMs: 100, chunkDelayInMs: 30, chunks }) };
}

export function createMockChatModel() {
  return new MockLanguageModelV4({
    modelId: "mock-chat",
    doStream: async ({ prompt }) => {
      const last = prompt[prompt.length - 1];

      // Step 2 of a tool loop: answer from the tool result.
      if (last?.role === "tool") {
        const part = last.content.find((p) => p.type === "tool-result");
        const result = part?.type === "tool-result" && part.output.type === "json" ? part.output.value : null;
        return streamOf([...textParts(scriptDestinationReply(result as DestinationToolResult)), finish()]);
      }

      const userText = lastUserText(prompt);
      if (userText.includes("[mock:fail]")) {
        return streamOf([{ type: "error" as const, error: new Error("mock provider failure") }]);
      }

      // Step 1: a destination was mentioned → call the tool, like a real model should.
      const place = MOCK_PLACES.exec(userText);
      if (place) {
        return streamOf([
          {
            type: "tool-call" as const,
            toolCallId: "mock-call-1",
            toolName: "getDestinationInfo",
            input: JSON.stringify({ name: titleCase(place[0]) }),
          },
          finish("tool-calls"),
        ]);
      }

      return streamOf([...textParts(scriptChatReply()), finish()]);
    },
  });
}
