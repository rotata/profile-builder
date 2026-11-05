/**
 * The client/server contract. Every payload that crosses the network is a zod
 * schema here, and TypeScript types are inferred from the schemas, so the two
 * sides cannot drift. UI components import only from this module, never from
 * src/server.
 */
import { z } from "zod";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** POST /api/chat body. History is server-owned: the client sends only the new message. */
export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, "Message is empty").max(2000, "Message is too long"),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** A persisted chat message, as returned by GET /api/state. */
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  /** "interrupted" = the stream died mid-reply; the partial text was kept. */
  status: z.enum(["complete", "interrupted"]),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/** GET /api/state and POST /api/reset response: everything the page needs to render. */
export const AppStateSchema = z.object({
  messages: z.array(ChatMessageSchema),
});
export type AppState = z.infer<typeof AppStateSchema>;

/** Custom data parts streamed alongside the assistant's text. */
export type AppDataParts = Record<string, never>;

/** The message shape useChat works with (text parts + our data parts). */
export type AppUIMessage = UIMessage<never, AppDataParts>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const API_ERROR_CODES = [
  "llm_not_configured", // no API key / bad env → fix setup
  "llm_auth_failed", // provider rejected the key
  "llm_unavailable", // rate limit, timeout, provider outage → retry later
  "invalid_request", // client sent something invalid
  "not_found",
  "internal",
] as const;

export const ApiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Errors reach the client either as a non-2xx JSON body or as the errorText of
 * a stream error chunk; the server serializes ApiError in both cases. This
 * turns whatever arrived back into an ApiError.
 */
export function parseApiError(raw: unknown): ApiError {
  const text = raw instanceof Error ? raw.message : String(raw);
  try {
    const parsed = ApiErrorSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // not JSON — fall through
  }
  return { code: "internal", message: text || "Something went wrong." };
}
