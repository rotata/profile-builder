import { messagesRepo, profileRepo, transaction } from "@/server/db";
import type { AppState } from "@/shared/contract";

/** Everything the page needs to render, read in one place. */
export function getAppState(): AppState {
  return { messages: messagesRepo.list(), profile: profileRepo.get() };
}

/** "Start over": single-user app, so this clears everything. */
export function resetAppState(): AppState {
  transaction(() => {
    messagesRepo.clear();
    profileRepo.clear();
  });
  return getAppState();
}
