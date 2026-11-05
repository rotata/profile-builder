import { expect, test } from "@playwright/test";
import { resetApp, send } from "./helpers";

test.beforeEach(async ({ page }) => resetApp(page));

test("a known destination triggers getDestinationInfo and the reply uses its data", async ({ page }) => {
  await page.goto("/");
  const reply = await send(page, "I've been thinking about Kyoto.");

  await expect(reply.getByTestId("lookup-chip")).toHaveText("Looked up Kyoto");
  // These facts exist only in the tool's data — the reply must have used the result.
  await expect(reply).toContainText("spring and fall");
  await expect(reply).toContainText("$180 a day");
  await expect(page.getByTestId("field-destinationsOfInterest")).toContainText("Kyoto");

  await page.reload(); // chips survive reload
  await expect(page.getByTestId("lookup-chip")).toHaveText("Looked up Kyoto");
});

test("an unknown destination is looked up, and the assistant admits it has no data", async ({ page }) => {
  await page.goto("/");
  const reply = await send(page, "What about Lisbon?");

  await expect(reply.getByTestId("lookup-chip")).toHaveText("No data for Lisbon");
  await expect(reply).toContainText("don't have curated destination data for Lisbon");
  await expect(reply).not.toContainText("$");
});
