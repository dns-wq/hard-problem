import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("rundown authoring fields stay contained at narrow widths", async ({ page }) => {
  const css = readFileSync("src/app/globals.css", "utf8");
  await page.setContent(`
    <style>${css}</style>
    <main class="page-narrow live-rundown-editor">
      <div class="live-rundown-list">
        <section data-testid="rundown-card" class="live-rundown-card">
          <div class="live-rundown-card-header">
            <button class="live-icon-btn">⋮⋮</button>
            <strong>A deliberately long translated block heading that must remain inside its card</strong>
            <button class="live-icon-btn">↑</button><button class="live-icon-btn">↓</button>
            <button class="live-chip">Follow-up</button><button class="live-chip">Edit</button>
          </div>
          <div class="live-rundown-fields">
            <input class="form-input" value="A long title value" />
            <textarea class="form-textarea">A long response field</textarea>
            <div class="live-rundown-options">
              <div class="live-rundown-option-row"><input class="form-input" value="A long option label" /><button class="live-icon-btn">✕</button></div>
            </div>
            <div class="live-rundown-two-column">
              <label class="form-label">Minimum<input class="form-input" type="number" value="1" /></label>
              <label class="form-label">Maximum<input class="form-input" type="number" value="10" /></label>
            </div>
          </div>
        </section>
      </div>
    </main>
  `);
  const card = page.getByTestId("rundown-card");
  const dimensions = await card.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const fields = page.locator(".form-input, .form-textarea");
  const fieldCount = await fields.count();
  for (let index = 0; index < fieldCount; index += 1) {
    const field = fields.nth(index);
    const box = await field.evaluate((element) => {
      const parent = element.parentElement!;
      return { left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, parentLeft: parent.getBoundingClientRect().left, parentRight: parent.getBoundingClientRect().right };
    });
    expect(box.left).toBeGreaterThanOrEqual(box.parentLeft);
    expect(box.right).toBeLessThanOrEqual(box.parentRight);
  }
});

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
