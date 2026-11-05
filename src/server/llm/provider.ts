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
function openaiModel(): LanguageModel {
  const config = getConfig();
  return createOpenAI({ apiKey: config.openaiApiKey })(config.model);
}

export function chatModel(): LanguageModel {
  return getConfig().provider === "mock" ? createMockChatModel() : openaiModel();
}

export function extractionModel(): LanguageModel {
  return getConfig().provider === "mock" ? createMockExtractionModel() : openaiModel();
}
