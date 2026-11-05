import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getConfig } from "@/server/config";
import { createMockChatModel, createMockExtractionModel } from "@/server/llm/mock";

/**
 * The only place that knows which provider is in use. Callers ask for a model
 * by role; swapping providers (or using a cheaper model for extraction) is a
 * change here only.
 *
 * Precondition: getConfig().llmProblem is null (routes check this first).
 */
function realModel(): LanguageModel {
  const { provider, apiKey, model } = getConfig();
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "google":
      return createGoogle({ apiKey })(model);
    case "mock":
      throw new Error("realModel() called in mock mode");
  }
}

export function chatModel(): LanguageModel {
  return getConfig().provider === "mock" ? createMockChatModel() : realModel();
}

export function extractionModel(): LanguageModel {
  return getConfig().provider === "mock" ? createMockExtractionModel() : realModel();
}
