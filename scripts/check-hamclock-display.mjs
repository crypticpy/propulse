import { chromium, expect } from "@playwright/test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
// Uses disposable contexts and synthetic station/log/radio data. Never connects hardware.
// Verify a managed local-profile server belonging to this checkout before testing.
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:5180");
if (
  origin.protocol !== "http:" ||
  origin.hostname !== "127.0.0.1" ||
  origin.pathname !== "/" ||
  origin.username ||
  origin.password
) {
  throw new Error("Pass a managed local URL such as http://127.0.0.1:5180");
}
const identityResponse = await fetch(
  new URL("/__propulse_dev_session", origin),
  { signal: AbortSignal.timeout(5000) },
);
const identity = await identityResponse.json();
if (
  !identityResponse.ok ||
  identity.profile !== "local" ||
  identity.root !== (await realpath(process.cwd()))
) {
  throw new Error(
    "This check requires this checkout's managed local-profile server. Run dev:session status.",
  );
}
await mkdir("tmp/hamclock-check", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
});
await context.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000);
  localStorage.setItem("propulse-welcome-seen", "true");
  localStorage.setItem("propulse-onboarding-completed", "true");
  localStorage.setItem(
    "propulse-settings",
    JSON.stringify({ state: { radioSetupCompleted: true } }),
  );
});
await context.route("**/api/spots/pskreporter*", (r) =>
  r.fulfill({
    json: {
      spots: Array.from({ length: 80 }, (_, i) => ({
        senderCallsign: `W0T${i}`,
        receiverCallsign: "N0TEST",
        senderLocator: `${i % 2 ? "FN" : "EM"}${i % 10}${Math.floor(i / 10)}`,
        receiverLocator: "IO91",
        frequency: i % 2 ? 14074000 : 7074000,
        mode: "FT8",
        sNR: -10,
        flowStartSeconds: Math.floor(Date.now() / 1000),
      })),
    },
  }),
);
await context.route("**/api/spots/dxcluster*", (r) =>
  r.fulfill({
    json: {
      spots: Array.from({ length: 8 }, (_, i) => ({
        id: `hc-${i}`,
        dx: `W${i}HCDX`,
        spotter: "N0TEST",
        dxGrid: i % 2 ? "FN42" : "EM38",
        frequency: i % 2 ? 14074 : 7030,
        mode: i % 2 ? "FT8" : "CW",
        band: i % 2 ? "20m" : "40m",
        time: new Date().toISOString(),
        comment: "Local UI fixture",
      })),
    },
  }),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const result = {
  server: {
    id: identity.id,
    root: identity.root,
    url: identity.url,
    owner: identity.owner,
  },
  checks: [],
  errors,
};
const check = (name) => {
  result.checks.push(name);
  console.log(name);
};
const state = () =>
  page.evaluate(async () => {
    const { useMapStore: m } = await import(
      performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/stores/mapStore.ts")
        ?.name || "/src/stores/mapStore.ts"
    );
    const s = m.getState();
    return {
      layoutMode: s.layoutMode,
      viewMode: s.viewMode,
      layers: s.layers,
      spotFilters: s.spotFilters,
      observatoryMode: s.observatoryMode,
    };
  });
try {
  await page.goto(new URL("/map", origin).href, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("button", { name: "Normal", exact: true })
    .waitFor({ timeout: 30000 });
  await page.evaluate(async () => {
    const { useProfileStore: p } = await import(
      performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/stores/profileStore.ts")
        ?.name || "/src/stores/profileStore.ts"
    );
    p.setState({
      station: {
        callsign: "N0TEST",
        grid: "EM38",
        lat: 38.5,
        lon: -92.5,
        homeLocationId: "test",
        activeLocationId: null,
        savedLocations: [
          {
            id: "test",
            name: "Test station",
            grid: "EM38",
            lat: 38.5,
            lon: -92.5,
            timezone: "America/Chicago",
          },
        ],
      },
    });
    const { useHamClockStore: h } = await import(
      performance
        .getEntriesByType("resource")
        .find(
          (e) => new URL(e.name).pathname === "/src/stores/hamclockStore.ts",
        )?.name || "/src/stores/hamclockStore.ts"
    );
    h.setState({ preferredViewMode: "flat" });
    const { useMapStore: m } = await import(
      performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/stores/mapStore.ts")
        ?.name || "/src/stores/mapStore.ts"
    );
    m.setState({
      target: { lat: 35.7, lon: 139.7, grid: "PM95", name: "Test DX" },
    });
    m.getState().setLayoutMode("hamclock");
  });
  await page
    .getByRole("button", { name: "Home region", exact: true })
    .waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const rootFont = await page
    .locator("html")
    .evaluate((e) => getComputedStyle(e).fontSize);
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await page.getByLabel("Text Size", { exact: true }).selectOption("lg");
  await page.getByRole("checkbox", { name: "Moon", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  expect((await state()).layoutMode).toBe("hamclock");
  expect(
    await page.locator("html").evaluate((e) => getComputedStyle(e).fontSize),
  ).toBe(rootFont);
  expect(await page.locator('[data-panel-id="moon"]').count()).toBe(0);
  check("Local text size and chosen panels; Escape dismisses settings");
  const dxSection = page.getByRole("region", { name: "DX Spots", exact: true });
  await expect(dxSection.locator("[data-spot-id]").first()).toBeVisible();
  const rowFit = await dxSection
    .locator("[data-spot-id]")
    .first()
    .evaluate((e) => ({ scroll: e.scrollWidth, width: e.clientWidth }));
  expect(rowFit.scroll).toBeLessThanOrEqual(rowFit.width + 1);
  await dxSection
    .getByRole("button", { name: "DX Spots", exact: true })
    .click();
  await expect(dxSection.getByRole("table")).toHaveCount(0);
  await dxSection
    .getByRole("button", { name: "DX Spots", exact: true })
    .click();
  check("Stacked DX entries fit the sidebar and collapse independently");
  const mapHeightBefore = await page
    .locator("[data-hamclock-root] main")
    .evaluate((e) => e.getBoundingClientRect().height);
  await page.locator('[data-panel-id="bands"] > button').click();
  await page.waitForTimeout(300);
  const mapHeightAfter = await page
    .locator("[data-hamclock-root] main")
    .evaluate((e) => e.getBoundingClientRect().height);
  expect(mapHeightAfter).toBe(mapHeightBefore);
  result.bandConditionsHeight = {
    before: mapHeightBefore,
    after: mapHeightAfter,
  };
  check("Expanding Band Conditions preserves map height");
  await page.getByRole("button", { name: "20m", exact: true }).click();
  expect((await state()).spotFilters.bands).toEqual(["20m"]);
  expect((await state()).layers.gridActivity).toBe(true);
  await page.getByRole("button", { name: "My contacts", exact: true }).click();
  expect((await state()).layers).toMatchObject({
    spots: false,
    gridActivity: false,
    loggedQsos: true,
  });
  await page.getByRole("button", { name: "Both", exact: true }).click();
  expect((await state()).layers).toMatchObject({
    spots: true,
    gridActivity: true,
    loggedQsos: true,
  });
  check("Activity band filters and contacts/both map contents");
  await page.getByRole("button", { name: "Observatory", exact: true }).click();
  expect(await state()).toMatchObject({
    layoutMode: "hamclock",
    viewMode: "flat",
    observatoryMode: true,
  });
  await page.getByRole("button", { name: "Observatory", exact: true }).click();
  expect(await state()).toMatchObject({
    layoutMode: "hamclock",
    viewMode: "flat",
    observatoryMode: false,
  });
  check("Observatory keeps HamClock composition and projection");
  const operator = await context.newPage();
  await operator.goto(new URL("/solar", origin).href, {
    waitUntil: "domcontentloaded",
  });
  await operator.waitForTimeout(1200);
  const id = await operator.evaluate(async () => {
    const db = await import(
      performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/lib/db/logStore.ts")
        ?.name || "/src/lib/db/logStore.ts"
    );
    return db.addLogEntry({
      callsign: "W1HCTEST",
      date: new Date().toISOString().slice(0, 10),
      timeOn: "23:40",
      band: "20m",
      mode: "FT8",
      frequency: 14074,
      grid: "FN42",
    });
  });
  const contacts = page.getByRole("region", {
    name: "Recent Contacts",
    exact: true,
  });
  await expect(contacts.getByText("✓ W1HCTEST", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await operator.evaluate(async (id) => {
    const db = await import(
      performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/lib/db/logStore.ts")
        ?.name || "/src/lib/db/logStore.ts"
    );
    await db.updateLogEntry(id, { callsign: "W2HCTEST", grid: "" });
  }, id);
  await expect(contacts.getByText("✓ W2HCTEST", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    contacts.getByText("Location unavailable", { exact: true }),
  ).toBeVisible();
  await operator.evaluate(async (id) => {
    const db = await import(
      performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/lib/db/logStore.ts")
        ?.name || "/src/lib/db/logStore.ts"
    );
    await db.deleteLogEntry(id);
  }, id);
  await expect(contacts.getByText("✓ W2HCTEST", { exact: true })).toHaveCount(
    0,
    { timeout: 10000 },
  );
  check("Cross-window log creation, edit, unknown location and deletion");
  await operator.evaluate(async () => {
    const { useOperatingStore: o } = await import(
      performance
        .getEntriesByType("resource")
        .find(
          (e) => new URL(e.name).pathname === "/src/stores/operatingStore.ts",
        )?.name || "/src/stores/operatingStore.ts"
    );
    o.setState({
      activeSource: "cat",
      activeBand: "40m",
      activeMode: "CW",
      activeFrequency: 7030000,
    });
  });
  const follow = page.getByRole("checkbox", { name: /Follow radio/ });
  await expect(follow).toBeEnabled({ timeout: 10000 });
  await follow.check();
  await expect
    .poll(async () => (await state()).spotFilters)
    .toEqual({ bands: ["40m"], modes: ["CW"] });
  await page.evaluate(async () => {
    const { useMapStore: map } = await import(
      performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/stores/mapStore.ts")
        ?.name || "/src/stores/mapStore.ts"
    );
    map.getState().setSpotFilters({ bands: ["20m"], modes: ["FT8"] });
  });
  await expect(follow).not.toBeChecked();
  await follow.check();
  await expect
    .poll(async () => (await state()).spotFilters)
    .toEqual({ bands: ["40m"], modes: ["CW"] });
  check(
    "Shared manual DX filters stop radio following; re-enabling resumes it",
  );
  await page
    .getByRole("button", { name: "Collapse right sidebar", exact: true })
    .first()
    .click();
  await operator.evaluate(async () => {
    const { useOperatingStore: o } = await import(
      performance
        .getEntriesByType("resource")
        .find(
          (e) => new URL(e.name).pathname === "/src/stores/operatingStore.ts",
        )?.name || "/src/stores/operatingStore.ts"
    );
    o.setState({
      activeBand: "20m",
      activeMode: "FT8",
      activeFrequency: 14074000,
    });
  });
  await expect
    .poll(async () => (await state()).spotFilters)
    .toEqual({ bands: ["20m"], modes: ["FT8"] });
  await page
    .getByRole("button", { name: "Expand right sidebar", exact: true })
    .first()
    .click();
  await operator.evaluate(async () => {
    const { useOperatingStore: o } = await import(
      performance
        .getEntriesByType("resource")
        .find(
          (e) => new URL(e.name).pathname === "/src/stores/operatingStore.ts",
        )?.name || "/src/stores/operatingStore.ts"
    );
    o.setState({
      activeBand: "40m",
      activeMode: "CW",
      activeFrequency: 7030000,
    });
  });
  await expect
    .poll(async () => (await state()).spotFilters)
    .toEqual({ bands: ["40m"], modes: ["CW"] });
  check("Radio following continues with its sidebar collapsed");
  const monitoredSource = await page.evaluate(async () => {
    const { useOperatingStore: o } = await import(
      performance
        .getEntriesByType("resource")
        .find(
          (e) => new URL(e.name).pathname === "/src/stores/operatingStore.ts",
        )?.name || "/src/stores/operatingStore.ts"
    );
    return o.getState().activeSource;
  });
  expect(monitoredSource).not.toBe("cat");
  await operator.evaluate(async () => {
    const { useOperatingStore: o } = await import(
      performance
        .getEntriesByType("resource")
        .find(
          (e) => new URL(e.name).pathname === "/src/stores/operatingStore.ts",
        )?.name || "/src/stores/operatingStore.ts"
    );
    o.setState({ activeSource: "manual" });
  });
  await expect(
    page.getByText("Paused · no live radio", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "20m", exact: true }).click();
  expect((await state()).spotFilters.bands).toEqual(["40m", "20m"]);
  await expect(follow).not.toBeChecked();
  check(
    "Follow radio receives updates without changing operating state; disconnect and manual fallback",
  );
  await expect(dxSection.locator("[data-spot-id]")).toHaveCount(4);
  await operator.close();
  await page.screenshot({ path: "tmp/hamclock-check/functional-1920.png" });
  await page.screenshot({
    path: "tmp/hamclock-check/preview.jpg",
    quality: 70,
  });
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "tmp/hamclock-check/functional-4k.png" });
  const camera = () =>
    page.evaluate(() => window.__propulseFlatMapDiagnostics.snapshot().camera);
  await page.getByRole("button", { name: "Home region", exact: true }).click();
  await page.waitForTimeout(1000);
  const homeCamera = await camera();
  const onScreen = (view, lat, lon) => {
    const x = view.offsetX + ((lon + 180) / 360) * view.mapWidth * view.scale;
    const y = view.offsetY + ((90 - lat) / 180) * view.mapHeight * view.scale;
    return (
      x >= -1 &&
      x <= view.viewportWidth + 1 &&
      y >= -1 &&
      y <= view.viewportHeight + 1
    );
  };
  for (const [lat, lon] of [
    [39.74, -104.99],
    [-34.6, -58.4],
    [51.5, 0],
    [-34, 18.4],
    [31.8, 35.2],
  ]) {
    expect(onScreen(homeCamera, lat, lon)).toBe(true);
  }
  check(
    "4K home framing includes the Americas, Europe, Africa and western Middle East",
  );
  await page.screenshot({ path: "tmp/hamclock-check/home-context-4k.png" });
  const mapCanvas = page.locator(
    '[data-hamclock-root] main canvas[role="img"]',
  );
  const bounds = await mapCanvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.evaluate(() => window.__propulseFlatMapDiagnostics.reset());
  // A sustained gesture must reuse its retained image, not rerasterize UHD
  // illumination at every wheel event. Timing itself varies across machines.
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(700);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(30);
  }
  await expect
    .poll(
      async () => {
        const view = await camera();
        return Math.abs(
          view.scale -
            Math.min(
              view.viewportWidth / view.mapWidth,
              view.viewportHeight / view.mapHeight,
            ),
        );
      },
      { timeout: 10000 },
    )
    .toBeLessThan(0.001);
  const worldCamera = await camera();
  for (const [lat, lon] of [
    [90, -180],
    [-90, 180],
    [35.7, 139.7],
    [-33.9, 151.2],
  ]) {
    expect(onScreen(worldCamera, lat, lon)).toBe(true);
  }
  const gesturePaints = await page.evaluate(
    () => window.__propulseFlatMapDiagnostics.snapshot().paints,
  );
  expect(gesturePaints.base).toBeLessThan(20);
  expect(gesturePaints.science).toBeLessThan(20);
  result.fidelity = { homeCamera, worldCamera, gesturePaints };
  check(
    "World zoom-out includes Japan and Australia; gestures reuse retained imagery",
  );
  await page.screenshot({ path: "tmp/hamclock-check/world-context-4k.png" });
  // Cross the pan threshold with exactly one move, then release before a
  // preview camera exists. This used to leave all clicks suppressed.
  const emptyOcean = {
    x:
      bounds.x +
      worldCamera.offsetX +
      (150 / 360) * worldCamera.mapWidth * worldCamera.scale,
    y:
      bounds.y +
      worldCamera.offsetY +
      (90 / 180) * worldCamera.mapHeight * worldCamera.scale,
  };
  await page.mouse.move(emptyOcean.x, emptyOcean.y);
  await page.mouse.down();
  await page.mouse.move(emptyOcean.x + 5, emptyOcean.y);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.mouse.dblclick(emptyOcean.x, emptyOcean.y, { delay: 60 });
  await expect
    .poll(async () => (await camera()).scale, { timeout: 5000 })
    .toBeGreaterThan(worldCamera.scale + 0.01);
  check("Map double-click remains usable after a threshold-only drag");
  await page.getByRole("button", { name: "Home region", exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "3D globe", exact: true }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "tmp/hamclock-check/functional-globe.png" });
  expect(await state()).toMatchObject({
    layoutMode: "hamclock",
    viewMode: "globe",
  });
  check("4K flat and fixed-panel 3D smoke");
  await page
    .getByRole("button", { name: "Azimuthal map", exact: true })
    .click();
  await page.waitForTimeout(1500);
  expect(await state()).toMatchObject({
    layoutMode: "hamclock",
    viewMode: "azimuthal",
  });
  await expect(
    page.getByRole("button", { name: "My contacts", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Both", exact: true }),
  ).toBeDisabled();
  expect((await state()).layers.loggedQsos).toBe(false);
  check(
    "Azimuthal shows activity and disables unsupported contact-map choices",
  );
  await page.getByRole("button", { name: "Flat map", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Both", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await state()).layers.loggedQsos).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1000);
  const overflow = await page
    .locator("header.hamclock-ui")
    .evaluate((e) => ({ scroll: e.scrollWidth, width: e.clientWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
  await page.screenshot({ path: "tmp/hamclock-check/functional-1280.png" });
  check("1280px controls fit");
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await page.getByLabel("Text Size", { exact: true }).selectOption("250");
  await page.keyboard.press("Escape");
  const largeOverflow = await page
    .locator("header.hamclock-ui")
    .evaluate((e) => ({ scroll: e.scrollWidth, width: e.clientWidth }));
  expect(largeOverflow.scroll).toBeLessThanOrEqual(largeOverflow.width + 1);
  expect(
    await page
      .locator('[data-panel-id="de"] > button')
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(27);
  await page.screenshot({ path: "tmp/hamclock-check/functional-250.png" });
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This selection needs scrolling" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset display", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-panel-id="moon"]')).toHaveCount(1);
  check("250% text keeps controls reachable; reset restores panels");
  expect((await state()).layers.loggedQsos).toBe(false);
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await page.getByLabel("Text Size", { exact: true }).selectOption("250");
  await page
    .getByRole("checkbox", { name: "Smart scaling", exact: true })
    .uncheck();
  await page.keyboard.press("Escape");
  const constrained = await page
    .locator("[data-hamclock-root]")
    .evaluate((e) => ({
      width: e.clientWidth,
      scroll: e.scrollWidth,
      mapWidth: e.querySelector("main").getBoundingClientRect().width,
    }));
  expect(constrained.scroll).toBeLessThanOrEqual(constrained.width + 1);
  expect(constrained.mapWidth).toBeGreaterThanOrEqual(319);
  check("Disabling smart scaling still reserves usable map space at 250%");
  await page.evaluate(async () => {
    const { useHamClockDisplayStore: d } = await import(
      performance
        .getEntriesByType("resource")
        .find(
          (e) =>
            new URL(e.name).pathname === "/src/stores/hamclockDisplayStore.ts",
        )?.name || "/src/stores/hamclockDisplayStore.ts"
    );
    d.getState().resetDisplay();
    d.getState().frameHome({
      lat: -17,
      lon: 179,
      latitudeSpan: 65,
      longitudeSpan: 105,
    });
  });
  await expect(
    page.getByText(/Dateline region · world overview/),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator('[data-hamclock-root] main canvas[role="img"]')
        .evaluate((e) => e.clientWidth / e.clientHeight),
    )
    .toBeCloseTo(2, 1);
  check("Dateline Flat fallback shows an uncropped 2:1 world overview");

  expect(errors).toEqual([]);
} catch (e) {
  result.failure = String(e);
  await page
    .screenshot({ path: "tmp/hamclock-check/functional-failure.png" })
    .catch(() => {});
  throw e;
} finally {
  await writeFile(
    "tmp/hamclock-check/functional.json",
    JSON.stringify(result, null, 2),
  );
  await browser.close();
}
