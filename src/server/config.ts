import { z } from "zod";

/**
 * Environment parsing. Read once per process; never throws at import time so
 * the app (profile, history) still loads when the LLM is misconfigured — the
 * chat route reports `llm_not_configured` instead.
 */
export const PROVIDERS = ["openai", "google", "mock"] as const;
export type Provider = (typeof PROVIDERS)[number];

const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-4.1-mini",
  google: "gemini-2.5-flash",
  mock: "mock",
};

/** Which env var holds the key for each real provider. */
const KEY_VARS = {
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
} as const;

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);

const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(PROVIDERS).default("openai"),
  LLM_MODEL: optionalString,
  OPENAI_API_KEY: optionalString,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
  DATABASE_PATH: z.string().min(1).default("data/profile.db"),
});

export type AppConfig = {
  provider: Provider;
  model: string;
  /** API key for the selected provider (undefined for mock). */
  apiKey: string | undefined;
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
      apiKey: undefined,
      databasePath: "data/profile.db",
      llmProblem: `Invalid environment: ${z.prettifyError(parsed.error)}`,
    };
    return cached;
  }
  const env = parsed.data;
  const provider = env.LLM_PROVIDER;
  const keyVar = provider === "mock" ? null : KEY_VARS[provider];
  const apiKey = keyVar ? env[keyVar] : undefined;
  cached = {
    provider,
    model: provider === "mock" ? "mock" : (env.LLM_MODEL ?? DEFAULT_MODELS[provider]),
    apiKey,
    databasePath: env.DATABASE_PATH,
    llmProblem:
      keyVar && !apiKey
        ? `${keyVar} is not set (LLM_PROVIDER=${provider}). Add it to .env.local, or run with LLM_PROVIDER=mock to try the app without a key.`
        : null,
  };
  return cached;
}

/** Test hook: re-read process.env on next access. */
export function resetConfigForTests() {
  cached = undefined;
}
