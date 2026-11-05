import { expect, test } from "@playwright/test";
import { resetApp, send } from "./helpers";

test.beforeEach(async ({ page }) => resetApp(page));

test("preferences extracted from chat appear in the profile and persist", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("profile-panel")).toContainText("Nothing learned yet");

  await send(page, "I'm vegetarian, I travel solo and I love food and museums.");

  const panel = page.getByTestId("profile-panel");
  await expect(panel.getByTestId("field-dietary")).toContainText("Vegetarian");
  await expect(panel.getByTestId("field-companions")).toContainText("Solo");
  await expect(panel.getByTestId("field-interests")).toContainText("Food");
  await expect(panel.getByTestId("field-interests")).toContainText("Museums");

  await page.reload();
  await expect(page.getByTestId("field-dietary")).toContainText("Vegetarian");
  await expect(page.getByTestId("field-companions")).toContainText("Solo");
});

test("an explicit change of mind updates the profile directly", async ({ page }) => {
  await page.goto("/");
  await send(page, "I'm vegetarian.");
  await expect(page.getByTestId("field-dietary")).toContainText("Vegetarian");

  await send(page, "Actually, I eat meat now.");
  await expect(page.getByTestId("field-dietary")).toHaveCount(0);
});
