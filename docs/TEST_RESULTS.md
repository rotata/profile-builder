# Test results

Results run locally on 2026-11-04 (Windows 11, Node 26.13.0), updated after the prompt fixes described in
[Requirement walkthrough](#requirement-walkthrough-live-model). CI runs the same unit and E2E suites on Node 24; the live
eval is local-only because it needs an API key.

## Summary

| Suite | Command | Model | Result |
|---|---|---|---|
| Typecheck | `npm run typecheck` | – | ✅ clean |
| Lint | `npm run lint` | – | ✅ clean |
| Unit (Vitest) | `npm test` | none / scripted | ✅ **55 / 55** passed in 0.6s |
| End-to-end (Playwright, Chromium, production build) | `npm run test:e2e` | scripted mock | ✅ **12 / 12** passed in 45s |
| Live eval | `npm run eval` | OpenAI `gpt-4.1-mini` | ✅ **18 / 18** checks, 7 conversations |

**What each layer proves:**
- **Unit tests** cover the pure logic: conflict rules, extraction guards, destination lookup, error mapping, config, persistence, and
  input validation.
- **E2E** drives the real UI and server against a scripted model that speaks the real provider protocol, including real tool calls.
  That proves the *wiring* (streaming, tool round-trip, persistence, conflict UI) and gives the same result on every run.
- **The live eval** runs the real turn pipeline in-process against the real model. That measures *judgment*: does it call the tool,
  avoid inventing facts, and tell an explicit change of mind from an implicit contradiction?

## Coverage by requirement

| Requirement | Unit | E2E (mock) | Live eval |
|---|---|---|---|
| Streamed assistant responses | – | ✅ reply bubble sampled while streaming; passes through several states | ⚠️ checked by hand (67 chunks), not automated |
| Structured extraction | ✅ guards: grounding, enum values, field types | ✅ fields appear in the panel | ✅ inference + correct field |
| Persistence across reload | ✅ round-trip; corrupt message row skipped | ✅ chat, profile, lookup chips and conflicts survive reload; Start over clears | – |
| Read-only profile view | – | ✅ | – |
| Typed contract / boundary validation | ✅ `/api/chat`: empty, malformed, missing key | – | – |
| `getDestinationInfo` called; result used in follow-up | ✅ 6 destinations, aliases, accents, `City, Country` | ✅ reply contains tool-only facts ("$180 a day") | ✅ tool called, a tool fact in the reply |
| Unknown destination → no invented facts | ✅ returns `null` | ✅ "No data" chip + admission | ✅ tool called, no prices, admits missing data |
| Conflict detection, no silent overwrite | ✅ a case per rule (implicit/explicit, cross-field, frozen field, dedupe, chat resolution) | ✅ card shown, profile kept, Keep/Replace, resolve via chat, survives reload | ✅ steakhouse vs vegetarian |
| User changes their mind | ✅ | ✅ | ✅ |
| Missing/invalid key, quota, rate limits | ✅ OpenAI + Gemini error formats | ✅ provider failure → "Try again"; failed turn not saved | – |
| Runs from a clean clone | – | – | ⚠️ fresh clone: `npm ci` + typecheck + unit in 35s; E2E not run on the clone |

## Unit tests — 55 passed

| File | Tests | Covers |
|---|---|---|
| `conflicts.test.ts` | 19 | Every rule in `applyExtraction` + `resolveConflict` keep/replace |
| `destinations.test.ts` | 13 | ≥5 destinations; name normalization; `null` for unknown places (including "Paris Hilton") |
| `extraction.test.ts` | 7 | Grounding (verbatim, light paraphrase, invented claims); invalid enums; op normalization; ungrounded contradictions |
| `errors.test.ts` | 6 | 401; credits-429 vs rate-limit-429; RetryError unwrapping; Gemini invalid-key 400; per-minute vs per-day 429; 5xx |
| `config.test.ts` | 5 | Missing key message names the right variable; mock needs no key; Gemini defaults; invalid provider |
| `chat-route.test.ts` | 3 | Empty message → 400; malformed JSON → 400; missing key → 503 `llm_not_configured` |
| `db.test.ts` | 2 | Insertion order; corrupt row skipped and logged |

## End-to-end tests — 12 passed

| Spec | Test | Time |
|---|---|---|
| chat | assistant reply streams in incrementally | 2.0s |
| chat | a provider failure shows a recoverable error | 0.6s |
| conflicts | a contradiction is surfaced, not silently applied, and Replace resolves it | 6.5s |
| conflicts | answering the assistant in chat resolves the conflict | 6.1s |
| conflicts | conflicts survive a reload until resolved | 4.7s |
| destinations | a known destination triggers getDestinationInfo and the reply uses its data | 3.2s |
| destinations | an unknown destination is looked up, and the assistant admits it has no data | 1.9s |
| persistence | conversation survives a reload, and Start over clears it | 2.6s |
| persistence | a failed turn is not persisted | 0.7s |
| profile | preferences extracted from chat appear in the profile and persist | 2.5s |
| profile | an explicit change of mind updates the profile directly | 4.5s |
| shell | renders the chat and the profile panel side by side | 0.4s |

## Live eval — 18 / 18 checks (OpenAI gpt-4.1-mini)

| Case | Checks | Time |
|---|---|---|
| Implicit contradiction becomes a conflict | dietary still vegetarian ✅ · open conflict on dietary ✅ | 6.1s |
| Explicit change of mind is applied, not flagged | vegetarian removed ✅ · no open conflicts ✅ | 4.2s |
| Budget tier inferred from behavior | budgetTier = budget ✅ · street food not filed as dietary ✅ | 2.1s |
| **Brief example:** boutique hotels, spends more on food | boutique hotels in accommodation ✅ · food in interests ✅ · nothing in dietary ✅ | 2.4s |
| **Brief example:** vegetarian → "I plan my trips around steakhouses" → "Sounds good." | vegetarian kept ✅ · conflict still open after a vague reply ✅ · assistant asks about the contradiction ✅ | 6.7s |
| Known destination: tool called and data used | Kyoto found ✅ · reply uses a tool fact ✅ · Kyoto saved ✅ | 3.4s |
| Unknown destination: no invented facts | lookup called, not found ✅ · no prices ✅ · admits missing data ✅ | 3.0s |

**Run history:**
1. First live run: **10/11**. Budget wasn't inferred from "hostels… to keep costs down", and "street food" was filed under
   `dietary`. Root cause: the extraction prompt was too literal. See PROCESS.md #11.
2. After that fix: **12/12** on three consecutive runs.
3. Walking through the brief's exact examples by hand found three more problems (see below). After fixing them and adding
   both examples as eval cases: **18/18**.

## Requirement walkthrough (live model)

Each requirement's example was run by hand against the running app on gpt-4.1-mini.

| # | Requirement | Before the fix | After the fix |
|---|---|---|---|
| 1 | Streaming conversation | ✅ replies arrive as 56–67 incremental chunks | ✅ |
| 2 | "I usually stay in boutique hotels and spend more money on food than accommodation." | ⚠️ only `accommodation: boutique hotels`; the food priority was lost | ✅ `accommodation: boutique hotels`, `interests: food` |
| 3 | Persistence across reload | ✅ (E2E) | ✅ |
| 4 | Visible read-only profile | ✅ (E2E) | ✅ |
| 5 | Typed contracts: browser ↔ API ↔ model ↔ persistence | ✅ zod schemas in `shared/contract.ts` (API), `ExtractionResultSchema` (model output), validated reads in `db.ts` | ✅ |
| 6 | Destination tool influences the next question | ✅ "Marrakech… souks, riads… do you enjoy staying in traditional riads?" | ✅ |
| 7 | "I'm vegetarian." → "I plan my trips around steakhouses." | ⚠️ conflict recorded and profile kept, but the reply explained it away ("even if you won't eat the steak"), and the next turn didn't raise it | ✅ turn 2: *"you identify as vegetarian but plan trips around steakhouses… is vegetarian your strict diet, or are you flexible?"* |
| 7b | Vague "Sounds good." while a conflict is open | ⚠️ was recorded as `travelPace: relaxed` (answering an either/or question) | ✅ nothing extracted; conflict stays open; assistant re-asks |
| 7c | Real answer: "the steakhouses are for my partner — I'm still vegetarian" | – | ✅ conflict resolved as *keep*; vegetarian stays |
| 8 | README + PROCESS | ✅ README; PROCESS.md drafted (the author's reflection sections are still to be written) | – |

Against the scripted mock (`LLM_PROVIDER=mock npm run eval`), the harness scores 9/11 by design. The mock's keyword rules lack the
judgment the two inference cases test.

**Caveat:** 5 conversations and 3 runs is a smoke test, not a statistically meaningful evaluation.

## Not covered (known gaps)

| Gap | Risk | How it would be tested |
|---|---|---|
| Extraction fails or returns junk → "couldn't update" notice; one retry on malformed output | Medium | Mock trigger that makes extraction throw or return invalid JSON; E2E checks the notice |
| Stream dies mid-reply → partial reply saved as `interrupted`, extraction skipped | Medium | Mock trigger that errors after some text; check persisted status |
| Destination tool throws → treated as "not found" | Low | Unit test on the tool adapter with a throwing lookup |
| `POST /api/conflicts/:id/resolve` boundaries (invalid body 400, unknown/resolved id 404) | Low | Route unit tests, like `chat-route.test.ts` |
| Corrupt profile row → empty profile | Low | Unit test, like the corrupt-message test |
| Real-model conflict judgment beyond the dietary example: scalar conflict (luxury → "hostels only"), likes vs dislikes; chat resolution is verified by hand only | Medium | 2–3 more eval cases |
| Streaming against the real model, automated | Low | Eval check that a reply arrives as several text chunks |
| JSON logs, "Updating…" indicator | Low | Checked by eye only |
| Gemini provider against the live API | Medium | Same eval with `LLM_PROVIDER=google` and a key |
| Two destinations in one message | Low | Eval case ("Kyoto or Bangkok?") |

## Reproduce

```bash
npm ci
npm run typecheck && npm run lint
npm test                         # unit
npx playwright install chromium  # once
npm run test:e2e                 # E2E (builds the app, uses the mock model, no key)
npm run eval                     # live eval (needs a key in .env.local)
```
