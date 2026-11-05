import { createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { getConfig } from "@/server/config";
import { runTurn } from "@/server/domain/turn";
import { jsonError, readJson } from "@/server/http";
import { ChatRequestSchema } from "@/shared/contract";

/** POST /api/chat — ChatRequest in, UI message stream out (see shared/contract.ts). */
export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const headers = { "x-request-id": requestId };

  const parsed = ChatRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return jsonError(400, { code: "invalid_request", message: z.prettifyError(parsed.error) }, headers);
  }

  const problem = getConfig().llmProblem;
  if (problem) {
    return jsonError(503, { code: "llm_not_configured", message: problem }, headers);
  }

  const stream = runTurn({ userText: parsed.data.message, requestId });
  return createUIMessageStreamResponse({ stream, headers });
}
