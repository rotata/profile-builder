import { Workspace } from "@/components/Workspace";
import { getAppState } from "@/server/domain/state";

// Reads SQLite on every request; never prerender.
export const dynamic = "force-dynamic";

export default function Home() {
  return <Workspace initialState={getAppState()} />;
}
