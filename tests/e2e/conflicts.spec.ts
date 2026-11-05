import { expect, test } from "@playwright/test";
import { resetApp, send } from "./helpers";

test.beforeEach(async ({ page }) => resetApp(page));

test("a contradiction is surfaced, not silently applied, and Replace resolves it", async ({ page }) => {
  await page.goto("/");
  await send(page, "I'm vegetarian.");
  await expect(page.getByTestId("field-dietary")).toContainText("Vegetarian");

  await send(page, "Can you recommend the best steakhouse?");

  const card = page.getByTestId("conflict-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Vegetarian");
  await expect(card).toContainText("steakhouse");
  // No silent overwrite: the profile still says vegetarian.
  await expect(page.getByTestId("field-dietary")).toContainText("Vegetarian");

  // The assistant raises it on the next turn.
  const reply = await send(page, "Also, I like slow trips.");
  await expect(reply).toContainText("doesn't match your saved profile");

  await card.getByRole("button", { name: "Remove Vegetarian" }).click();
  await expect(card).toBeHidden();
  await expect(page.getByTestId("field-dietary")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("conflict-card")).toHaveCount(0);
  await expect(page.getByTestId("field-dietary")).toHaveCount(0);
});

test("answering the assistant in chat resolves the conflict", async ({ page }) => {
  await page.goto("/");
  await send(page, "I'm vegetarian.");
  await send(page, "Where's the best steakhouse in town?");
  await expect(page.getByTestId("conflict-card")).toBeVisible();

  await send(page, "Oh, the steakhouse is for a friend.");
  await expect(page.getByTestId("conflict-card")).toHaveCount(0);
  await expect(page.getByTestId("field-dietary")).toContainText("Vegetarian");
});

test("conflicts survive a reload until resolved", async ({ page }) => {
  await page.goto("/");
  await send(page, "I'm vegetarian.");
  await send(page, "Book the steakhouse.");
  await page.reload();
  await expect(page.getByTestId("conflict-card")).toBeVisible();
  await page.getByRole("button", { name: "Keep Vegetarian" }).click();
  await expect(page.getByTestId("conflict-card")).toHaveCount(0);
  await expect(page.getByTestId("field-dietary")).toContainText("Vegetarian");
});
