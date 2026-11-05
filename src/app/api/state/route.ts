import { getAppState } from "@/server/domain/state";
import { json } from "@/server/http";
import type { AppState } from "@/shared/contract";

/** GET /api/state — AppState (messages, profile, conflicts). */
export function GET() {
  return json<AppState>(getAppState());
}
