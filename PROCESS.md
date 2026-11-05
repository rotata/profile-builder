# Process

How this was built: tools, sessions, the decisions that mattered, and what I'd change.

> ✍️ **Before submitting:** sections marked ✍️ are for you to write in your own words. The highlights below are a factual
> draft taken from the session; edit them so they reflect *your* reasoning. Remove this note.

## Sessions & transcripts

| # | Tool | What happened | File |
|---|---|---|---|
| 1 | *(other agent — fill in)* | Earlier exploration (v0.1/v0.2 prototypes) and the *Travel Identity Agent Design Review v1.2.0* | `transcripts/01-…` |
| 2 | Claude Code (VS Code) | Validated v1.2.0 against the brief → plan v1.3 (`docs/PLAN.md`) → built V0.1–V0.8 with tests | `transcripts/02-claude-code.jsonl` |

Spec files: `docs/PLAN.md` (v1.3, including the "Revisions during build" appendix). The superseded v1.2.0 review is in `transcripts/`.

## Annotated highlights

### 1. "Validate the plan and ask any questions on it"
- **Trying to:** decide whether to build the existing v1.2.0 plan as-is.
- **Got back:** the core call was right (prove the loop first, defer the ORM, event bus, and CI-database work), but there were
  ten gaps against the brief. The two serious ones:
  - "Don't create the GitHub repo until Step D" works against commit history, which the brief weights second.
  - Matching only the 5 hardcoded destination names means unknown places never reach `getDestinationInfo`, so its `null`
    path never runs, and the model talks freely about places it has no data for.
  - Smaller ones: a refetch-after-turn race; extraction seeing only the newest message (a bare "yes" extracts nothing); no
    profile fields defined; conflicts left entirely to the model, with no resolution path.
