# Profile Builder

A single-page app where a traveler chats with an assistant and the assistant builds a durable **travel profile** from the
conversation. Replies stream token-by-token. Preferences are extracted into a typed profile shown beside the chat. Destinations
are looked up with `getDestinationInfo`. A statement that contradicts the profile becomes a **conflict for the traveler to resolve**,
never a silent overwrite.

Next.js 16 · TypeScript · AI SDK 7 · OpenAI (configurable) · SQLite (`node:sqlite`) · zod · Vitest · Playwright

---

## Run it (under 5 minutes)

Requires **Node ≥ 22.13** (uses the built-in `node:sqlite`; tested on Node 24 in CI and Node 26 locally). No native modules.

```bash
npm install
cp .env.example .env.local      # then set OPENAI_API_KEY in .env.local
npm run dev                     # http://localhost:3000
```

**No API key?** Run against the built-in scripted model. Everything works (streaming, tool calls, extraction, conflicts), but the
replies come from a script:

```bash
LLM_PROVIDER=mock npm run dev               # macOS/Linux
$env:LLM_PROVIDER="mock"; npm run dev       # Windows PowerShell
```

Try: *"I'm vegetarian and I travel solo"* → *"I've been thinking about Kyoto"* → *"What about Lisbon?"* → *"Can you recommend a
great steakhouse?"*

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest): conflict rules, extraction guards, destination lookup, DB, route boundaries |
| `npm run test:e2e` | Playwright against a production build with the mock model (no key, deterministic) |
| `npm run eval` | Live eval: 5 scripted conversations against the real model (needs a key) |
| `npm run typecheck` / `npm run lint` | Types / lint |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests and E2E on every push. It needs no secrets.

## Provider & configuration

| Env var | Default | |
|---|---|---|
| `LLM_PROVIDER` | `openai` | `openai` or `mock` |
| `OPENAI_API_KEY` | – | Required for `openai`. Only ever in `.env.local` (gitignored); never logged |
| `LLM_MODEL` | `gpt-4.1-mini` | Any OpenAI model with tool calling + structured outputs |
| `DATABASE_PATH` | `data/profile.db` | Created on first run (gitignored) |

**Why OpenAI `gpt-4.1-mini`:** the whole design leans on two capabilities, reliable tool calls (destinations) and strict structured
outputs (extraction). A small OpenAI model does both well at low cost. Free OpenRouter models were the alternative; their
tool-call reliability varies, which would show up directly as missed lookups and failed extractions. Swapping providers is a
change in one file (`src/server/llm/provider.ts`).

**Failure modes:**

| Situation | What the user sees |
|---|---|
| Key missing / bad env | Chat returns `503 llm_not_configured`; banner names the env var. History and profile still load. |
| Key rejected (401/403) | `llm_auth_failed` banner: "The API key was rejected" |
| Model not found (404) | `llm_not_configured`: check `LLM_MODEL` |
| Account out of credits (OpenAI 429 `insufficient_quota`) | `llm_quota_exceeded`: "add credits or switch provider". Kept separate from rate limits because retrying can't fix it |
| Rate limit / 5xx / network | SDK retries (2×), then `llm_unavailable` with **Try again**. A turn that failed before any text is not saved, so retrying can't duplicate history |
| Stream dies mid-reply | Partial reply kept, marked `interrupted`; extraction skipped for that turn |
| Extraction fails / returns junk | Reply stands; profile untouched; small "couldn't update your profile" notice |

Every model call and tool call logs one JSON line to stdout (`requestId`, model, latency, token counts, tool name, found, extraction
outcome, and the reasons any proposed changes were dropped).

## How it works

```
Browser ── POST /api/chat {message} ──▶ route (validate, config check)
                                          │
                                          ▼
                           domain/turn.ts  runTurn()
   1. load history + profile + open conflicts from SQLite
   2. streamText (tools: getDestinationInfo) ──▶ text deltas + data-lookup chips ──▶ browser
   3. persist user + assistant message (one transaction)
   4. extraction call (generateText + Output.object) ──▶ sanitize ──▶ conflicts.ts applyExtraction
   5. persist profile / new conflicts / resolutions (one transaction)
   6. data-turn {profile, conflicts} ──▶ browser, then finish
```

```
src/
  shared/contract.ts        zod schemas + inferred types for everything on the wire (the API contract)
  app/api/*/route.ts        transport only: parse → one domain call → serialize
  server/domain/            business logic, no HTTP
    turn.ts                 the turn lifecycle above
    extraction.ts           extraction call + output guards (schema, per-field values, grounding)
    conflicts.ts            ALL profile-mutation and conflict rules (pure, table-tested)
    destinations.ts         getDestinationInfo + data for 6 destinations
    state.ts                read state, reset, resolve conflict
  server/llm/               provider selection, prompts, tool adapter, error mapping, mock model
  server/db.ts              node:sqlite, validated reads, additive migration
  components/               Workspace (state owner), Chat, ProfilePanel, ConflictCard
```

### API

