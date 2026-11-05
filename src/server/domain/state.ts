import { conflictsRepo, messagesRepo, profileRepo, transaction } from "@/server/db";
import { resolveConflict } from "@/server/domain/conflicts";
import type { AppState, ProfileState } from "@/shared/contract";

/** Everything the page needs to render, read in one place. */
export function getAppState(): AppState {
  return { messages: messagesRepo.list(), profile: profileRepo.get(), conflicts: conflictsRepo.listOpen() };
}

/** "Start over": single-user app, so this clears everything. */
export function resetAppState(): AppState {
  transaction(() => {
    messagesRepo.clear();
    profileRepo.clear();
    conflictsRepo.clear();
  });
  return getAppState();
}

/** Keep/Replace from the conflict card. Returns null if the conflict isn't open (unknown or already resolved). */
export function resolveConflictById(id: string, choice: "keep" | "replace"): ProfileState | null {
  return transaction(() => {
    const conflict = conflictsRepo.get(id);
    if (!conflict || conflict.status !== "open") return null;
    const now = new Date().toISOString();
    const { profile, status } = resolveConflict(profileRepo.get(), conflict, choice, now);
    profileRepo.save(profile);
    conflictsRepo.resolve(id, status, now);
    return { profile, conflicts: conflictsRepo.listOpen() };
  });
}
