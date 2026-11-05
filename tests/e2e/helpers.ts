import { expect, type Page } from "@playwright/test";

export async function resetApp(page: Page) {
  const res = await page.request.post("/api/reset");
  expect(res.ok()).toBeTruthy();
}

/** Sends a chat message and waits until the assistant has finished replying. */
export async function send(page: Page, text: string) {
  const replies = page.getByTestId("message-assistant");
  const before = await replies.count();
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(replies).toHaveCount(before + 1);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeEditable();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled(); // input cleared
  return replies.last();
}
