import { describe, expect, it } from "vitest";
import { applyExtraction, resolveConflict } from "@/server/domain/conflicts";
import type { ExtractionResult } from "@/server/domain/extraction";
import { type Conflict, emptyProfile, type TravelProfile, TravelProfileSchema } from "@/shared/contract";

const NOW = "2026-11-04T12:00:00.000Z";
let counter = 0;
const newId = () => `c${++counter}`;

/** Fixtures go through the real schema, so a bad fixture fails loudly. */
function profileWith(patch: Partial<Record<keyof TravelProfile, unknown>>): TravelProfile {
  return TravelProfileSchema.parse({ ...emptyProfile(), ...patch });
}
const e = (value: string, evidence = value) => ({ value, evidence, updatedAt: "earlier" });

type Update = ExtractionResult["updates"][number];
const u = (field: Update["field"], op: Update["op"], value: string, explicitChange = false): Update => ({
  field,
  op,
  value,
  evidence: `said ${value}`,
  explicitChange,
});
const extraction = (p: Partial<ExtractionResult>): ExtractionResult => ({
  updates: [],
  contradictions: [],
  resolutions: [],
  ...p,
});
const apply = (profile: TravelProfile, x: Partial<ExtractionResult>, open: Conflict[] = []) =>
  applyExtraction(profile, open, extraction(x), NOW, newId);

const openConflict = (patch: Partial<Conflict> = {}): Conflict => ({
  id: "open-1",
  field: "dietary",
  existingField: "dietary",
  existingValue: "vegetarian",
  candidateValue: "",
  evidence: "best steakhouse",
  reason: "r",
  status: "open",
  createdAt: "earlier",
  resolvedAt: null,
  ...patch,
});

describe("applyExtraction — updates", () => {
  it("applies a value to an empty field", () => {
    const r = apply(emptyProfile(), { updates: [u("budgetTier", "set", "luxury")] });
    expect(r.profile.budgetTier?.value).toBe("luxury");
    expect(r.applied).toBe(1);
    expect(r.newConflicts).toEqual([]);
  });

  it("refreshes evidence without counting a change for the same value", () => {
    const r = apply(profileWith({ budgetTier: e("luxury") }), { updates: [u("budgetTier", "set", "LUXURY")] });
    expect(r.applied).toBe(0);
    expect(r.profile.budgetTier).toMatchObject({ value: "luxury", evidence: "said LUXURY" });
  });

  it("applies an explicit change to a scalar", () => {
    const r = apply(profileWith({ budgetTier: e("luxury") }), { updates: [u("budgetTier", "set", "budget", true)] });
    expect(r.profile.budgetTier?.value).toBe("budget");
    expect(r.newConflicts).toEqual([]);
  });

  it("raises a conflict (and keeps the old value) for an implicit scalar change", () => {
    const r = apply(profileWith({ budgetTier: e("luxury", "only five-star") }), {
      updates: [u("budgetTier", "set", "budget")],
    });
    expect(r.profile.budgetTier?.value).toBe("luxury");
    expect(r.newConflicts).toHaveLength(1);
    expect(r.newConflicts[0]).toMatchObject({
      field: "budgetTier",
      existingValue: "luxury",
      candidateValue: "budget",
      status: "open",
    });
    expect(r.newConflicts[0].reason).toContain("only five-star");
  });

  it("raises a cross-field conflict when adding an interest listed under dislikes", () => {
    const r = apply(profileWith({ dislikes: [e("hiking")] }), { updates: [u("interests", "add", "Hiking")] });
    expect(r.profile.interests).toEqual([]);
    expect(r.newConflicts[0]).toMatchObject({ field: "interests", existingField: "dislikes", existingValue: "hiking" });
  });

  it("moves a value across lists on an explicit change", () => {
    const r = apply(profileWith({ dislikes: [e("hiking")] }), { updates: [u("interests", "add", "hiking", true)] });
    expect(r.profile.dislikes).toEqual([]);
    expect(r.profile.interests.map((x) => x.value)).toEqual(["hiking"]);
  });

  it("ignores removals that weren't explicit", () => {
    const r = apply(profileWith({ dietary: [e("vegetarian")] }), { updates: [u("dietary", "remove", "vegetarian")] });
    expect(r.profile.dietary).toHaveLength(1);
    expect(r.ignored[0]).toMatch(/without explicit change/);
  });

  it("applies explicit removals", () => {
    const r = apply(profileWith({ dietary: [e("vegetarian")] }), { updates: [u("dietary", "remove", "vegetarian", true)] });
    expect(r.profile.dietary).toEqual([]);
  });
});

