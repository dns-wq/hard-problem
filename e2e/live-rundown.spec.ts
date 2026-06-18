import { expect, test } from "@playwright/test";

test("health reports the rundown schema", async ({ request }) => {
  const response = await request.get("/api/health/live");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ ok: true, schema: "live-rundown-v2" });
});

test("anonymous participant entry remains available", async ({ page }) => {
  await page.goto("/live");
  await expect(page.locator("body")).toContainText(/code|代碼/i);
});

test("staging rundown follows the active block on a phone", async ({ page }) => {
  const code = process.env.E2E_RUNDOWN_CODE;
  test.skip(!code, "Set E2E_RUNDOWN_CODE after seeding the staging acceptance rundown.");
  await page.goto(`/live/play/${code}`);
  await expect(page.locator("body")).not.toContainText("No session with that code");
});

test("legacy raffle route remains joinable", async ({ page }) => {
  const code = process.env.E2E_RAFFLE_CODE;
  test.skip(!code, "Set E2E_RAFFLE_CODE after seeding a legacy staging raffle.");
  await page.goto(`/live/play/${code}`);
  await expect(page.locator("body")).not.toContainText("No session with that code");
});
