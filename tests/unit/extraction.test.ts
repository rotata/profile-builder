import { describe, expect, it } from "vitest";
import { type ExtractionResult, isGrounded, sanitizeExtraction } from "@/server/domain/extraction";

const update = (u: Partial<ExtractionResult["updates"][number]>): ExtractionResult["updates"][number] => ({
  field: "interests",
  op: "add",
  value: "food",
  evidence: "I love food",
  explicitChange: false,
  ...u,
});

describe("isGrounded", () => {
  const message = "Honestly, I'm vegetarian — and I LOVE slow trips with lots of street food!";

  it("accepts verbatim quotes regardless of case and punctuation", () => {
    expect(isGrounded("i'm vegetarian", message)).toBe(true);
    expect(isGrounded("love slow trips", message)).toBe(true);
  });

  it("tolerates light paraphrase (most words present)", () => {
    expect(isGrounded("slow trips with street food", message)).toBe(true);
  });

  it("rejects claims the traveler never made", () => {
    expect(isGrounded("I prefer luxury hotels", message)).toBe(false);
    expect(isGrounded("", message)).toBe(false);
  });
});

describe("sanitizeExtraction", () => {
  const userText = "I love food and I'm on a budget";

  it("drops updates whose evidence is not in the traveler's message", () => {
    const { result, dropped } = sanitizeExtraction(
      { updates: [update({ evidence: "I adore museums", value: "museums" })], contradictions: [] },
      userText,
    );
    expect(result.updates).toHaveLength(0);
    expect(dropped[0]).toMatch(/ungrounded/);
  });

  it("drops enum values outside the allowed set", () => {
    const { result, dropped } = sanitizeExtraction(
      { updates: [update({ field: "budgetTier", op: "set", value: "cheapish", evidence: "on a budget" })], contradictions: [] },
      userText,
    );
    expect(result.updates).toHaveLength(0);
    expect(dropped[0]).toMatch(/invalid value/);
  });

  it("normalizes ops to the field kind", () => {
    const { result } = sanitizeExtraction(
      {
        updates: [
          update({ field: "budgetTier", op: "add", value: "budget", evidence: "on a budget" }),
          update({ field: "interests", op: "set", value: "food", evidence: "I love food" }),
        ],
        contradictions: [],
      },
      userText,
    );
    expect(result.updates.map((u) => u.op)).toEqual(["set", "add"]);
  });

  it("drops ungrounded contradictions", () => {
    const { result } = sanitizeExtraction(
      {
        updates: [],
        contradictions: [
          { field: "dietary", existingValue: "vegetarian", candidateValue: "", evidence: "steakhouse", reason: "x" },
        ],
      },
      userText,
    );
    expect(result.contradictions).toHaveLength(0);
  });
});
