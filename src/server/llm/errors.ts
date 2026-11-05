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
    const detail = `${cause.responseBody ?? ""} ${cause.message}`;

    // OpenAI: 401. Gemini: 400 "API key not valid" / 403.
    if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key not valid|API_KEY_INVALID/i.test(detail))) {
      return {
        code: "llm_auth_failed",
        message: "The LLM provider rejected the API key. Check the key in .env.local.",
      };
    }
    if (status === 429) {
      // Free tiers (e.g. Gemini) rate-limit per minute with a "quota" message — transient.
      if (/PerMinute|per minute|retryDelay/i.test(detail) && !/PerDay|per day/i.test(detail)) {
        return {
          code: "llm_unavailable",
          message: "Hit the provider's per-minute rate limit (free tiers allow only a few requests a minute). Wait a moment and try again.",
        };
      }
      // Out of credits / daily quota — retrying soon won't help.
      if (/insufficient_quota|no credits|exceeded your current quota|quota exceeded|billing|RESOURCE_EXHAUSTED/i.test(detail)) {
        return {
          code: "llm_quota_exceeded",
          message: "The LLM provider account is out of credits or quota. Add credits, wait for the quota to reset, or switch provider/model in .env.local.",
        };
      }
      return {
        code: "llm_unavailable",
        message: "The LLM provider is rate-limiting requests. Please try again in a moment.",
      };
    }
    if (status === 404) {
      return {
        code: "llm_not_configured",
        message: "The configured model was not found. Check LLM_MODEL in .env.local.",
      };
    }
    if ((status !== undefined && status >= 500) || cause.isRetryable) {
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
