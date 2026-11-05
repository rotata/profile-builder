import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import { resetConfigForTests } from "@/server/config";
import { ApiErrorSchema } from "@/shared/contract";

afterEach(() => {
  vi.unstubAllEnvs();
  resetConfigForTests();
});

function post(body: unknown) {
  return POST(
    new Request("http://test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/chat boundaries", () => {
  it("rejects an empty message with a typed 400", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const res = await post({ message: "   " });
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("invalid_request");
  });

  it("rejects malformed JSON instead of throwing", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const res = await post("{not json");
    expect(res.status).toBe(400);
  });

  it("returns 503 llm_not_configured when the OpenAI key is missing", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await post({ message: "hello" });
    expect(res.status).toBe(503);
    const error = ApiErrorSchema.parse(await res.json());
    expect(error.code).toBe("llm_not_configured");
    expect(error.message).toMatch(/OPENAI_API_KEY/);
  });
});
