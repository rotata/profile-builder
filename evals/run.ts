/**
 * Live eval: scripted conversations through the real turn pipeline
 * (streaming chat + tool calls + extraction + conflict rules), in-process,
 * against a throwaway in-memory database.
 *
 *   npm run eval                    # uses .env.local (needs OPENAI_API_KEY)
 *   LLM_PROVIDER=mock npm run eval  # harness self-check, no key
 *
 * E2E tests prove the wiring with a scripted model; this measures the real
 * model's judgment. Not run in CI (needs a key, costs tokens, non-deterministic).
 */
import { resetConfigForTests, getConfig } from "@/server/config";
import { closeDbForTests, conflictsRepo, profileRepo } from "@/server/db";
import { runTurn } from "@/server/domain/turn";
import type { Conflict, DestinationLookup, TravelProfile } from "@/shared/contract";

process.env.DATABASE_PATH = ":memory:";
process.env.LOG_SILENT = "1";

type TurnOutput = { text: string; lookups: DestinationLookup[]; error?: string };
type Outcome = { replies: TurnOutput[]; profile: TravelProfile; conflicts: Conflict[] };
type Check = [label: string, pass: boolean];
type Case = { name: string; turns: string[]; checks: (o: Outcome) => Check[] };

const values = (profile: TravelProfile, field: keyof TravelProfile): string[] => {
  const v = profile[field];
  if (v === null) return [];
  return (Array.isArray(v) ? v : [v]).map((e) => e.value.toLowerCase());
};
const last = (o: Outcome) => o.replies[o.replies.length - 1];

const CASES: Case[] = [
  {
    name: "implicit contradiction becomes a conflict",
    turns: ["I'm vegetarian and I love food-focused trips.", "Can you recommend the best steakhouse in Buenos Aires?"],
    checks: (o) => [
      ["dietary still has vegetarian", values(o.profile, "dietary").includes("vegetarian")],
      ["an open conflict exists on dietary", o.conflicts.some((c) => c.existingField === "dietary")],
    ],
  },
  {
    name: "explicit change of mind is applied, not flagged",
    turns: ["I'm vegetarian.", "Actually, I started eating meat again last year."],
    checks: (o) => [
      ["vegetarian removed", !values(o.profile, "dietary").includes("vegetarian")],
      ["no open conflicts", o.conflicts.length === 0],
    ],
  },
  {
    name: "budget tier inferred from behavior",
    turns: ["We always stay in hostels and live on street food to keep costs down."],
    checks: (o) => [
      ["budgetTier = budget", values(o.profile, "budgetTier").includes("budget")],
      ["street food is an interest, not a dietary restriction", !values(o.profile, "dietary").some((v) => v.includes("street food"))],
    ],
  },
  {
    name: "known destination: tool called and its data used",
    turns: ["I'm dreaming about a trip to Kyoto."],
    checks: (o) => [
      ["getDestinationInfo found Kyoto", last(o).lookups.some((l) => l.found && l.name === "Kyoto")],
      ["reply uses a tool fact", /spring|fall|autumn|temple|shrine|kaiseki|tofu|garden|\$\s?180|ryokan|nishiki|inari/i.test(last(o).text)],
      ["Kyoto saved as destination of interest", values(o.profile, "destinationsOfInterest").includes("kyoto")],
    ],
  },
  {
    name: "unknown destination: tool called, no invented facts",
    turns: ["What do you think about Lisbon?"],
    checks: (o) => [
      ["getDestinationInfo called and not found", last(o).lookups.some((l) => !l.found && /lisbon/i.test(l.query))],
      ["no prices in reply", !/\$\s?\d/.test(last(o).text)],
      ["admits missing data", /don'?t have|no (curated )?(destination )?data|not (sure|familiar)|can'?t (speak|say)/i.test(last(o).text)],
    ],
  },
];

async function sendTurn(text: string): Promise<TurnOutput> {
  const out: TurnOutput = { text: "", lookups: [] };
  const reader = runTurn({ userText: text, requestId: `eval-${crypto.randomUUID()}` }).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "text-delta") out.text += value.delta;
    else if (value.type === "data-lookup") out.lookups.push(value.data);
    else if (value.type === "error") out.error = value.errorText;
  }
  return out;
}

async function runCase(c: Case) {
  closeDbForTests(); // fresh in-memory DB per case
  const startedAt = Date.now();
  const replies: TurnOutput[] = [];
  for (const turn of c.turns) replies.push(await sendTurn(turn));
  const outcome: Outcome = { replies, profile: profileRepo.get(), conflicts: conflictsRepo.listOpen() };
  const errors = replies.flatMap((r) => (r.error ? [r.error] : []));
  const checks: Check[] = errors.length ? [[`no errors (${errors.join("; ")})`, false]] : c.checks(outcome);
  return { name: c.name, checks, ms: Date.now() - startedAt, lastReply: last(outcome).text };
}

async function main() {
  resetConfigForTests();
  const config = getConfig();
  if (config.llmProblem) {
    console.error(`Cannot run eval: ${config.llmProblem}`);
    process.exit(2);
  }
  console.log(`Eval — provider=${config.provider} model=${config.model}\n`);

  let passed = 0;
  let total = 0;
  for (const c of CASES) {
    const result = await runCase(c);
    const ok = result.checks.every(([, pass]) => pass);
    console.log(`${ok ? "PASS" : "FAIL"}  ${result.name}  (${(result.ms / 1000).toFixed(1)}s)`);
    for (const [label, pass] of result.checks) {
      total++;
      if (pass) passed++;
      console.log(`      ${pass ? "✓" : "✗"} ${label}`);
    }
    if (!ok) console.log(`      last reply: ${JSON.stringify(result.lastReply.slice(0, 240))}`);
  }
  console.log(`\n${passed}/${total} checks passed`);
  process.exit(passed === total ? 0 : 1);
}

void main();
