import assert from "node:assert/strict";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Only synthetic local state in a disposable context. No login or hardware use.
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:5182");
assert.equal(origin.protocol, "http:");
assert.equal(origin.hostname, "127.0.0.1");
assert.equal(origin.pathname, "/");
assert.equal(origin.username + origin.password, "");
const identity = await fetch(new URL("/__propulse_dev_session", origin), {
  signal: AbortSignal.timeout(5000),
}).then((r) => r.json());
assert.equal(identity.root, await realpath(process.cwd()));
assert.equal(identity.profile, "local");
assert.equal(identity.owner, "station-profile-ui");
const output = "tmp/station-workspace";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addInitScript(() => {
    performance.setResourceTimingBufferSize(10000);
    localStorage.setItem("propulse-welcome-seen", "true");
    localStorage.setItem("propulse-onboarding-completed", "true");
    const saved = JSON.parse(localStorage.getItem("propulse-settings") ?? "{}");
    localStorage.setItem(
      "propulse-settings",
      JSON.stringify({
        ...saved,
        state: { ...saved.state, radioSetupCompleted: true },
      }),
    );
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/shack", origin).href, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "My shack", exact: true }).waitFor();
  // Wait for existing development seed helper, then replace only this context's fixtures.
  await page.waitForFunction(
    () => typeof window.__clearEquipment === "function",
  );
  await page.evaluate(async () => {
    const moduleUrl = (file) =>
      performance
        .getEntriesByType("resource")
        .filter((e) => new URL(e.name).pathname === file)
        .at(-1)?.name ?? file;
    const { useShackStore: s } = await import(
      moduleUrl("/src/stores/shackStore.ts")
    );
    const { useProfileStore: p } = await import(
      moduleUrl("/src/stores/profileStore.ts")
    );
    s.setState({
      radios: [],
      customRadios: [],
      activeRadioId: null,
      antennas: [],
      feedlines: [],
      accessories: [],
      inlineComponents: [],
      stationChains: [],
      activeChainId: null,
      stationPresets: [],
      activePresetId: null,
    });
    p.setState({
      station: {
        callsign: "N0TEST",
        operatorName: "Alex Morgan",
        grid: "EM38",
        lat: 38.5,
        lon: -92.5,
        homeLocationId: "fixture-home",
        activeLocationId: null,
        savedLocations: [
          {
            id: "fixture-home",
            name: "Home shack",
            grid: "EM38",
            lat: 38.5,
            lon: -92.5,
            timezone: "America/Chicago",
          },
        ],
      },
    });
  });
  await page.getByRole("tab", { name: "My gear", exact: true }).click();
  await page
    .getByRole("button", { name: "Add gear individually", exact: true })
    .click();
  await page.getByRole("group", { name: "Equipment categories" }).waitFor();
  checks.push(
    "Empty station can leave guided setup and access real equipment managers",
  );
  await page.screenshot({ path: `${output}/gear-empty.png`, fullPage: true });
  await page.evaluate(async () => {
    const moduleUrl = (file) =>
      performance
        .getEntriesByType("resource")
        .filter((e) => new URL(e.name).pathname === file)
        .at(-1)?.name ?? file;
    const { useShackStore: s } = await import(
      moduleUrl("/src/stores/shackStore.ts")
    );
    const radio = s.getState().addRadio("icom-ic7300", "Desk transceiver");
    const antenna = s.getState().addAntenna({
      name: "Backyard dipole",
      antennaType: "dipole",
      heightMeters: 12,
      bands: ["20m", "40m"],
      polarization: "horizontal",
      mounting: "tree",
    });
    const feedline = s.getState().addFeedline({
      name: "Main antenna run",
      feedlineType: "lmr400",
      lengthFeet: 50,
      connectorCount: 2,
      connectorType: "pl259",
      condition: "good",
    });
    const chain = s.getState().addChain({
      name: "Home HF station",
      nodes: [
        { type: "radio", radioId: radio },
        { type: "feedline_run", feedlineRunId: "fixture-run" },
        { type: "antenna", antennaId: antenna },
      ],
      feedlineRuns: [
        { id: "fixture-run", feedlineId: feedline, inlineComponentIds: [] },
      ],
      operatingPowerWatts: 100,
      shackAccessoryIds: [],
    });
    s.getState().setActiveChain(chain);
  });
  for (const theme of ["dark", "light", "high-contrast", "midnight"]) {
    await page.evaluate(async (theme) => {
      const file = "/src/stores/themeStore.ts";
      const { useThemeStore } = await import(
        performance
          .getEntriesByType("resource")
          .filter((e) => new URL(e.name).pathname === file)
          .at(-1)?.name ?? file
      );
      useThemeStore.getState().setTheme(theme);
    }, theme);
    for (const view of ["Workbench", "My gear", "Performance & experiments"]) {
      await page.getByRole("tab", { name: view, exact: true }).click();
      await expect(
        page.getByRole("tab", { name: view, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.screenshot({
        path: `${output}/${view.split(" ")[0].toLowerCase()}-${theme}.png`,
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${view} ${theme} horizontal overflow`,
      );
    }
    checks.push(
      `Three real shack views render without horizontal overflow: ${theme}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ["Workbench", "My gear", "Performance & experiments"]) {
    await page.getByRole("tab", { name: view, exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${view} mobile horizontal overflow`,
    );
    await page.screenshot({
      path: `${output}/${view.split(" ")[0].toLowerCase()}-mobile.png`,
      fullPage: true,
    });
  }
  checks.push("Three real shack views reflow at 390px");
  await page.getByRole("link", { name: "My profile", exact: false }).click();
  await page.getByRole("tab", { name: "Overview", exact: true }).waitFor();
  for (const name of [
    "Overview",
    "My shack",
    "Awards",
    "Stats & records",
    "Social & sharing",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Profile ${name} mobile horizontal overflow`,
    );
  }
  checks.push(
    "All five existing owner profile tabs remain reachable on mobile",
  );
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: `${output}/profile-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: `${output}/profile-desktop.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        identity,
        data: "Disposable synthetic local fixtures; existing dev logbook seed; no authenticated cloud evidence",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(JSON.stringify({ checks, errors }, null, 2));
