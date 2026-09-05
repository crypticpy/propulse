import { chromium, expect } from "@playwright/test";
import { mkdir, realpath, writeFile } from "node:fs/promises";

// Disposable returning-user contexts; no authentication or hardware connections.
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:5182");
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
    origin.pathname !== "/" || origin.username || origin.password) {
  throw new Error("Pass this checkout's managed local URL.");
}
const response = await fetch(new URL("/__propulse_dev_session", origin), {
  signal: AbortSignal.timeout(5000),
});
const identity = await response.json();
if (!response.ok || identity.profile !== "local" || identity.root !== await realpath(process.cwd())) {
  throw new Error("Server must be this checkout's managed local-profile session.");
}
await mkdir("tmp/navigation-check", { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = { server: identity, checks: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("propulse-welcome-seen", "true");
    localStorage.setItem("propulse-onboarding-completed", "true");
    localStorage.setItem("propulse-settings", JSON.stringify({ state: { radioSetupCompleted: true } }));
    localStorage.setItem("propulse-map-operational", JSON.stringify({ state: { manualScope: "log" }, version: 1 }));
  });
  // The map and header must remain usable during feed outages.
  await context.route("**/api/**", route => new URL(route.request().url()).pathname.startsWith("/api/")
    ? route.fulfill({ status: 503, json: { error: "Unavailable-feed UI fixture" } })
    : route.continue());
  const page = await context.newPage();
  page.on("pageerror", error => results.errors.push(error.message));
  const mapState = () => page.evaluate(async () => {
    const resource = performance.getEntriesByType("resource").find(e => new URL(e.name).pathname === "/src/stores/mapStore.ts");
    const { useMapStore } = await import(resource?.name ?? "/src/stores/mapStore.ts");
    const operationalResource = performance.getEntriesByType("resource").find(e => new URL(e.name).pathname === "/src/stores/mapOperationalStore.ts");
    const { useMapOperationalStore } = await import(operationalResource?.name ?? "/src/stores/mapOperationalStore.ts");
    const state = useMapStore.getState();
    return { viewMode: state.viewMode, expanded: state.isDXConsoleExpanded, workspaceOpen: useMapOperationalStore.getState().workspaceOpen };
  });
  console.log("Checking saved Log startup");
  await page.goto(new URL("/map", origin).href);
  await expect(page.locator("canvas[data-engine]")).toBeVisible({ timeout: 60000 });
  await expect.poll(mapState).toEqual({ viewMode: "globe", expanded: false, workspaceOpen: false });
  await expect(page.getByRole("button", { name: "Expand to Ops Console", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand to Ops Console", exact: true }).click();
  await expect.poll(async () => (await mapState()).expanded && (await mapState()).workspaceOpen).toBe(true);
  await page.getByRole("button", { name: "Collapse ops console", exact: true }).click();
  await expect.poll(async () => !(await mapState()).expanded && !(await mapState()).workspaceOpen).toBe(true);
  results.checks.push("Saved Log scope starts minimized; explicit open and collapse work.");
  for (const width of [768, 834, 1024, 1300, 1440]) {
    console.log(`Checking navigation at ${width}px`);
    await page.setViewportSize({ width, height: 900 });
    const positions = [];
    for (const [route, name] of [["/", "Home"], ["/solar", "Solar Pulse"], ["/map", "PropSphere"]]) {
      await page.getByRole("banner").getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new URL(route, origin).href);
      await expect(page.getByRole("banner").getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
      if (route === "/map") await expect(page.locator("canvas[data-engine]")).toBeVisible({ timeout: 60000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(page.getByRole("banner").getByRole("button", { name: "Settings", exact: true })).toBeVisible();
      if (width >= 640) await expect(page.getByRole("banner").locator("time")).toBeVisible();
      const header = await page.getByRole("banner").evaluate(el => {
        const nav = el.querySelector("nav").getBoundingClientRect();
        const settings = el.querySelector('[aria-label="Settings"]').getBoundingClientRect();
        const bounds = el.getBoundingClientRect();
        return { x: nav.x, y: nav.y, settingsX: settings.x, settingsY: settings.y,
          width: bounds.width, right: settings.right, height: bounds.height };
      });
      expect(header.right).toBeLessThanOrEqual(width);
      positions.push(header);
      await page.screenshot({ path: `tmp/navigation-check/${width}-${name.replaceAll(" ", "-")}.png` });
    }
    for (const position of positions.slice(1)) expect(position).toEqual(positions[0]);
    results.checks.push(`Navigation and account controls stay fixed across Home/Solar/Map at ${width}px.`);
  }
  await page.setViewportSize({ width: 1300, height: 900 });
  await expect.poll(async () => !(await mapState()).expanded && !(await mapState()).workspaceOpen).toBe(true);
  await page.getByRole("combobox", { name: "PropSphere operating scope", exact: true }).first().selectOption("observe");
  await expect(page.locator("canvas[data-engine]")).toBeVisible();
  await page.getByRole("combobox", { name: "PropSphere operating scope", exact: true }).first().selectOption("log");
  await expect.poll(async () => (await mapState()).expanded && (await mapState()).workspaceOpen).toBe(true);
  results.checks.push("Explicit Log selection still opens the console.");
  await page.getByRole("button", { name: "Collapse ops console", exact: true }).click();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.evaluate(async () => {
    const loaded = async path => import(performance.getEntriesByType("resource").find(e => new URL(e.name).pathname === path)?.name ?? path);
    const { useContestStore } = await loaded("/src/stores/contestStore.ts");
    const { useContestUIStore } = await loaded("/src/stores/contestUIStore.ts");
    const { useMapOperationalStore } = await loaded("/src/stores/mapOperationalStore.ts");
    useContestStore.getState().startContest("cqww-ssb", "04", { operator: "single-op", power: "low", mode: "ssb", band: "all" });
    useContestUIStore.getState().setPublicAssistance(useContestStore.getState().activeSession.id, true);
    useMapOperationalStore.getState().setManualScope("contest");
  });
  await expect(page.locator('[data-map-scope="contest"][data-public-assistance="true"]').first()).toBeVisible();
  await expect.poll(async () => (await mapState()).expanded).toBe(false);
  await page.getByRole("button", { name: "Expand to Ops Console", exact: true }).click();
  await expect.poll(async () => (await mapState()).expanded && (await mapState()).workspaceOpen).toBe(true);
  await page.getByRole("button", { name: "Collapse ops console", exact: true }).click();
  await expect.poll(async () => !(await mapState()).expanded && !(await mapState()).workspaceOpen).toBe(true);
  results.checks.push("Assisted contest opener remains available at 1100px; opening/collapse updates shared workspace state.");
  expect(results.errors).toEqual([]);
  const fallbackContext = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await fallbackContext.addInitScript(() => {
    localStorage.setItem("propulse-welcome-seen", "true");
    localStorage.setItem("propulse-onboarding-completed", "true");
    localStorage.setItem("propulse-settings", JSON.stringify({ state: { radioSetupCompleted: true } }));
    window.__fixtureDisableWebGL = true;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (window.__fixtureDisableWebGL && kind.startsWith("webgl")) return null;
      return original.call(this, kind, ...args);
    };
  });
  const fallback = await fallbackContext.newPage();
  fallback.on("pageerror", error => results.errors.push(error.message));
  console.log("Checking unavailable WebGL and recovery");
  await fallback.goto(new URL("/map", origin).href);
  await expect(fallback.locator("[data-globe-unavailable]")).toBeVisible({ timeout: 60000 });
  await fallback.getByRole("button", { name: "Use flat map", exact: true }).click();
  await expect(fallback.locator("[data-globe-unavailable]")).toHaveCount(0);
  await expect(fallback.getByRole("img", { name: "Interactive propagation map - click to select target location", exact: true })).toBeVisible({ timeout: 60000 });
  await fallback.getByRole("button", { name: "3D Globe", exact: true }).click();
  await expect(fallback.locator("[data-globe-unavailable]")).toBeVisible();
  await fallback.evaluate(() => { window.__fixtureDisableWebGL = false; });
  await fallback.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(fallback.locator("canvas[data-engine]")).toBeVisible({ timeout: 60000 });
  results.checks.push("Unavailable WebGL offers a working flat map; retry restores the globe when WebGL recovers.");
  expect(results.errors).toEqual([]);
} finally {
  await writeFile("tmp/navigation-check/result.json", JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
