import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.devnet.solana.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: null } }),
    });
  });
  await page.route("https://devnet.rpcpool.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: null } }),
    });
  });
});

test("responsive evidence board has no horizontal overflow and honest state text", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /PROPCAST/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Re-verify a real kickoff receipt/i })).toBeVisible();
  await expect(page.getByText(/RECEIPT UNAVAILABLE|RECEIPT INVALID/i)).toBeVisible();
  await expect(page.getByText(/Finality policy is not publicly proven/i)).toBeVisible();
  await expect(page.getByText(/Payout, refund, custody/i)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  await page.screenshot({ path: `../evidence/ui/${testInfo.project.name}.png`, fullPage: true });
});

test("keyboard flow reaches market choices and simulated verifier", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Goal/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Another goal after/i })).toBeVisible();
  await page.getByRole("button", { name: /YES — another goal/i }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Whistle/i }).focus();
  await page.keyboard.press("Enter");
  const resolved = page.getByLabel(/Resolved: another goal/i);
  await expect(page.getByRole("heading", { name: /Resolved/i })).toBeVisible();
  await expect(resolved.getByText(/SIMULATED · DEMONSTRATED/i)).toBeVisible();
});
