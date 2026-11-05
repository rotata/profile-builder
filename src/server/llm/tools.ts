/**
 * Adapters that expose domain functions to the model as tools.
 */
import { tool } from "ai";
import { z } from "zod";
import { type DestinationInfo, getDestinationInfo } from "@/server/domain/destinations";
import { describeError } from "@/server/llm/errors";
import { log } from "@/server/log";
import type { DestinationLookup } from "@/shared/contract";

/** What the model sees. `found: false` carries an explicit instruction, not just a null. */
export type DestinationToolResult =
  | { found: true; info: DestinationInfo }
  | { found: false; name: string; instruction: string };

const NO_DATA_INSTRUCTION =
  "No curated data for this destination. Do not state facts about it (seasons, prices, visas, attractions). Say you don't have data on it and ask what draws the traveler there.";

export function createDestinationTool({
  requestId,
  onLookup,
}: {
  requestId: string;
  onLookup: (lookup: DestinationLookup) => void;
}) {
  return tool({
    description:
      "Look up curated travel data (best seasons, what it's known for, typical daily budget, visa notes, highlights) for one specific destination. Call this for EVERY specific city or region the traveler mentions, before saying anything factual about it.",
    inputSchema: z.object({
      name: z.string().min(1).describe('The destination as the traveler named it, e.g. "Kyoto".'),
    }),
    execute: async ({ name }): Promise<DestinationToolResult> => {
      const startedAt = Date.now();
      try {
        const info = await getDestinationInfo(name);
        log({ kind: "tool.getDestinationInfo", requestId, name, found: info !== null, latencyMs: Date.now() - startedAt });
        onLookup({ query: name, name: info?.name ?? name, found: info !== null });
        return info ? { found: true, info } : { found: false, name, instruction: NO_DATA_INSTRUCTION };
      } catch (error) {
        // Treated exactly like "unknown destination": the model must not improvise facts.
        log({
          kind: "tool.getDestinationInfo",
          requestId,
          name,
          found: false,
          latencyMs: Date.now() - startedAt,
          error: describeError(error),
        });
        onLookup({ query: name, name, found: false });
        return { found: false, name, instruction: NO_DATA_INSTRUCTION };
      }
    },
  });
}
