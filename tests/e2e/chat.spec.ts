import { expect, test } from "@playwright/test";
import { resetApp } from "./helpers";

test.beforeEach(async ({ page }) => resetApp(page));

test("assistant reply streams in incrementally", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message" }).fill("Hi! I love food-focused trips.");
  await page.getByRole("button", { name: "Send" }).click();

  const reply = page.getByTestId("message-assistant").last();
  await expect(reply).toBeVisible();

  // Sample the bubble while it fills; a streamed reply passes through several
  // intermediate states, a buffered one jumps straight to the final text.
  const seen = new Set<string>();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const text = (await reply.textContent()) ?? "";
    seen.add(text);
    if (text.trim().endsWith("?")) break;
    await page.waitForTimeout(15);
  }
  expect(seen.size).toBeGreaterThan(3);
  await expect(reply).toContainText("travel profile");
});

test("a provider failure shows a recoverable error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message" }).fill("hello [mock:fail]");
  await page.getByRole("button", { name: "Send" }).click();

  const banner = page.getByTestId("error-banner");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Try again" }).click();
  await expect(banner).toBeHidden();
  // The failed message is restored to the input for another attempt.
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("hello [mock:fail]");
});
