/**
 * Structured JSON-lines logging to stdout. One line per LLM call, tool call,
 * and notable domain event, all carrying the turn's requestId so a single turn
 * can be reconstructed with `grep <requestId>`.
 *
 * Never pass secrets or full prompts here.
 */
export type LogEvent =
  | {
      kind: "llm.chat" | "llm.extract";
      requestId: string;
      model: string;
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
      finishReason?: string;
      error?: string;
    }
  | {
      kind: "tool.getDestinationInfo";
      requestId: string;
      name: string;
      found: boolean;
      latencyMs: number;
      error?: string;
    }
  | {
      kind: "turn.extraction";
      requestId: string;
      outcome: "applied" | "no_changes" | "failed" | "skipped";
      applied?: number;
      conflicts?: number;
      dropped?: string[];
      error?: string;
    }
  | { kind: "turn.error"; requestId: string; code: string; error: string };

export function log(event: LogEvent) {
  if (process.env.LOG_SILENT === "1") return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}
