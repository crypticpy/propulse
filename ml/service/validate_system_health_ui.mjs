#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PROPULSE_PLAYWRIGHT_MODULE;
const baseUrl = process.env.PROPULSE_UI_BASE_URL ?? "http://127.0.0.1:5181";
const outputDir = process.env.PROPULSE_UI_QA_OUTPUT ?? "/tmp/propulse-system-health-ui";

if (!modulePath) {
  throw new Error("PROPULSE_PLAYWRIGHT_MODULE is required");
}

const { chromium } = await import(pathToFileURL(modulePath).href);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const browserErrors = [];
    const expectedNetworkErrors = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const messageText = message.text();
      if (/Failed to load resource:.*status of 503/.test(messageText)) {
        expectedNetworkErrors.push(messageText);
        return;
      }
      browserErrors.push(messageText);
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("propulse-welcome-seen", "true");
      localStorage.setItem(
        "propulse-settings",
        JSON.stringify({ state: { radioSetupCompleted: true }, version: 30 }),
      );
    });
    await page.route("**/api/propagation/research-health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          status: "healthy",
          reportedAt: new Date().toISOString(),
          lastCompletedAt: "2026-07-16T04:00:00Z",
          freshnessSeconds: 0,
          progress: {
            continuousHours: 2,
            completedHours: 2,
            requiredHours: 720,
            missingHours: 0,
          },
        }),
      });
    });
    const screenshot = `${outputDir}/${viewport.name}.png`;
    try {
      await page.goto(`${baseUrl}/health`, { waitUntil: "networkidle" });
      const pipeline = page.getByText("NowCast Research Pipeline", { exact: true });
      await pipeline.waitFor({ state: "visible" });
      const row = pipeline.locator("xpath=ancestor::div[contains(@class,'flex')][1]");
      await row.getByText("just now", { exact: true }).waitFor({ state: "visible" });
      const rowText = await row.innerText();
      const { dimensions, overflowElements } = await page.evaluate(() => {
        const root = document.documentElement;
        const dimensions = {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          clientHeight: root.clientHeight,
          scrollHeight: root.scrollHeight,
        };
        const overflowElements = Array.from(document.querySelectorAll("*"))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              className:
                typeof element.className === "string" ? element.className : "",
              text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "",
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            };
          })
          .filter(
            (element) =>
              element.width > 0 &&
              (element.left < -1 || element.right > dimensions.clientWidth + 1),
          )
          .slice(0, 12);
        return { dimensions, overflowElements };
      });
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({
        viewport,
        pipelineVisible: await pipeline.isVisible(),
        healthyStateVisible: rowText.includes("just now"),
        horizontalOverflow: dimensions.scrollWidth > dimensions.clientWidth,
        dimensions,
        overflowElements,
        browserErrors,
        expectedNetworkErrors,
        screenshot,
      });
    } catch (error) {
      await page.screenshot({ path: screenshot, fullPage: true });
      const pageSnapshot = `${outputDir}/${viewport.name}.html`;
      await writeFile(pageSnapshot, await page.content(), "utf8");
      results.push({
        viewport,
        pipelineVisible: false,
        healthyStateVisible: false,
        horizontalOverflow: false,
        browserErrors,
        expectedNetworkErrors,
        screenshot,
        pageSnapshot,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const passed = results.every(
  (result) =>
    result.pipelineVisible &&
    result.healthyStateVisible &&
    !result.horizontalOverflow &&
    result.browserErrors.length === 0,
);
console.log(JSON.stringify({ passed, results }, null, 2));
if (!passed) process.exitCode = 1;
