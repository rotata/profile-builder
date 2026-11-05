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

  it("maps Gemini's invalid-key 400 to llm_auth_failed", () => {
    const body = '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
    expect(toApiError(apiError(400, body)).code).toBe("llm_auth_failed");
  });

  it("treats a free-tier per-minute 429 as transient, a per-day one as quota", () => {
    const perMinute =
      '{"error":{"message":"You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 10","details":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"},{"retryDelay":"21s"}]}}';
    const perDay =
      '{"error":{"message":"You exceeded your current quota.","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}';
    expect(toApiError(apiError(429, perMinute)).code).toBe("llm_unavailable");
    expect(toApiError(apiError(429, perDay)).code).toBe("llm_quota_exceeded");
  });

  it("maps 5xx to llm_unavailable", () => {
    expect(toApiError(apiError(503, "")).code).toBe("llm_unavailable");
  });
});
