/**
 * The one place that decides how proposed changes become profile state, and
 * when they must instead become a conflict for the traveler to resolve.
 * Pure functions: no I/O, no model calls — fully unit-testable.
 *
 * Rules (see docs/PLAN.md §8):
 *   - empty field                      → apply
 *   - same value                       → refresh evidence only
 *   - scalar differs, explicit change  → apply ("actually, I'm on a budget now")
 *   - scalar differs, implicit         → CONFLICT, keep the old value
 *   - list add that's in the opposite list (interests ↔ dislikes) → CONFLICT
 *   - remove without explicit change   → ignore
 *   - model-reported contradiction     → CONFLICT (only if the "existing" value really exists)
 *   - field with an open conflict      → frozen: only an explicit change gets through,
 *                                        and it supersedes the open conflict
 *   - model-reported resolution of an open conflict (traveler answered in chat) → resolve it
 */
import type { ExtractionResult, ProfileUpdate } from "@/server/domain/extraction";
import {
  type Conflict,
  FIELD_VALUE_SCHEMAS,
  isScalarField,
  type ListField,
  type ProfileEntry,
  type ProfileField,
  type ScalarField,
  type TravelProfile,
  TravelProfileSchema,
} from "@/shared/contract";

/** Field-generic view of the profile. Re-validated against TravelProfileSchema on the way out. */
type ProfileShape = Record<ScalarField, ProfileEntry | null> & Record<ListField, ProfileEntry[]>;

type Resolution = { id: string; status: "kept" | "replaced" | "superseded" };

export type ApplyResult = {
  profile: TravelProfile;
  /** Number of updates/resolutions that changed the profile. */
  applied: number;
  newConflicts: Conflict[];
  resolved: Resolution[];
  /** Human-readable reasons for proposals that were not acted on (for logs). */
  ignored: string[];
};

const OPPOSITE_LIST: Partial<Record<ProfileField, ListField>> = { interests: "dislikes", dislikes: "interests" };

export function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function conflictKey(c: Pick<Conflict, "field" | "existingField" | "existingValue" | "candidateValue">): string {
  return [c.existingField, c.existingValue, c.field, c.candidateValue].map((s) => s.toLowerCase()).join("|");
}

function findEntry(profile: ProfileShape, field: ProfileField, value: string): ProfileEntry | undefined {
  if (isScalarField(field)) {
    const entry = profile[field];
    return entry && sameValue(entry.value, value) ? entry : undefined;
  }
  return profile[field].find((e) => sameValue(e.value, value));
}

function removeValue(profile: ProfileShape, field: ProfileField, value: string): boolean {
  if (isScalarField(field)) {
    if (profile[field] && sameValue(profile[field].value, value)) {
      profile[field] = null;
      return true;
    }
    return false;
  }
  const index = profile[field].findIndex((e) => sameValue(e.value, value));
  if (index < 0) return false;
  profile[field].splice(index, 1);
  return true;
}

/**
 * Sets (scalar) or adds (list). For an equal value (case-insensitive) only the
 * evidence is refreshed — the stored spelling is kept, so "LUXURY" can't
 * replace the canonical enum value "luxury". Returns true if the value changed.
 */
function putValue(profile: ProfileShape, field: ProfileField, entry: ProfileEntry): boolean {
  if (isScalarField(field)) {
    const current = profile[field];
    if (current && sameValue(current.value, entry.value)) {
      profile[field] = { ...entry, value: current.value };
      return false;
    }
    profile[field] = entry;
    return true;
  }
  const list = profile[field];
  const index = list.findIndex((e) => sameValue(e.value, entry.value));
  if (index >= 0) {
    list[index] = { ...entry, value: list[index].value };
    return false;
  }
  list.push(entry);
  return true;
}

/** Applies a resolution choice to a profile. Pure. */
export function resolveConflict(
  profile: TravelProfile,
  conflict: Conflict,
  choice: "keep" | "replace",
  now: string = new Date().toISOString(),
): { profile: TravelProfile; status: "kept" | "replaced" } {
  if (choice === "keep") return { profile, status: "kept" };
  const next = structuredClone(profile) as ProfileShape;
  removeValue(next, conflict.existingField, conflict.existingValue);
  if (conflict.candidateValue) {
    putValue(next, conflict.field, { value: conflict.candidateValue, evidence: conflict.evidence, updatedAt: now });
  }
  return { profile: TravelProfileSchema.parse(next), status: "replaced" };
}

