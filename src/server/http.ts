import type { ApiError } from "@/shared/contract";

/** Typed JSON responses for route handlers. */
export function json<T>(body: T, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export function jsonError(status: number, error: ApiError, headers?: HeadersInit): Response {
  return Response.json(error, { status, headers });
}

/** Reads a JSON body without throwing on malformed input. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
