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
    await page.locator("main").getByRole("heading", { level: 1 }).waitFor();
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    for (const theme of ["dark", "light", "high-contrast", "midnight"]) {
      await page.getByLabel("Preview theme").selectOption(theme);
      if (route === "/design-system") {
        for (const category of [
          "States & feedback",
          "Station objects",
          "Dialogs & details",
        ]) {
          await page.getByRole("tab", { name: category }).click();
          const stateViolations = await page.evaluate(async () =>
            (await window.axe.run(document)).violations.map(({ id }) => id),
          );
          assert.deepEqual(stateViolations, [], `${theme} / ${category}`);
        }
        await page.getByRole("tab", { name: "Controls & forms" }).click();
      }
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
  await page.getByLabel("Text size").selectOption("extra-large");
  assert.equal(
    await page
      .getByRole("textbox", { name: /Name.*required/ })
      .evaluate((element) => getComputedStyle(element).fontSize),
    "20px",
  );
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "320px reflow with largest text",
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
  await page.addStyleTag({
    content: `.station-ui * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } .station-ui p { margin-bottom: 2em !important; }`,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "custom text spacing reflow",
  );
  await page.goto(`${origin}/design-system`);
  await page.getByRole("tab", { name: "Station objects" }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const visionSession = await context.newCDPSession(page);
  for (const vision of [
    "achromatopsia",
    "deuteranopia",
    "protanopia",
    "tritanopia",
  ]) {
    await visionSession.send("Emulation.setEmulatedVisionDeficiency", {
      type: vision,
    });
    await page
      .getByRole("tabpanel")
      .screenshot({ path: `${output}/selection-${vision}.png` });
  }
  await visionSession.send("Emulation.setEmulatedVisionDeficiency", {
    type: "none",
  });
  await visionSession.detach();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        identity,
        results,
        interactions:
          "validation, photo add/remove, port add/reorder/remove, save, inspect, Escape, reset cancellation, compact, largest text, 320px reflow, 200% text, custom text spacing, reduced motion, four color-vision simulations",
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
