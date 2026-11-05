/**
 * The one place that decides how proposed changes become profile state.
 * Pure functions: no I/O, no model calls — fully unit-testable.
 */
import type { ExtractionResult } from "@/server/domain/extraction";
import {
  isScalarField,
  type ListField,
  type ProfileEntry,
  type ScalarField,
  type TravelProfile,
  TravelProfileSchema,
} from "@/shared/contract";

/** Field-generic view of the profile. Re-validated against TravelProfileSchema on the way out. */
type ProfileShape = Record<ScalarField, ProfileEntry | null> & Record<ListField, ProfileEntry[]>;

export type ApplyResult = {
  profile: TravelProfile;
  /** Number of updates that changed the profile. */
  applied: number;
};

export function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function applyExtraction(
  profile: TravelProfile,
  extraction: ExtractionResult,
  now: string = new Date().toISOString(),
): ApplyResult {
  const next = structuredClone(profile) as ProfileShape;
  let applied = 0;

  for (const update of extraction.updates) {
    const entry: ProfileEntry = { value: update.value, evidence: update.evidence, updatedAt: now };

    if (isScalarField(update.field)) {
      const field = update.field;
      const current = next[field];
      if (update.op === "remove") {
        if (current && update.explicitChange) {
          next[field] = null;
          applied++;
        }
      } else if (current && sameValue(current.value, update.value)) {
        next[field] = { ...current, evidence: update.evidence, updatedAt: now };
      } else {
        next[field] = entry;
        applied++;
      }
      continue;
    }

    const field = update.field;
    const list = next[field];
    const index = list.findIndex((e) => sameValue(e.value, update.value));
    if (update.op === "remove") {
      if (index >= 0 && update.explicitChange) {
        list.splice(index, 1);
        applied++;
      }
    } else if (index >= 0) {
      list[index] = { ...list[index], evidence: update.evidence, updatedAt: now };
    } else {
      list.push(entry);
      applied++;
    }
  }

  return { profile: TravelProfileSchema.parse(next), applied };
}
