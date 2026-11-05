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

  it("uses the Gemini key and a Gemini default model for LLM_PROVIDER=google", () => {
    vi.stubEnv("LLM_PROVIDER", "google");
    vi.stubEnv("LLM_MODEL", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    expect(getConfig()).toMatchObject({ provider: "google", model: "gemini-2.5-flash", apiKey: "test-key", llmProblem: null });
  });

  it("names the Gemini key when it's missing", () => {
    vi.stubEnv("LLM_PROVIDER", "google");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    expect(getConfig().llmProblem).toMatch(/GOOGLE_GENERATIVE_AI_API_KEY is not set/);
  });

  it("surfaces an invalid provider instead of crashing", () => {
    vi.stubEnv("LLM_PROVIDER", "nope");
    expect(getConfig().llmProblem).toMatch(/Invalid environment/);
  });
});