describe("applyExtraction — model-reported contradictions", () => {
  const steakhouse = {
    field: "dietary" as const,
    existingValue: "vegetarian",
    candidateValue: "",
    evidence: "best steakhouse",
    reason: "Steakhouse vs vegetarian.",
  };

  it("raises a conflict without touching the profile", () => {
    const r = apply(profileWith({ dietary: [e("vegetarian")] }), { contradictions: [steakhouse] });
    expect(r.profile.dietary.map((x) => x.value)).toEqual(["vegetarian"]);
    expect(r.newConflicts[0]).toMatchObject({ existingValue: "vegetarian", candidateValue: "" });
  });

  it("ignores a contradiction against a value the profile doesn't have", () => {
    const r = apply(emptyProfile(), { contradictions: [steakhouse] });
    expect(r.newConflicts).toEqual([]);
    expect(r.ignored[0]).toMatch(/not in the profile/);
  });

  it("does not duplicate an already-open conflict", () => {
    const r = apply(profileWith({ dietary: [e("vegetarian")] }), { contradictions: [steakhouse] }, [openConflict()]);
    expect(r.newConflicts).toEqual([]);
  });
});

describe("applyExtraction — open conflicts", () => {
  it("freezes a field with an open conflict against implicit updates", () => {
    const r = apply(profileWith({ dietary: [e("vegetarian")] }), { updates: [u("dietary", "add", "pescatarian")] }, [
      openConflict(),
    ]);
    expect(r.profile.dietary.map((x) => x.value)).toEqual(["vegetarian"]);
    expect(r.ignored[0]).toMatch(/open conflict/);
  });

  it("lets an explicit change through and supersedes the conflict", () => {
    const r = apply(profileWith({ dietary: [e("vegetarian")] }), { updates: [u("dietary", "remove", "vegetarian", true)] }, [
      openConflict(),
    ]);
    expect(r.profile.dietary).toEqual([]);
    expect(r.resolved).toEqual([{ id: "open-1", status: "superseded" }]);
  });

  it("applies a resolution the traveler gave in chat", () => {
    const r = apply(profileWith({ dietary: [e("vegetarian")] }), { resolutions: [{ conflictId: "open-1", choice: "keep" }] }, [
      openConflict(),
    ]);
    expect(r.resolved).toEqual([{ id: "open-1", status: "kept" }]);
    expect(r.profile.dietary).toHaveLength(1);
  });

  it("doesn't re-raise a conflict the same message just resolved", () => {
    const r = apply(
      profileWith({ dietary: [e("vegetarian")] }),
      {
        resolutions: [{ conflictId: "open-1", choice: "keep" }],
        contradictions: [
          { field: "dietary", existingValue: "vegetarian", candidateValue: "", evidence: "steakhouse", reason: "r" },
        ],
      },
      [openConflict()],
    );
    expect(r.resolved).toEqual([{ id: "open-1", status: "kept" }]);
    expect(r.newConflicts).toEqual([]);
  });

  it("ignores a resolution for a conflict that isn't open", () => {
    const r = apply(emptyProfile(), { resolutions: [{ conflictId: "nope", choice: "replace" }] });
    expect(r.resolved).toEqual([]);
  });
});

describe("resolveConflict", () => {
  it("keep leaves the profile untouched", () => {
    const profile = profileWith({ dietary: [e("vegetarian")] });
    expect(resolveConflict(profile, openConflict(), "keep")).toEqual({ profile, status: "kept" });
  });

  it("replace with an empty candidate removes the old value", () => {
    const r = resolveConflict(profileWith({ dietary: [e("vegetarian")] }), openConflict(), "replace", NOW);
    expect(r).toMatchObject({ status: "replaced" });
    expect(r.profile.dietary).toEqual([]);
  });

  it("replace swaps a scalar to the candidate, keeping the triggering words as evidence", () => {
    const conflict = openConflict({
      field: "budgetTier",
      existingField: "budgetTier",
      existingValue: "luxury",
      candidateValue: "budget",
      evidence: "hostels only",
    });
    const r = resolveConflict(profileWith({ budgetTier: e("luxury") }), conflict, "replace", NOW);
    expect(r.profile.budgetTier).toEqual({ value: "budget", evidence: "hostels only", updatedAt: NOW });
  });
});