export function applyExtraction(
  profile: TravelProfile,
  openConflicts: Conflict[],
  extraction: ExtractionResult,
  now: string = new Date().toISOString(),
  newId: () => string = () => crypto.randomUUID(),
): ApplyResult {
  let current = profile;
  let applied = 0;
  const resolved: Resolution[] = [];
  const ignored: string[] = [];
  const newConflicts: Conflict[] = [];

  // 1. The traveler answered an open conflict in chat.
  const openById = new Map(openConflicts.map((c) => [c.id, c]));
  // Conflicts settled in this very message must not be re-raised by it
  // ("the steakhouse is for a friend" both resolves and mentions a steakhouse).
  const settledKeys = new Set<string>();
  for (const { conflictId, choice } of extraction.resolutions) {
    const conflict = openById.get(conflictId);
    if (!conflict) {
      ignored.push(`resolution for unknown conflict ${conflictId}`);
      continue;
    }
    const result = resolveConflict(current, conflict, choice, now);
    current = result.profile;
    if (result.status === "replaced") applied++;
    resolved.push({ id: conflictId, status: result.status });
    settledKeys.add(conflictKey(conflict));
    openById.delete(conflictId);
  }

  const next = structuredClone(current) as ProfileShape;
  const stillOpen = () => [...openById.values()];
  const isFrozen = (field: ProfileField) => stillOpen().some((c) => c.field === field || c.existingField === field);

  const raise = (c: Omit<Conflict, "id" | "status" | "createdAt" | "resolvedAt">) => {
    const key = conflictKey(c);
    if (settledKeys.has(key) || [...stillOpen(), ...newConflicts].some((existing) => conflictKey(existing) === key)) {
      ignored.push(`duplicate conflict ${key}`);
      return;
    }
    newConflicts.push({ ...c, id: newId(), status: "open", createdAt: now, resolvedAt: null });
  };

  // 2. Proposed updates.
  for (const update of extraction.updates) {
    const label = `${update.op} ${update.field}=${JSON.stringify(update.value)}`;

    if (isFrozen(update.field)) {
      if (!update.explicitChange) {
        ignored.push(`${label}: field has an open conflict`);
        continue;
      }
      // An explicit statement settles any open conflict on this field.
      for (const c of stillOpen()) {
        if (c.field === update.field || c.existingField === update.field) {
          resolved.push({ id: c.id, status: "superseded" });
          openById.delete(c.id);
        }
      }
    }

    if (applyUpdate(next, update, now, raise, ignored)) applied++;
  }

  // 3. Semantic contradictions reported by the model.
  for (const c of extraction.contradictions) {
    const existing = findEntry(next, c.field, c.existingValue);
    if (!existing) {
      ignored.push(`contradiction on ${c.field}: "${c.existingValue}" is not in the profile`);
      continue;
    }
    const candidate = c.candidateValue.trim();
    if (candidate && !FIELD_VALUE_SCHEMAS[c.field].safeParse(candidate).success) {
      ignored.push(`contradiction on ${c.field}: invalid candidate "${candidate}"`);
      continue;
    }
    raise({
      field: c.field,
      existingField: c.field,
      existingValue: existing.value,
      candidateValue: candidate,
      evidence: c.evidence,
      reason: c.reason || `This doesn't match what you told me earlier (“${existing.evidence}”).`,
    });
  }

  return { profile: TravelProfileSchema.parse(next), applied, newConflicts, resolved, ignored };
}

/** Returns true if the profile changed. May raise a conflict instead of applying. */
function applyUpdate(
  profile: ProfileShape,
  update: ProfileUpdate,
  now: string,
  raise: (c: Omit<Conflict, "id" | "status" | "createdAt" | "resolvedAt">) => void,
  ignored: string[],
): boolean {
  const label = `${update.op} ${update.field}=${JSON.stringify(update.value)}`;
  const entry: ProfileEntry = { value: update.value, evidence: update.evidence, updatedAt: now };

  if (update.op === "remove") {
    if (!update.explicitChange) {
      ignored.push(`${label}: removal without explicit change`);
      return false;
    }
    return removeValue(profile, update.field, update.value) || (isScalarField(update.field) && clearScalar(profile, update.field));
  }

  if (isScalarField(update.field)) {
    const current = profile[update.field];
    if (current && !sameValue(current.value, update.value) && !update.explicitChange) {
      raise({
        field: update.field,
        existingField: update.field,
        existingValue: current.value,
        candidateValue: update.value,
        evidence: update.evidence,
        reason: `This doesn't match what you told me earlier (“${current.evidence}”).`,
      });
      return false;
    }
    return putValue(profile, update.field, entry);
  }

  const opposite = OPPOSITE_LIST[update.field];
  const clash = opposite ? profile[opposite].find((e) => sameValue(e.value, update.value)) : undefined;
  if (opposite && clash) {
    if (update.explicitChange) {
      removeValue(profile, opposite, clash.value);
      putValue(profile, update.field, entry);
      return true;
    }
    raise({
      field: update.field,
      existingField: opposite,
      existingValue: clash.value,
      candidateValue: update.value,
      evidence: update.evidence,
      reason: `Earlier you said “${clash.evidence}”.`,
    });
    return false;
  }

  return putValue(profile, update.field, entry);
}

/** "remove" on a scalar with a value that doesn't match: an explicit "forget my home base" still clears it. */
function clearScalar(profile: ProfileShape, field: ScalarField): boolean {
  if (!profile[field]) return false;
  profile[field] = null;
  return true;
}
