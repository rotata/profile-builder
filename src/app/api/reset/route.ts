import { resetAppState } from "@/server/domain/state";
import { json } from "@/server/http";
import type { AppState } from "@/shared/contract";

/** POST /api/reset — clears the conversation and profile; returns the empty AppState. */
export function POST() {
  return json<AppState>(resetAppState());
}
