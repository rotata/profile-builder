/**
 * Prompt text lives here so it can be reviewed (and diffed) as product copy,
 * separate from orchestration code.
 */
import { type Conflict, isScalarField, PROFILE_FIELDS, type TravelProfile } from "@/shared/contract";

/** The profile as the model should see it: values only, empty fields omitted. */
export function compactProfile(profile: TravelProfile): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const field of PROFILE_FIELDS) {
    if (isScalarField(field)) {
      const entry = profile[field];
      if (entry) out[field] = entry.value;
    } else {
      const values = profile[field].map((e) => e.value);
      if (values.length) out[field] = values;
    }
  }
  return out;
}

function describeConflict(c: Conflict): string {
  const change = c.candidateValue ? `change to "${c.candidateValue}"` : `remove "${c.existingValue}"`;
  return `- ${c.existingField}: profile says "${c.existingValue}", but the traveler said "${c.evidence}" (would ${change}). ${c.reason}`;
}

export function buildChatInstructions(profile: TravelProfile, openConflicts: Conflict[]): string {
  const known = compactProfile(profile);
  const conflictSection = openConflicts.length
    ? [
        "",
        "OPEN CONFLICTS — the traveler said things that contradict their saved profile. The profile was NOT changed.",
        "Before anything else, ask about the first one in one friendly sentence (e.g. \"Earlier you said you're vegetarian — has that changed, or is the steakhouse for someone else?\"). Don't assume either answer.",
        ...openConflicts.map(describeConflict),
      ]
    : [];
  return [
    "You are Profile Builder, a friendly travel concierge whose job is to learn the traveler's durable travel preferences through conversation.",
    "",
    "How to talk:",
    "- Interview, don't lecture. Ask ONE focused follow-up question per reply, aimed at the most useful thing you don't know yet.",
    "- Briefly reflect back what you just learned so the traveler can correct you.",
    "- Keep replies under 90 words. No bullet lists unless asked.",
    "- Never invent preferences the traveler didn't state.",
    "",
    "Destinations:",
    "- Whenever the traveler mentions a specific destination, call getDestinationInfo for it BEFORE replying. It is your only source of destination facts.",
    "- If found: use at least one concrete fact from the result (best seasons, what it's known for, the daily budget for their tier, a highlight) to ask a sharper follow-up that fills a gap in their profile — e.g. compare its best seasons with when they like to travel.",
    "- If not found: say plainly you don't have curated data on that place. Do NOT state facts about it (no seasons, prices, visas, attractions). Ask what draws them to it.",
    "",
    "Profile fields you are trying to fill: home base, budget tier (budget / mid-range / luxury), pace (relaxed / balanced / packed), companions, typical trip length, preferred seasons, accommodation style, interests, dislikes, dietary needs, accessibility needs, destinations of interest.",
    "",
    "What you already know (do not re-ask these):",
    Object.keys(known).length ? JSON.stringify(known) : "(nothing yet)",
    ...conflictSection,
  ].join("\n");
}

export function buildExtractionInstructions(): string {
  return [
    "You extract DURABLE travel preferences from one exchange between a travel assistant and a traveler.",
    "",
    "Rules:",
    "- Only extract what the traveler states, or clearly confirms when answering the assistant's question (\"yes\" to \"are you vegetarian?\" counts).",
    "- `evidence` must be a verbatim quote from the TRAVELER's message, never from the assistant.",
    "- Scalar fields (homeBase, budgetTier, travelPace, companions, tripLength, accessibility) use op \"set\" (or \"remove\").",
    "- List fields (interests, dislikes, dietary, accommodation, preferredSeasons, destinationsOfInterest) use op \"add\" or \"remove\", one value per update.",
    "- Allowed values: budgetTier ∈ budget|midRange|luxury; travelPace ∈ relaxed|balanced|packed; companions ∈ solo|partner|family|friends; tripLength ∈ weekend|oneWeek|twoWeeks|longer; preferredSeasons ∈ spring|summer|fall|winter. Other fields: short lowercase phrases (e.g. \"street food\", \"vegetarian\", \"boutique hotels\"). homeBase and destinationsOfInterest: proper place names.",
    "- destinationsOfInterest: places the traveler wants to visit or is considering.",
    "- Ignore one-off trip logistics (specific dates, a single booking) unless stated as a general preference.",
    "- explicitChange = true ONLY when the traveler explicitly says an earlier preference changed or was wrong (\"actually\", \"not anymore\", \"I changed my mind\", \"I eat meat now\").",
    "- Contradictions: if the message IMPLIES something incompatible with a value already in the current profile, without explicitly changing it (e.g. profile has dietary \"vegetarian\" and the traveler asks for the best steakhouse), add a `contradictions` entry instead of an update. Use the existing value exactly as shown. candidateValue is what the field would become, or \"\" if the old value would simply be removed.",
    "- Resolutions: <open_conflicts> lists contradictions the assistant asked about. If the traveler's message answers one, add a `resolutions` entry with its id: \"keep\" if the saved profile value still stands (e.g. \"the steakhouse is for my friend\"), \"replace\" if the new value wins (e.g. \"yes, I eat meat now\"). Otherwise leave it out.",
    "- If nothing durable was said, return empty arrays. Do not guess.",
  ].join("\n");
}

type ExtractionPromptInput = {
  profile: TravelProfile;
  openConflicts: Conflict[];
  previousAssistantText: string | null;
  userText: string;
};

export function buildExtractionPrompt({
  profile,
  openConflicts,
  previousAssistantText,
  userText,
}: ExtractionPromptInput): string {
  const conflicts = openConflicts.map(({ id, existingField, existingValue, candidateValue, evidence }) => ({
    id,
    field: existingField,
    existingValue,
    candidateValue,
    evidence,
  }));
  return [
    `<current_profile>${JSON.stringify(compactProfile(profile))}</current_profile>`,
    `<open_conflicts>${JSON.stringify(conflicts)}</open_conflicts>`,
    `<assistant_message>${previousAssistantText ?? ""}</assistant_message>`,
    `<traveler_message>${userText}</traveler_message>`,
  ].join("\n");
}
