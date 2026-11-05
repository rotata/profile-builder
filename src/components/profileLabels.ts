import type { ProfileField } from "@/shared/contract";

export const FIELD_LABELS: Record<ProfileField, string> = {
  homeBase: "Home base",
  budgetTier: "Budget",
  travelPace: "Pace",
  companions: "Travels with",
  tripLength: "Typical trip",
  accessibility: "Accessibility",
  interests: "Interests",
  dislikes: "Dislikes",
  dietary: "Dietary",
  accommodation: "Stays",
  preferredSeasons: "Seasons",
  destinationsOfInterest: "Dream destinations",
};

export const FIELD_GROUPS: Array<{ title: string; fields: ProfileField[] }> = [
  { title: "Basics", fields: ["homeBase", "companions", "budgetTier", "travelPace", "tripLength"] },
  { title: "Tastes", fields: ["interests", "dislikes", "dietary", "accommodation"] },
  { title: "When & where", fields: ["preferredSeasons", "destinationsOfInterest"] },
  { title: "Needs", fields: ["accessibility"] },
];

const VALUE_LABELS: Record<string, string> = {
  midRange: "Mid-range",
  oneWeek: "About a week",
  twoWeeks: "Two weeks",
  longer: "Longer than two weeks",
  weekend: "Weekend",
};

export function displayValue(value: string): string {
  if (VALUE_LABELS[value]) return VALUE_LABELS[value];
  return value.charAt(0).toUpperCase() + value.slice(1);
}
