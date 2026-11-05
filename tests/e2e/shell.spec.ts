import { expect, test } from "@playwright/test";

test("renders the chat and the profile panel side by side", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Profile Builder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your travel profile" })).toBeVisible();
});
