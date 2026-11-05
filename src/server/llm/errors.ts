import { APICallError, RetryError } from "ai";
import type { ApiError } from "@/shared/contract";

/**
 * Maps provider/SDK failures onto the small set of codes the UI knows how to
 * explain. Messages are user-facing: no stack traces, no keys.
 */
export function toApiError(error: unknown): ApiError {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(cause)) {
    const status = cause.statusCode;
    if (status === 401 || status === 403) {
      return {
        code: "llm_auth_failed",
        message: "The LLM provider rejected the API key. Check OPENAI_API_KEY in .env.local.",
      };
    }
    if (status === 404) {
      return {
        code: "llm_not_configured",
        message: "The configured model was not found. Check LLM_MODEL in .env.local.",
      };
    }
    if (status === 429 || (status !== undefined && status >= 500) || cause.isRetryable) {
      return {
        code: "llm_unavailable",
        message: "The LLM provider is busy or unreachable. Please try again in a moment.",
      };
    }
  }

  if (cause instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(cause.message)) {
    return {
      code: "llm_unavailable",
      message: "Couldn't reach the LLM provider. Check your network and try again.",
    };
  }

  return { code: "internal", message: "Something went wrong while generating a reply." };
}

export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
