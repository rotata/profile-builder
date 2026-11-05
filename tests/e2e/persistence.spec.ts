import { expect, test } from "@playwright/test";
import { resetApp, send } from "./helpers";

test.beforeEach(async ({ page }) => resetApp(page));

test("conversation survives a reload, and Start over clears it", async ({ page }) => {
  await page.goto("/");
  await send(page, "I mostly travel solo.");

  await page.reload();
  await expect(page.getByTestId("message-user")).toHaveText(["I mostly travel solo."]);
  await expect(page.getByTestId("message-assistant")).toHaveCount(1);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByTestId("message-user")).toHaveCount(0);
});

test("a failed turn is not persisted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message" }).fill("hello [mock:fail]");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("error-banner")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("message-user")).toHaveCount(0);
});
