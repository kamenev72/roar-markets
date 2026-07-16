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

test("responsive Roar Markets page has no horizontal overflow and keeps scope honest", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Call the next moment/i })).toBeVisible();
  await expect(page.getByText(/Payout, finality, and custody are outside/i)).toBeVisible();

  const receiptDisclosure = page.getByText(/Open the historical match proof/i);
  await receiptDisclosure.click();
  await expect(page.getByRole("heading", { name: /Does the saved answer still belong/i })).toBeVisible();
  await expect(page.getByText(/Check did not pass|Waiting for receipt/i)).toBeVisible();
  await expect(page.getByText(/Finality policy is not publicly proven/i)).toBeVisible();
  await expect(page.getByLabel("What this check does not prove").getByText(/Payout, refund, custody/i)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  await page.screenshot({ path: `../artifacts/evidence/ui/${testInfo.project.name}.png`, fullPage: true });
});

test("keyboard flow makes a call, reveals the result, and exposes attached proof", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open the next call/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Will there be another goal/i })).toBeVisible();
  await page.getByRole("button", { name: /YES Another goal lands/i }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Reveal the match result/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Another goal: YES/i })).toBeVisible();
  await expect(page.getByText(/Argentina vs France/i)).toBeVisible();
  await expect(page.getByText(/Another goal after 23/i)).toBeVisible();
  await expect(page.getByText(/Bound/i)).toBeVisible();
  const history = page.getByRole("region", { name: /A small record of your match instinct/i });
  await expect(history.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(history.getByText("100%", { exact: true })).toBeVisible();
});
