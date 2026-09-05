import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const require = createRequire(import.meta.url);
const origin = process.env.PROPULSE_REVIEW_URL;
if (!origin)
  throw new Error("Set PROPULSE_REVIEW_URL to your owned dev-session URL.");
const identity = await fetch(`${origin}/__propulse_dev_session`).then(
  (response) => response.json(),
);
assert.equal(identity.root, process.cwd());
assert.equal(identity.owner, "station-design-system");
assert.equal(identity.profile, "local");
const output = path.resolve(
  process.env.PROPULSE_REVIEW_OUTPUT ||
    path.join(os.tmpdir(), "station-review-evidence"),
);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/design-system", "/design-system/add-equipment"]) {
    await page.goto(`${origin}${route}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    for (const theme of ["dark", "light", "high-contrast", "midnight"]) {
      await page.getByLabel("Preview theme").selectOption(theme);
      const violations = await page.evaluate(async () =>
        (await window.axe.run(document)).violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
      );
      assert.deepEqual(
        violations,
        [],
        `${route} / ${theme}: ${JSON.stringify(violations)}`,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      results.push({ route, theme, axe: "pass" });
      if (theme === "dark" || theme === "light")
        await page.screenshot({
          path: `${output}/${route.endsWith("add-equipment") ? "equipment" : "catalog"}-${theme}.png`,
          fullPage: true,
        });
    }
    await page.getByLabel("Preview theme").selectOption("dark");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `${output}/${route.endsWith("add-equipment") ? "equipment" : "catalog"}-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
  await page.getByRole("button", { name: "Save example" }).click();
  await page.getByText("Give this equipment a name.").waitFor();
  await page
    .getByRole("textbox", { name: /Name.*required/ })
    .fill("Homebrew antenna tuner");
  await page
    .getByRole("combobox", { name: /Type.*required/ })
    .selectOption("tuner");
  await page
    .getByLabel("Add a photo · Equipment photo")
    .setInputFiles(`${output}/equipment-dark.png`);
  await page.getByRole("img", { name: "Equipment photo preview" }).waitFor();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.getByRole("button", { name: "Add port", exact: true }).click();
  await page.getByRole("textbox", { name: "Port 3 name" }).fill("GROUND");
  await page.getByRole("button", { name: "Move GROUND up" }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Port 2 name" }).inputValue(),
    "GROUND",
  );
  await page.getByRole("button", { name: "Remove RF OUT" }).click();
  await page.getByRole("button", { name: "Save example" }).click();
  await page.getByRole("status").filter({ hasText: "Saved example" }).waitFor();
  await page
    .getByRole("button", { name: /Homebrew antenna tuner.*2 ports/ })
    .click();
  await page.getByRole("dialog").waitFor();
  const inspectorViolations = await page.evaluate(async () =>
    (await window.axe.run(document)).violations.map(({ id }) => id),
  );
  assert.deepEqual(inspectorViolations, []);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: "Reset form" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep editing" })
    .click();
  assert.equal(
    await page.getByRole("textbox", { name: /Name.*required/ }).inputValue(),
    "Homebrew antenna tuner",
  );
  await page.getByLabel("Density").selectOption("compact");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.setViewportSize({ width: 640, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "200% text overflow",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        identity,
        results,
        interactions:
          "validation, photo add/remove, port add/reorder/remove, save, inspect, Escape, reset cancellation, compact, 200% text, reduced motion",
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(`Station review browser checks passed. Evidence: ${output}`);
} finally {
  await browser.close();
}
