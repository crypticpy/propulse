#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

let target;
try {
  target = new URL(process.argv[2]);
  assert(["http:", "https:"].includes(target.protocol));
} catch {
  console.error("Usage: node scripts/check-pwa-preloads.mjs <http(s)://built-app-url>");
  process.exit(2);
}
const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL });
const results = [];
try {
  // A disposable context keeps this check away from personal browser state.
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const warnings = [];
  const errors = [];
  page.on("console", (message) => {
    if (/cross-world service worker|preloaded.*not used/i.test(message.text())) {
      warnings.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  for (const phase of ["cold", "controlled", "offline"]) {
    if (phase === "offline") await context.setOffline(true);
    const response = await page.goto(target.href, { waitUntil: "load" });
    const html = await response.text();
    // Warnings about unused preloads are emitted several seconds after load.
    await page.waitForTimeout(6_000);
    const result = {
      phase,
      status: response.status(),
      fromServiceWorker: response.fromServiceWorker(),
      htmlModulePreloads: (html.match(/<link\b[^>]*rel=["']modulepreload["']/gi) ?? []).length,
      moduleEntry: /<script\b[^>]*type=["']module["'][^>]*src=/.test(html),
      rootRendered: await page.locator("#root").evaluate((root) => root.childElementCount > 0),
      warnings: [...warnings],
      errors: [...errors],
    };
    results.push(result);
    warnings.length = 0;
    errors.length = 0;
    if (phase === "cold") {
      // Login does not mount ShellOverlays, which normally registers the worker.
      // Install the real published worker here to exercise returning visitors
      // without authenticating or bypassing the app's sign-in gate.
      await page.evaluate(async () => {
        await navigator.serviceWorker.register("/sw.js");
      });
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    }
  }
  console.log(JSON.stringify({ browser: browser.version(), url: target.href, results }, null, 2));
  for (const result of results) {
    assert.equal(result.status, 200, `${result.phase}: app entry failed`);
    assert.equal(result.htmlModulePreloads, 0, `${result.phase}: HTML module hints compete with worker responses`);
    assert(result.moduleEntry && result.rootRendered, `${result.phase}: app did not render`);
    assert.equal(result.warnings.length, 0, `${result.phase}: preload warnings`);
    assert.equal(result.errors.length, 0, `${result.phase}: page errors`);
    if (result.phase !== "cold") assert(result.fromServiceWorker, `${result.phase}: worker did not serve navigation`);
  }
} finally {
  await browser.close();
}
