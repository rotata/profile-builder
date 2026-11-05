import { messagesRepo, transaction } from "@/server/db";
import type { AppState } from "@/shared/contract";

/** Everything the page needs to render, read in one place. */
export function getAppState(): AppState {
  return { messages: messagesRepo.list() };
}

/** "Start over": single-user app, so this clears everything. */
export function resetAppState(): AppState {
  transaction(() => {
    messagesRepo.clear();
  });
  return getAppState();
}
