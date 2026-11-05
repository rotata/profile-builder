"use client";

import { useState } from "react";
import { displayValue, FIELD_LABELS } from "@/components/profileLabels";
import {
  type Conflict,
  parseApiError,
  type ProfileState,
  ProfileStateSchema,
  type ResolveConflictRequest,
} from "@/shared/contract";

type ConflictCardProps = {
  conflict: Conflict;
  onResolved: (state: ProfileState) => void;
};

/** Shows both sides of a contradiction and lets the traveler decide. Nothing changes until they do. */
export function ConflictCard({ conflict, onResolved }: ConflictCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = displayValue(conflict.existingValue);
  const replaceLabel = conflict.candidateValue
    ? `Change to ${displayValue(conflict.candidateValue)}`
    : `Remove ${existing}`;

  async function resolve(choice: ResolveConflictRequest["choice"]) {
    setPending(true);
    setError(null);
    try {
      const body: ResolveConflictRequest = { choice };
      const res = await fetch(`/api/conflicts/${conflict.id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onResolved(ProfileStateSchema.parse(await res.json()));
    } catch (e) {
      setError(parseApiError(e).message);
      setPending(false);
    }
  }

  return (
    <div role="group" aria-label="Profile conflict" data-testid="conflict-card" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-950">Did something change? · {FIELD_LABELS[conflict.existingField]}</p>
      <p className="mt-1 text-amber-900">
        Your profile says <strong>{existing}</strong>, but you just said “{conflict.evidence}”.
      </p>
      <p className="mt-1 text-xs text-amber-800">{conflict.reason}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => resolve("keep")}
          className="rounded-md border border-amber-400 bg-white px-2.5 py-1 font-medium disabled:opacity-50"
        >
          Keep {existing}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => resolve("replace")}
          className="rounded-md bg-amber-900 px-2.5 py-1 font-medium text-white disabled:opacity-50"
        >
          {replaceLabel}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