- **Kept / changed:** kept the simplification thesis. Chose native tool calling, conflicts that show a card *and* get resolved
  with buttons *and* get raised by the assistant, and OpenAI. *(Traits: "build last if time" — later cut; see #2.)*

### 2. "Create a new plan with the updates… address testing, use Playwright"
- **Trying to:** fold the review into a plan that also has a real testing story.
- **Got back:** four questions:
  1. How should E2E deal with a non-deterministic LLM?
  2. Add a live eval?
  3. Accept going over 2 hours?
  4. Add CI?
- **Kept / changed:** E2E against a **scripted mock model only** (deterministic, keyless, runs in CI). A **small live eval** for
  model judgment. **Trim to 2 hours.** Plan lives in the repo, with CI. Trimming cut the travel-identity traits entirely,
  rather than leaving them half-built.

### 3. Picking the SQLite driver (during setup)
- **Trying to:** keep "runs in under 5 minutes from a clean clone" true.
- **Got back:** the machine runs Node 26. `better-sqlite3` is a native addon that may have no prebuilt binary there, and
  compiling it needs a C++ toolchain on Windows.
- **Kept / changed:** used Node's built-in `node:sqlite` behind `db.ts` instead (no native dependencies; requires Node ≥ 22.13).
  Recorded in the plan.

### 4. The scaffold's defaults (V0.1)
- **Got back:** create-next-app (Next 16) turned on `cacheComponents`. The bundled docs say GET route handlers that don't touch a
  Next "dynamic API" can then be **prerendered at build time**. Ours read SQLite synchronously, so a stale profile could be baked in.
- **Kept / changed:** turned it off, with a comment explaining why. Also dropped Google Fonts so builds work offline.

### 5. A race the reload test caught (V0.3)
- **What happened:** the "conversation survives a reload" E2E failed. The SDK sends its `finish` chunk as soon as the model
  stream ends. The client treats that as "turn done", but we persisted *after* it, so a quick reload lost the turn.
- **Kept / changed:** suppressed the SDK's finish and send our own after the transaction commits. The test helper now waits for
  the chat's `ready` status rather than for the input to clear.

### 6. Deviating from the plan: when to save the user's message (V0.3)
- **Plan said:** persist the user message first.
- **Changed to:** save user + assistant together at the end, and only if the assistant produced text. Otherwise a provider
  failure leaves a dangling user message, and "Try again" duplicates it in history. A mid-reply failure keeps the partial reply,
  marked `interrupted`.

### 7. Treating extraction output as untrusted (V0.4)
- **Decision:** three gates before anything touches the profile: schema, per-field value, and grounding (the evidence quote must
  appear in the traveler's message). Store that evidence with every value and show it on hover.
- **Why:** "robust to the LLM occasionally being weird" was an explicit criterion, and an invented preference is the worst
  failure for a profile product. Trade-off accepted: the lexical grounding check can drop a correct extraction from a heavy paraphrase.

### 8. Conflict bugs the tests found (V0.6)
- **Casing bug:** re-asserting `"LUXURY"` replaced the canonical enum value `luxury` and broke re-validation. Refreshes now keep
  the stored spelling.
- **Re-raise bug:** "The steakhouse is for a friend" resolved the conflict *and* re-raised it in the same message. Conflicts
  settled in a message are now exempt from being raised by it (a unit test pins this).
- **Mock bug:** the mock extractor scraped the literal `<open_conflicts>` text out of the *system* prompt. It now reads only the
  user message, like a real model's input.

### 9. Not tuning the mock to pass the eval (V0.8)
- **What happened:** running the eval harness against the mock gives 9/11. It fails "started eating meat again" (explicit change)
  and "hostels → budget" (inference).
- **Kept:** the failures. That gap is the point: E2E proves wiring with a scripted model, the eval measures judgment. Making
  the mock smarter would only blur the two.

### 10. First live run: the error message was wrong
- **What happened:** the first real OpenAI call failed with "You have no credits remaining" (a 429). The app said "busy, try
  again", because every 429 was mapped to "transient".
- **Changed:** added `llm_quota_exceeded` for credit and daily-quota exhaustion, kept separate from rate limits. Also added Gemini
  as a provider with a free tier, and handled its quirks: an invalid key is a 400, and per-minute free-tier limits also say
  "quota". Unit tests use real-shaped error bodies.

### 11. The live eval caught a prompt that was too literal
- **What happened:** 10/11 on the first live run. For *"We always stay in hostels and live on street food to keep costs down"*
  the chat model even *said* "you lean towards budget travel", but extraction set no `budgetTier`. Inspecting the raw output
  showed nothing was dropped by the guards: the model never proposed it, because the prompt said "only extract what the traveler
  states". It also filed "street food" under `dietary`.
- **Changed:** one prompt exception for unambiguous behavioral signals on enum fields (evidence still required, so the grounding
  guard still applies). `dietary` is defined as restrictions only. Added an eval check for the dietary mix-up. Also tightened "exactly
  one question" after the live reply asked two.
- **Result:** 12/12 on two consecutive runs (gpt-4.1-mini).

### 12. Tooling slip
- A PowerShell one-liner used to edit a test file re-encoded it (an em dash became `â€”`, and a BOM was added). Caught in the diff
  notice; rewrote the file and stopped using shell commands for file edits.

## Reflection

### Overall approach
Planned first: reviewed the existing plan against the brief, wrote v1.3, then built in checkpoints, one commit or more per
checkpoint, with tests added in the same commit as the behavior.
> ✍️ Did you let the agent drive or stay in tight control, and why?

### What I reviewed by hand vs. trusted
Facts you can state:
- Every checkpoint passed `typecheck`, `lint`, unit tests and Playwright before committing.
- **Live model (OpenAI gpt-4.1-mini):** a manual turn via the running app streamed 67 deltas, called `getDestinationInfo("Kyoto")`,
  used its data in the reply, and extracted 3 grounded fields. `npm run eval` gave 10/11 on the first run, then 12/12 twice after the
  prompt fix in #11. Five cases is a smoke test, not a statistically meaningful eval.
- **Gemini path:** built and unit-tested (config, error mapping), but **not run live**. The OpenAI account was topped up before a
  Gemini key was added.
> ✍️ Say which files you read line by line (suggested: `conflicts.ts`, `extraction.ts`, `turn.ts`, `contract.ts`) and which you skimmed.

### What I'd do differently
> ✍️ Your call. Candidates: run the live model earlier, before the mock existed, to calibrate the prompts; track time per checkpoint.

### If this served 10k requests/hour
- **Model choice:** route by role. Keep the chat model small; use a cheaper or fine-tuned model for extraction, and skip extraction
  entirely on turns a cheap classifier marks as having no durable content.
- **Prompting:** cache the static system/instruction prefix (prompt caching), and send a profile summary rather than
  full history after N turns.
- **Schema:** version the profile schema; move from a JSON snapshot to an events/changes table (gives history and undo for free,
  and lets you audit extractions).
- **Evals:** grow `evals/` into a regression suite (hundreds of labeled conversations) run per prompt or model change, tracking
  precision and recall per field, false-conflict rate, tool-call rate on destination mentions, and hallucinated-fact rate on
  unknown destinations. Sample production traffic for model-graded review.
- **Ops:** the JSON logs already carry a `requestId`; ship them to a tracing backend. Add per-user rate limits, a provider
  fallback, and a circuit breaker. Move off SQLite to Postgres once there's more than one instance.

## Time spent
> ✍️ Approximate total, and where it went if over 2 hours.
