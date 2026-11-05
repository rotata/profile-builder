import { describe, expect, it } from "vitest";
import { getDestinationInfo, KNOWN_DESTINATIONS } from "@/server/domain/destinations";

describe("getDestinationInfo", () => {
  it("has data for at least five destinations", () => {
    expect(KNOWN_DESTINATIONS.length).toBeGreaterThanOrEqual(5);
  });

  it.each([
    ["Kyoto", "Kyoto"],
    ["kyoto, japan", "Kyoto"],
    ["  PARIS ", "Paris"],
    ["Reykjavik", "Reykjavík"],
    ["Reykjavík", "Reykjavík"],
    ["CDMX", "Mexico City"],
    ["Marrakesh", "Marrakech"],
  ])("resolves %j to %s", async (query, expected) => {
    expect((await getDestinationInfo(query))?.name).toBe(expected);
  });

  it.each(["Lisbon", "Atlantis", "", "Paris Hilton"])("returns null for unknown %j", async (query) => {
    expect(await getDestinationInfo(query)).toBeNull();
  });

  it("returns the brief's contract fields", async () => {
    const info = await getDestinationInfo("Bangkok");
    expect(info).toMatchObject({
      name: "Bangkok",
      bestSeasons: expect.any(Array),
      knownFor: expect.any(Array),
      averageDailyBudgetUSD: { budget: expect.any(Number), midRange: expect.any(Number), luxury: expect.any(Number) },
    });
  });
});
