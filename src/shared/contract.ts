/**
 * The client/server contract. Every payload that crosses the network is a zod
 * schema here, and TypeScript types are inferred from the schemas, so the two
 * sides cannot drift. UI components import only from this module, never from
 * src/server.
 */
import { z } from "zod";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Travel profile
// ---------------------------------------------------------------------------

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;
export const SeasonSchema = z.enum(SEASONS);
export const BudgetTierSchema = z.enum(["budget", "midRange", "luxury"]);
export const TravelPaceSchema = z.enum(["relaxed", "balanced", "packed"]);
export const CompanionsSchema = z.enum(["solo", "partner", "family", "friends"]);
export const TripLengthSchema = z.enum(["weekend", "oneWeek", "twoWeeks", "longer"]);

const freeText = z.string().trim().min(1).max(80);

/** Fields holding one value at a time — a new value can contradict the old one. */
export const SCALAR_FIELDS = ["homeBase", "budgetTier", "travelPace", "companions", "tripLength", "accessibility"] as const;
/** Fields holding a set of values. */
export const LIST_FIELDS = [
  "interests",
  "dislikes",
  "dietary",
  "accommodation",
  "preferredSeasons",
  "destinationsOfInterest",
] as const;
export const PROFILE_FIELDS = [...SCALAR_FIELDS, ...LIST_FIELDS] as const;

export type ScalarField = (typeof SCALAR_FIELDS)[number];
export type ListField = (typeof LIST_FIELDS)[number];
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** Allowed values per field. Used to validate LLM output before it touches the profile. */
export const FIELD_VALUE_SCHEMAS = {
  homeBase: freeText,
  budgetTier: BudgetTierSchema,
  travelPace: TravelPaceSchema,
  companions: CompanionsSchema,
  tripLength: TripLengthSchema,
  accessibility: freeText,
  interests: freeText,
  dislikes: freeText,
  dietary: freeText,
  accommodation: freeText,
  preferredSeasons: SeasonSchema,
  destinationsOfInterest: freeText,
} satisfies Record<ProfileField, z.ZodType<string>>;

export function isScalarField(field: ProfileField): field is ScalarField {
  return (SCALAR_FIELDS as readonly string[]).includes(field);
}

/**
 * Every value remembers the traveler's own words that produced it, so the UI
 * can show *why* the assistant believes something and conflicts are explainable.
 */
const entry = <T extends z.ZodType<string>>(value: T) =>
  z.object({ value, evidence: z.string(), updatedAt: z.string() });

export const TravelProfileSchema = z.object({
  homeBase: entry(FIELD_VALUE_SCHEMAS.homeBase).nullable(),
  budgetTier: entry(BudgetTierSchema).nullable(),
  travelPace: entry(TravelPaceSchema).nullable(),
  companions: entry(CompanionsSchema).nullable(),
  tripLength: entry(TripLengthSchema).nullable(),
  accessibility: entry(FIELD_VALUE_SCHEMAS.accessibility).nullable(),
  interests: z.array(entry(freeText)),
  dislikes: z.array(entry(freeText)),
  dietary: z.array(entry(freeText)),
  accommodation: z.array(entry(freeText)),
  preferredSeasons: z.array(entry(SeasonSchema)),
  destinationsOfInterest: z.array(entry(freeText)),
});
export type TravelProfile = z.infer<typeof TravelProfileSchema>;
export type ProfileEntry = { value: string; evidence: string; updatedAt: string };

