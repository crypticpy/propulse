import assert from "node:assert/strict";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";

// UI evidence only: disposable contexts, no authentication or hardware fixtures.
// Usage: node scripts/check-appearance-effects.mjs <managed-local-origin>
if (!process.argv[2]) {
  throw new Error("Pass this checkout's managed local origin explicitly.");
}
const origin = new URL(process.argv[2]);
if (
  origin.protocol !== "http:" ||
  origin.hostname !== "127.0.0.1" ||
  origin.pathname !== "/" ||
  origin.username || origin.password || origin.search || origin.hash
) {
  throw new Error("Pass a managed local origin such as http://127.0.0.1:5180");
}
const identityResponse = await fetch(new URL("/__propulse_dev_session", origin), {
  signal: AbortSignal.timeout(5000),
});
if (!identityResponse.ok) throw new Error("Managed server identity is unavailable.");
const identity = await identityResponse.json();
if (
  identity.profile !== "local" ||
  identity.root !== await realpath(process.cwd()) ||
  typeof identity.id !== "string" || !identity.id ||
  typeof identity.owner !== "string" || !identity.owner ||
  identity.url !== origin.origin
) {
  throw new Error("Use this checkout's managed local-profile server; check dev:session status.");
}
const output = "tmp/effects-check";
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const errors = [];
const result = { identity, checks: [], themes: [], errors };
const record = (description) => {
  result.checks.push(description);
  console.log(description);
};
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    reducedMotion: "no-preference",
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
  });
  await context.addInitScript((targetOrigin) => {
    if (location.origin !== targetOrigin) return;
    // Returning-visitor presentation only; no entitlement or station fabrication.
    localStorage.setItem("propulse-welcome-seen", "true");
    localStorage.setItem("propulse-onboarding-completed", "true");
    const saved = JSON.parse(localStorage.getItem("propulse-settings") ?? "{}");
    localStorage.setItem("propulse-settings", JSON.stringify({
      ...saved, state: { ...saved.state, radioSetupCompleted: true },
    }));
  }, origin.origin);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(new URL("/settings/appearance", origin).href);
  const section = page.getByRole("region", { name: "Decorative effects", exact: true });
  const choose = async (targetPage, targetSection, name) => {
    await targetSection.locator("label").filter({
      has: targetPage.getByRole("radio", { name, exact: true }),
    }).click();
  };
  await expect(section.getByRole("radio", { name: "Subtle", exact: true })).toBeChecked();
  await choose(page, section, "Full");
  await section.getByRole("switch", { name: "Decorative glow", exact: true }).uncheck();
  await choose(page, section, "Off");
  await page.reload();
  await expect(section.getByRole("radio", { name: "Off", exact: true })).toBeChecked();
  await expect(section.getByRole("switch", { name: "Decorative glow", exact: true })).not.toBeChecked();
  record("Presets and saved toggle choices survive reload");

  const second = await context.newPage();
  second.setDefaultTimeout(15000);
  await second.goto(new URL("/settings/appearance", origin).href);
  const other = second.getByRole("region", { name: "Decorative effects", exact: true });
  await choose(second, other, "Full");
  await expect(section.getByRole("radio", { name: "Full", exact: true })).toBeChecked();
  record("Cross-tab updates apply to the original page");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(section.getByText("Reduced motion is active", { exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(section.getByText("Reduced motion is active", { exact: true })).toBeHidden();
  record("OS reduced-motion changes apply dynamically");

  const off = section.getByRole("radio", { name: "Off", exact: true });
  await off.focus();
  await page.keyboard.press("Space");
  await expect(off).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(section.getByRole("radio", { name: "Subtle", exact: true })).toBeChecked();
  const glow = section.getByRole("switch", { name: "Decorative glow", exact: true });
  await glow.focus();
  await page.keyboard.press("Space");
  await expect(glow).toBeChecked();
  record("Native keyboard radios and switches remain usable");

  const scrollToTop = async () => {
    await section.evaluate((element) => {
      for (let parent = element; parent; parent = parent.parentElement) {
        parent.scrollTo({ top: 0, behavior: "instant" });
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    // Capture settled viewport composition, not a full-height element underneath
    // the fixed header. The app's smooth scrolling must not move the screenshot.
    await expect.poll(async () => {
      const box = await section.getByRole("heading", {
        name: "Decorative effects", exact: true,
      }).boundingBox();
      return box?.y ?? -1;
    }).toBeGreaterThanOrEqual(64);
  };
  const checkWidth = async () => {
    const bounds = await section.evaluate((element) => ({
      width: element.clientWidth, scroll: element.scrollWidth,
    }));
    assert.ok(bounds.width > 0 && bounds.scroll <= bounds.width + 1, JSON.stringify(bounds));
    return bounds;
  };
  for (const [name, id] of [
    ["Dark", "dark"], ["Light", "light"],
    ["High Contrast", "high-contrast"], ["Midnight", "midnight"],
  ]) {
    await page.getByRole("button", { name: new RegExp(`^${name} `) }).click();
    await page.locator(`[data-station-theme="${id}"]`).waitFor();
    await scrollToTop();
    await page.addScriptTag({ path: axePath });
    const violations = await section.evaluate(async (element) => {
      const scope = element.closest(".station-ui");
      if (!scope) throw new Error("Station controls scope missing");
      const audit = await window.axe.run(scope, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21aa"],
      });
      return audit.violations.map(({ id: rule, nodes }) => ({ id: rule, nodes: nodes.length }));
    });
    assert.deepEqual(violations, [], id);
    await page.screenshot({ path: `${output}/effects-${id}.png` });
    result.themes.push({ id, ...await checkWidth() });
  }
  record("Four themes: new controls pass scoped axe WCAG 2A/AA/2.1AA and width checks");

  await page.getByRole("button", { name: /^Dark / }).click();
  await scrollToTop();
  await page.screenshot({ path: `${output}/appearance-dark.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  // The responsive shell remounts; wait for it before reading its new section.
  await page.getByRole("heading", { name: "Settings", exact: true, level: 1 }).waitFor();
  await section.waitFor();
  await scrollToTop();
  await checkWidth();
  await page.screenshot({ path: `${output}/effects-mobile.png` });
  record("390px mobile controls reflow without horizontal overflow");

  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.getByRole("heading", { name: "Appearance", exact: true, level: 1 }).waitFor();
  await section.waitFor();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await checkWidth();
  await page.screenshot({ path: `${output}/effects-text-200.png` });
  record("200% root text retains control layout");
  assert.deepEqual(errors, [], "Unexpected browser errors");
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
