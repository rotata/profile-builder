import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { toApiError } from "@/server/llm/errors";

function apiError(statusCode: number, responseBody: string, message = "provider error") {
  return new APICallError({ message, url: "https://api.example", requestBodyValues: {}, statusCode, responseBody });
}

describe("toApiError", () => {
  it("maps 401 to llm_auth_failed", () => {
    expect(toApiError(apiError(401, "{}")).code).toBe("llm_auth_failed");
  });

  it("distinguishes out-of-credits (a 429) from a transient rate limit", () => {
    const quota = apiError(429, '{"error":{"code":"insufficient_quota"}}', "You have no credits remaining.");
    expect(toApiError(quota).code).toBe("llm_quota_exceeded");
    expect(toApiError(apiError(429, '{"error":{"code":"rate_limit_exceeded"}}')).code).toBe("llm_unavailable");
  });

  it("unwraps the SDK's RetryError to classify the last attempt", () => {
    const quota = apiError(429, "insufficient_quota");
    const retry = new RetryError({ message: "failed after 3 attempts", reason: "maxRetriesExceeded", errors: [quota, quota] });
    expect(toApiError(retry).code).toBe("llm_quota_exceeded");
  });

  it("maps 5xx to llm_unavailable", () => {
    expect(toApiError(apiError(503, "")).code).toBe("llm_unavailable");
  });
});
