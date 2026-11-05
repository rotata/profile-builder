/**
 * Stand-in for a real travel data API — the ONLY source of destination facts.
 * Figures are illustrative, hand-written for this exercise, not live data.
 *
 * Contract from the brief is kept as-is (function name + fields); extended
 * with `highlights` to give the assistant something concrete to ask about.
 */
export type Season = "spring" | "summer" | "fall" | "winter";

export type DestinationInfo = {
  name: string;
  bestSeasons: Season[];
  knownFor: string[];
  averageDailyBudgetUSD: { budget: number; midRange: number; luxury: number };
  visaNotes?: string;
  /** Extension: 2–3 specific things worth asking the traveler about. */
  highlights: string[];
};

const DESTINATIONS: DestinationInfo[] = [
  {
    name: "Kyoto",
    bestSeasons: ["spring", "fall"],
    knownFor: ["temples and shrines", "kaiseki and tofu cuisine", "gardens", "traditional crafts"],
    averageDailyBudgetUSD: { budget: 70, midRange: 180, luxury: 500 },
    visaNotes: "Many nationalities (incl. US, UK, EU) can visit visa-free for short stays; check Japan's official list.",
    highlights: ["Fushimi Inari at dawn", "Nishiki Market", "a night in a ryokan"],
  },
  {
    name: "Paris",
    bestSeasons: ["spring", "fall"],
    knownFor: ["museums", "food and bakeries", "architecture", "café culture"],
    averageDailyBudgetUSD: { budget: 100, midRange: 250, luxury: 700 },
    visaNotes: "Schengen rules: many visitors are visa-free for up to 90 days in any 180; check current entry requirements.",
    highlights: ["the Musée d'Orsay", "the Marais", "a long lunch at a neighborhood bistro"],
  },
  {
    name: "Mexico City",
    bestSeasons: ["spring", "winter"],
    knownFor: ["street food", "museums", "architecture", "nightlife"],
    averageDailyBudgetUSD: { budget: 45, midRange: 120, luxury: 350 },
    visaNotes: "Many nationalities can visit visa-free; check requirements for your passport.",
    highlights: ["tacos al pastor", "the National Museum of Anthropology", "Coyoacán"],
  },
  {
    name: "Reykjavík",
    bestSeasons: ["summer", "winter"],
    knownFor: ["northern lights", "hot springs", "hiking", "dramatic landscapes"],
    averageDailyBudgetUSD: { budget: 120, midRange: 250, luxury: 600 },
    visaNotes: "Schengen rules apply.",
    highlights: ["the Golden Circle", "geothermal lagoons", "whale watching"],
  },
  {
    name: "Marrakech",
    bestSeasons: ["spring", "fall"],
    knownFor: ["souks", "riads", "food", "architecture"],
    averageDailyBudgetUSD: { budget: 40, midRange: 120, luxury: 400 },
    visaNotes: "Many nationalities can visit visa-free for up to 90 days.",
    highlights: ["Jemaa el-Fnaa at night", "the Majorelle Garden", "a day trip to the Atlas Mountains"],
  },
  {
    name: "Bangkok",
    bestSeasons: ["winter"],
    knownFor: ["street food", "temples", "markets", "nightlife"],
    averageDailyBudgetUSD: { budget: 35, midRange: 100, luxury: 300 },
    visaNotes: "Visa-exemption rules have changed often recently; check before booking.",
    highlights: ["Wat Pho", "Chinatown street food", "a canal-side floating market"],
  },
];

/** Alternate names → canonical name (keys are normalized). */
const ALIASES: Record<string, string> = {
  cdmx: "Mexico City",
  "ciudad de mexico": "Mexico City",
  "mexico df": "Mexico City",
  marrakesh: "Marrakech",
  "krung thep": "Bangkok",
};

export function normalizeDestinationName(name: string): string {
  return name
    .split(",")[0] // "Kyoto, Japan" → "Kyoto"
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // "Reykjavík" → "Reykjavik"
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_NAME = new Map<string, DestinationInfo>(DESTINATIONS.map((d) => [normalizeDestinationName(d.name), d]));

export async function getDestinationInfo(name: string): Promise<DestinationInfo | null> {
  const key = normalizeDestinationName(name);
  const canonical = ALIASES[key] ? normalizeDestinationName(ALIASES[key]) : key;
  return BY_NAME.get(canonical) ?? null;
}

export const KNOWN_DESTINATIONS = DESTINATIONS.map((d) => d.name);
