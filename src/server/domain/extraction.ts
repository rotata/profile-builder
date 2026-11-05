/**
 * Structured extraction: a second, non-streaming model call that turns the
 * latest exchange into *proposed* profile changes. It never writes to the
 * profile itself — conflicts.ts decides what is applied.
 *
 * Robustness: the model's output is (1) schema-validated by the SDK,
 * (2) value-validated per field, and (3) grounded — every claim must quote the
 * traveler. Anything that fails is dropped and logged, never applied.
 */
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { getConfig } from "@/server/config";
import { describeError } from "@/server/llm/errors";
import { buildExtractionInstructions, buildExtractionPrompt } from "@/server/llm/prompts";
import { extractionModel } from "@/server/llm/provider";
import { log } from "@/server/log";
import {
  type Conflict,
  FIELD_VALUE_SCHEMAS,
  isScalarField,
  PROFILE_FIELDS,
  type TravelProfile,
} from "@/shared/contract";

/**
 * What the model returns. Shaped for OpenAI strict structured outputs: every
 * key required, no optionals, no unions.
 */
export const ExtractionResultSchema = z.object({
  updates: z.array(
    z.object({
      field: z.enum(PROFILE_FIELDS),
      op: z.enum(["set", "add", "remove"]),
      value: z.string(),
      evidence: z.string().describe("Verbatim quote from the traveler's message."),
      explicitChange: z
        .boolean()
        .describe("True only if the traveler explicitly says an earlier preference changed or was wrong."),
    }),
  ),
  contradictions: z.array(
    z.object({
      field: z.enum(PROFILE_FIELDS),
      existingValue: z.string().describe("The current profile value, exactly as shown."),
      candidateValue: z.string().describe('What the field would become, or "" if the existing value would just be removed.'),
      evidence: z.string().describe("Verbatim quote from the traveler's message."),
      reason: z.string().describe("One short sentence explaining the tension, addressed to the traveler."),
    }),
  ),
  resolutions: z.array(
    z.object({
      conflictId: z.string(),
      choice: z
        .enum(["keep", "replace"])
        .describe("keep = the old profile value still stands; replace = the new value wins."),
    }),
  ),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type ProfileUpdate = ExtractionResult["updates"][number];
export type Contradiction = ExtractionResult["contradictions"][number];

type ExtractInput = {
  profile: TravelProfile;
  openConflicts: Conflict[];
  previousAssistantText: string | null;
  userText: string;
  requestId: string;
};

export type ExtractOutcome = { ok: true; result: ExtractionResult; dropped: string[] } | { ok: false; error: string };

export async function extractProfileUpdates(input: ExtractInput): Promise<ExtractOutcome> {
  const model = getConfig().model;
  const prompt = buildExtractionPrompt(input);

  // One retry on malformed output; transport errors are retried by the SDK.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = Date.now();
    try {
      const { output, usage } = await generateText({
        model: extractionModel(),
        instructions: buildExtractionInstructions(),
        prompt,
        output: Output.object({ schema: ExtractionResultSchema }),
        temperature: 0,
      });
      log({
        kind: "llm.extract",
        requestId: input.requestId,
        model,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      const { result, dropped } = sanitizeExtraction(output, input.userText);
      return { ok: true, result, dropped };
    } catch (error) {
      log({
        kind: "llm.extract",
        requestId: input.requestId,
        model,
        latencyMs: Date.now() - startedAt,
        error: describeError(error),
      });
      if (!(NoObjectGeneratedError.isInstance(error) && attempt === 1)) {
        return { ok: false, error: describeError(error) };
      }
    }
  }
  return { ok: false, error: "unreachable" };
}

// ---------------------------------------------------------------------------
// Sanitizing (pure, unit-tested)
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Is this "quote" actually something the traveler said? Exact (normalized)
 * substring, or — to tolerate light model paraphrase — at least 80% of its
 * meaningful words appear in the message.
 */
export function isGrounded(evidence: string, userText: string): boolean {
  const quote = normalize(evidence);
  const text = normalize(userText);
  if (!quote) return false;
  if (text.includes(quote)) return true;
  const words = quote.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return false;
  const textWords = new Set(text.split(" "));
  const hits = words.filter((w) => textWords.has(w)).length;
  return hits / words.length >= 0.8;
}

/**
 * Drops anything that isn't safe to act on, and normalizes ops to field kind
 * (scalar fields "set", list fields "add"/"remove").
 */
export function sanitizeExtraction(raw: ExtractionResult, userText: string): { result: ExtractionResult; dropped: string[] } {
  const dropped: string[] = [];
  const updates: ProfileUpdate[] = [];

  for (const update of raw.updates) {
    const label = `${update.op} ${update.field}=${JSON.stringify(update.value)}`;
    if (!isGrounded(update.evidence, userText)) {
      dropped.push(`${label}: ungrounded evidence`);
      continue;
    }
    let value = update.value.trim();
    if (update.op !== "remove" || isScalarField(update.field)) {
      const parsed = FIELD_VALUE_SCHEMAS[update.field].safeParse(value);
      if (!parsed.success && update.op !== "remove") {
        dropped.push(`${label}: invalid value`);
        continue;
      }
      if (parsed.success) value = parsed.data;
    }
    const op = isScalarField(update.field)
      ? update.op === "remove"
        ? "remove"
        : "set"
      : update.op === "remove"
        ? "remove"
        : "add";
    updates.push({ ...update, op, value });
  }

  const contradictions = raw.contradictions.filter((c) => {
    if (isGrounded(c.evidence, userText)) return true;
    dropped.push(`contradiction ${c.field}: ungrounded evidence`);
    return false;
  });

  // Resolution ids are checked against the actual open conflicts in conflicts.ts.
  return { result: { updates, contradictions, resolutions: raw.resolutions }, dropped };
}
