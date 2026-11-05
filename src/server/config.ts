import { z } from "zod";

/**
 * Environment parsing. Read once per process; never throws at import time so
 * the app (profile, history) still loads when the LLM is misconfigured — the
 * chat route reports `llm_not_configured` instead.
 */
const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  LLM_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_API_KEY: z.string().trim().optional(),
  DATABASE_PATH: z.string().min(1).default("data/profile.db"),
});

export type AppConfig = {
  provider: "openai" | "mock";
  model: string;
  openaiApiKey: string | undefined;
  databasePath: string;
  /** null when the LLM is usable; otherwise a human-actionable reason. */
  llmProblem: string | null;
};

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only reachable with e.g. LLM_PROVIDER=foo. Surface it instead of crashing.
    cached = {
      provider: "mock",
      model: "mock",
      openaiApiKey: undefined,
      databasePath: "data/profile.db",
      llmProblem: `Invalid environment: ${z.prettifyError(parsed.error)}`,
    };
    return cached;
  }
  const env = parsed.data;
  const key = env.OPENAI_API_KEY || undefined;
  cached = {
    provider: env.LLM_PROVIDER,
    model: env.LLM_PROVIDER === "mock" ? "mock" : env.LLM_MODEL,
    openaiApiKey: key,
    databasePath: env.DATABASE_PATH,
    llmProblem:
      env.LLM_PROVIDER === "openai" && !key
        ? "OPENAI_API_KEY is not set. Add it to .env.local, or run with LLM_PROVIDER=mock to try the app without a key."
        : null,
  };
  return cached;
}

/** Test hook: re-read process.env on next access. */
export function resetConfigForTests() {
  cached = undefined;
}