export function emptyProfile(): TravelProfile {
  return {
    homeBase: null,
    budgetTier: null,
    travelPace: null,
    companions: null,
    tripLength: null,
    accessibility: null,
    interests: [],
    dislikes: [],
    dietary: [],
    accommodation: [],
    preferredSeasons: [],
    destinationsOfInterest: [],
  };
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/**
 * A new statement that contradicts an existing profile value. The profile is
 * NOT changed until the traveler resolves it (button or chat).
 */
export const ConflictSchema = z.object({
  id: z.string(),
  /** Field the candidate value would go into. */
  field: z.enum(PROFILE_FIELDS),
  /** Field holding the existing value — differs from `field` for cross-field
   *  conflicts (e.g. liking something listed under dislikes). */
  existingField: z.enum(PROFILE_FIELDS),
  existingValue: z.string(),
  /** "" means "the existing value would simply be removed". */
  candidateValue: z.string(),
  /** The traveler's words that triggered the conflict. */
  evidence: z.string(),
  reason: z.string(),
  /** kept / replaced = resolved by the traveler; superseded = a later explicit statement settled it. */
  status: z.enum(["open", "kept", "replaced", "superseded"]),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type Conflict = z.infer<typeof ConflictSchema>;

/** POST /api/conflicts/:id/resolve body. */
export const ResolveConflictRequestSchema = z.object({ choice: z.enum(["keep", "replace"]) });
export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequestSchema>;

/** POST /api/conflicts/:id/resolve response. */
export const ProfileStateSchema = z.object({
  profile: TravelProfileSchema,
  /** Open conflicts only. */
  conflicts: z.array(ConflictSchema),
});
export type ProfileState = z.infer<typeof ProfileStateSchema>;

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** POST /api/chat body. History is server-owned: the client sends only the new message. */
export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, "Message is empty").max(2000, "Message is too long"),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** A getDestinationInfo call made while generating a reply (shown as a chip). */
export const DestinationLookupSchema = z.object({
  /** What the model asked for. */
  query: z.string(),
  /** Canonical name if found, else the query. */
  name: z.string(),
  found: z.boolean(),
});
export type DestinationLookup = z.infer<typeof DestinationLookupSchema>;

/** A persisted chat message, as returned by GET /api/state. */
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  lookups: z.array(DestinationLookupSchema),
  /** "interrupted" = the stream died mid-reply; the partial text was kept. */
  status: z.enum(["complete", "interrupted"]),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/** GET /api/state and POST /api/reset response: everything the page needs to render. */
export const AppStateSchema = z.object({
  messages: z.array(ChatMessageSchema),
  profile: TravelProfileSchema,
  /** Open conflicts only. */
  conflicts: z.array(ConflictSchema),
});
export type AppState = z.infer<typeof AppStateSchema>;

/**
 * Outcome of the post-reply extraction step, sent as the last event of the
 * chat stream so the UI updates without a refetch (and without racing it).
 */
export const TurnResultSchema = z.object({
  profile: TravelProfileSchema,
  /** Open conflicts after this turn. */
  conflicts: z.array(ConflictSchema),
  extraction: z.enum(["applied", "no_changes", "failed", "skipped"]),
});
export type TurnResult = z.infer<typeof TurnResultSchema>;

export type TurnEvent = { phase: "extracting" } | { phase: "done"; result: TurnResult };

/** Custom data parts streamed alongside the assistant's text (as `data-<key>`). */
export type AppDataParts = {
  turn: TurnEvent;
  lookup: DestinationLookup;
};

/** The message shape useChat works with (text parts + our data parts). */
export type AppUIMessage = UIMessage<never, AppDataParts>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const API_ERROR_CODES = [
  "llm_not_configured", // no API key / bad env → fix setup
  "llm_auth_failed", // provider rejected the key
  "llm_unavailable", // rate limit, timeout, provider outage → retry later
  "invalid_request", // client sent something invalid
  "not_found",
  "internal",
] as const;

export const ApiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Errors reach the client either as a non-2xx JSON body or as the errorText of
 * a stream error chunk; the server serializes ApiError in both cases. This
 * turns whatever arrived back into an ApiError.
 */
export function parseApiError(raw: unknown): ApiError {
  const text = raw instanceof Error ? raw.message : String(raw);
  try {
    const parsed = ApiErrorSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // not JSON — fall through
  }
  return { code: "internal", message: text || "Something went wrong." };
}