| Endpoint | In | Out |
|---|---|---|
| `GET /api/state` | – | `AppState { messages, profile, conflicts }` |
| `POST /api/chat` | `ChatRequest { message }` | UI message stream: text deltas, `data-lookup`, final `data-turn { profile, conflicts, extraction }` |
| `POST /api/conflicts/:id/resolve` | `{ choice: "keep" \| "replace" }` | `ProfileState { profile, conflicts }` |
| `POST /api/reset` | – | empty `AppState` |
| any error | – | `ApiError { code, message }` (also used as the error text of stream error chunks) |

The client sends only the new message. **History is server-owned**, so the client can't rewrite it and there's one source of truth.

## Decisions & trade-offs

- **Profile fields.** Six single-value fields (home base, budget tier, pace, companions, trip length, accessibility) and six lists
  (interests, dislikes, dietary, accommodation, seasons, destinations of interest). The test for inclusion: is it *durable*
  (true across trips), and does it change what you'd recommend? Budget tier and seasons deliberately match the fields
  `getDestinationInfo` returns, so the assistant can connect the two. Excluded: dates, documents, loyalty numbers (trip-specific or
  sensitive). **Every value stores the traveler's own words** (`evidence`), shown on hover. That makes extraction auditable and
  conflicts explainable.
- **Interview, don't draft.** The assistant asks one focused question per turn and reflects back what it heard. Drafting a profile
  and asking for corrections invites hallucinated preferences, which is exactly what the brief probes for.
- **Two calls: stream the reply, then extract.** A flaky extraction can never break the chat, and the reply isn't delayed by
  it. The cost is a second call per turn, plus the chat model not knowing about a contradiction until the *next* turn (the UI
  card shows it immediately).
- **Extraction output is untrusted.** Three gates: SDK schema validation; per-field value validation (enums); and **grounding**,
  meaning the quoted evidence must actually appear in the traveler's message (normalized, with 80% word overlap to tolerate light
  paraphrase). Anything failing a gate is dropped and logged. Malformed output gets one retry.
- **Native tool calling for destinations** (not app-side name matching). App-side matching only catches places you already have
  data for, so unknown places would never reach the tool's `null` path, and the model would talk about them unchecked. The
  tool returns `{found:false, instruction}` instead of a bare `null`, so "don't state facts, ask what draws them" travels with the
  result. The tool result feeds the same multi-step generation, so the follow-up is written *after* reading it.
- **Conflicts: the model proposes, `conflicts.ts` decides.**
  - *Explicit* changes ("actually, I eat meat now") apply directly.
  - *Implicit* contradictions (vegetarian → "best steakhouse?"; luxury → "hostels only"; liking something listed under dislikes)
    become conflicts, and the old value is kept.
  - Model-reported contradictions are only accepted if the "existing" value really is in the profile.
  - A field with an open conflict is frozen except to explicit statements.
  - The traveler can resolve a conflict with **Keep / Replace** on the card, or just by answering the assistant (which asks about
    open conflicts next turn).
  - The logic lives in one pure module with a test per rule; the other modules only store, render, or prompt.
- **The end-of-turn event carries the profile.** The updated profile and conflicts ride on the chat stream as the last event, so
  there's no refetch and no race. The server sends `finish` only after persisting; the reload E2E caught the SDK's default
  ordering losing turns.
- **SQLite via `node:sqlite`.** No ORM and no native addon to compile (better-sqlite3 can need a C++ toolchain on new Node
  versions, which breaks "runs in 5 minutes"). The profile is one JSON snapshot row, validated on read; a corrupt row degrades
  to empty and is logged, rather than crashing.
- **A mock model that speaks the real protocol.** It makes real tool calls and composes its replies *from* the tool result, so E2E
  can assert that tool-only facts reach the reply. It proves wiring, not judgment; that's what `npm run eval` is for.

## Known gaps

- **Live-model verification.** Built against the AI SDK 7 docs and type definitions, and exercised via the mock. Run
  `npm run eval` with a key to measure the real model; results go in PROCESS.md.
- A conflict the traveler "kept" can be raised again by a later, similar message. There's no memory of dismissed
  contradictions yet.
- The profile only updates at the end of each turn, not live during streaming.
- Earlier tool results aren't replayed into later turns' history (only the text is), so the model may re-look-up a destination.
- The grounding check is lexical. A correct extraction from a heavy paraphrase can be dropped (by design: false negatives
  over invented preferences).
- If the client disconnects mid-stream, the turn may still complete and persist server-side.
- Single user, no auth (per brief).

## With another day

- Remember dismissed conflicts (don't re-ask "kept" ones), and show a profile change history with undo.
- A confidence score per extraction; low-confidence values shown as "please confirm" rather than saved.
- Run extraction incrementally during the stream for live profile updates.
- Grow the eval: more cases, run it over several models, and use a model to judge follow-up quality ("did it use a tool fact
  to fill a gap?").
- Prompt caching for the static instructions, and a cheaper model for extraction (the role split already exists in
  `provider.ts`).
