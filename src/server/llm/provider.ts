import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getConfig } from "@/server/config";
import { createMockChatModel } from "@/server/llm/mock";

/**
 * The only place that knows which provider is in use. Callers ask for a model
 * by role; swapping providers (or models per role) is a change here only.
 *
 * Precondition: getConfig().llmProblem is null (routes check this first).
 */
export function chatModel(): LanguageModel {
  const config = getConfig();
  if (config.provider === "mock") return createMockChatModel();
  return createOpenAI({ apiKey: config.openaiApiKey })(config.model);
}
