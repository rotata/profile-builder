import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig, resetConfigForTests } from "@/server/config";

afterEach(() => {
  vi.unstubAllEnvs();
  resetConfigForTests();
});

describe("getConfig", () => {
  it("reports an actionable problem when the OpenAI key is missing", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(getConfig().llmProblem).toMatch(/OPENAI_API_KEY is not set/);
  });

  it("needs no key in mock mode", () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(getConfig()).toMatchObject({ provider: "mock", llmProblem: null });
  });

  it("surfaces an invalid provider instead of crashing", () => {
    vi.stubEnv("LLM_PROVIDER", "nope");
    expect(getConfig().llmProblem).toMatch(/Invalid environment/);
  });
});
