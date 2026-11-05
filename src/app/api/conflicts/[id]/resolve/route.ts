import { z } from "zod";
import { resolveConflictById } from "@/server/domain/state";
import { json, jsonError, readJson } from "@/server/http";
import { type ProfileState, ResolveConflictRequestSchema } from "@/shared/contract";

/** POST /api/conflicts/:id/resolve — ResolveConflictRequest in, ProfileState out. */
export async function POST(req: Request, ctx: RouteContext<"/api/conflicts/[id]/resolve">) {
  const { id } = await ctx.params;
  const parsed = ResolveConflictRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return jsonError(400, { code: "invalid_request", message: z.prettifyError(parsed.error) });
  }
  const result = resolveConflictById(id, parsed.data.choice);
  if (!result) {
    return jsonError(404, { code: "not_found", message: "That conflict is already resolved or doesn't exist." });
  }
  return json<ProfileState>(result);
}
