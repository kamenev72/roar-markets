import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecordCardModel, renderRecordCard } from "../src/record_card.js";

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

test("hostile record card parses as inert SVG", async ({ page }) => {
  const hostile = `<script/><foreignObject/><style>@import url(x)</style><a href="javascript:x">x</a>\u0000\ud800`;
  const svg = renderRecordCard(createRecordCardModel({ records: [{ id: "x", question: hostile, pick: "YES", outcome: "NO", won: true, receiptRef: "walkthrough" }] }, 0, "x"));
  const parsed = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, "image/svg+xml");
    return { root: document.documentElement.localName, errors: document.querySelectorAll("parsererror").length, executable: document.querySelectorAll("script,foreignObject,style,a,[href],[src],[onload],[onclick]").length };
  }, svg);
  expect(parsed).toEqual({ root: "svg", errors: 0, executable: 0 });
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

test("resolved card downloads, clears only after confirmation, and does not remove proof", async ({ page }) => {
  const seed = Array.from({ length: 20 }, (_, index) => ({ id: `seed-${index}`, question: `Seed call ${index}`, pick: "YES", outcome: "YES", won: false, receiptRef: "walkthrough" }));
  await page.addInitScript((records) => {
    if (sessionStorage.getItem("plan2123-seeded")) return;
    sessionStorage.setItem("plan2123-seeded", "yes");
    localStorage.setItem("roar_call_history_v1", JSON.stringify({ records }));
    localStorage.setItem("propcast_streak_v1", JSON.stringify({ streak: 4, best: 7 }));
  }, seed);
  await page.goto("/");
  await page.getByRole("button", { name: /Open the next call/i }).click();
  await page.getByRole("button", { name: /YES Another goal lands/i }).click();
  await page.getByRole("button", { name: /Reveal the match result/i }).click();
  const preview = page.getByRole("figure", { name: /Your private record card/i });
  await expect(preview).toContainText("20 calls");
  await expect(preview).toContainText("100% accuracy");
  await expect(preview).toContainText("best run");
  await expect(preview.getByLabel("Current call highlight")).toHaveAttribute("aria-current", "true");
  await expect(preview).toContainText(/Simulated walkthrough/i);
  expect(await preview.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download record card/i }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("roar-record-card.svg");
  const savedPath = await saved.path();
  expect(savedPath).not.toBeNull();
  const svg = await readFile(savedPath!, "utf8");
  expect(svg).toContain("roar/record-card/v1");
  expect(svg).toContain("20 CALLS");
  expect(svg).toContain("SIMULATED WALKTHROUGH");
  expect(svg).not.toMatch(/<script|<foreignObject|<style|\shref=/i);
  const clear = page.getByRole("button", { name: /Clear private record/i });
  page.once("dialog", (dialog) => dialog.dismiss());
  await clear.click();
  await expect(page.getByText(/not cleared/i)).toBeVisible();
  await expect(clear).toBeFocused();
  await expect(page.getByText("20", { exact: true }).first()).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await clear.click();
  await expect(page.getByText(/were cleared/i)).toBeVisible();
  await expect(clear).toBeFocused();
  expect(await page.evaluate(() => ({ history: localStorage.getItem("roar_call_history_v1"), streak: localStorage.getItem("propcast_streak_v1") }))).toEqual({ history: null, streak: null });
  await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
  await page.reload();
  const history = page.getByRole("region", { name: /A small record of your match instinct/i });
  await expect(history.getByText("0", { exact: true }).first()).toBeVisible();
  await expect(history.getByText("0", { exact: true }).nth(1)).toBeVisible();
  await page.getByText(/Open the historical match proof/i).click();
  await expect(page.getByRole("heading", { name: /Does the saved answer still belong/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("clear failure preserves persisted state, reports failure, and restores focus", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("roar_call_history_v1", JSON.stringify({ records: [{ id: "saved", question: "Saved call", pick: "YES", outcome: "YES", won: true, receiptRef: "walkthrough" }] }));
    localStorage.setItem("propcast_streak_v1", JSON.stringify({ streak: 2, best: 2 }));
  });
  await page.goto("/");
  await page.evaluate(() => {
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      if (key === "propcast_streak_v1") throw new Error("storage blocked");
      return removeItem.call(this, key);
    };
  });
  const clear = page.getByRole("button", { name: /Clear private record/i });
  page.once("dialog", (dialog) => dialog.accept());
  await clear.click();
  await expect(page.getByText(/Could not clear/i)).toBeVisible();
  await expect(clear).toBeFocused();
  const history = page.getByRole("region", { name: /A small record of your match instinct/i });
  await expect(history.getByText("1", { exact: true })).toBeVisible();
  await expect(history.getByText("2", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ history: localStorage.getItem("roar_call_history_v1"), streak: localStorage.getItem("propcast_streak_v1") }))).toEqual({ history: expect.any(String), streak: expect.any(String) });
});
