import { expect, test, type Page, type Route } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9Z8AAAAASUVORK5CYII=",
  "base64",
);

const DATA_SOURCES: Record<string, string> = {
  "/api/solar/k-index": "noaa-k-index",
  "/api/solar/flux": "noaa-solar-flux",
  "/api/solar/magnetometer": "noaa-magnetometer",
  "/api/solar/probabilities": "noaa-probabilities",
  "/api/solar/sunspots": "noaa-sunspots",
  "/api/solar/xray": "noaa-xray",
  "/api/solar/protons": "noaa-protons",
  "/api/solar/dst": "noaa-dst",
  "/api/solar/drap": "noaa-drap",
  "/api/solar/flux-forecast": "noaa-flux-forecast",
  "/api/solar/cme": "nasa-cme",
  "/api/solar/scales": "swpc-scales",
  "/api/solar/alerts": "swpc-alerts",
  "/api/solar/xray-latest": "swpc-xray-latest",
  "/api/solar/wind-mag": "swpc-solar-wind-mag",
  "/api/solar/wind-plasma": "swpc-solar-wind-plasma",
};

function dataFor(pathname: string, now: string): unknown {
  const month = now.slice(0, 7);
  switch (pathname) {
    case "/api/solar/k-index":
      return [
        { time_tag: now, kp: 2.3, kind: "estimated" },
        { time_tag: new Date(Date.parse(now) + 10_800_000).toISOString(), kp: 3, kind: "predicted" },
      ];
    case "/api/solar/flux":
      return [{ time_tag: now, flux: 125 }];
    case "/api/solar/magnetometer":
      return [{ time_tag: now, bx_gsm: 1, by_gsm: 2, bz_gsm: -3, bt: 5 }];
    case "/api/solar/probabilities":
      return { issue_time: now, c_class: 40, m_class: 10, x_class: 1, proton_10mev: 2, horizon: "one-day" };
    case "/api/solar/sunspots":
      return [{ time_tag: month, ssn: 118 }];
    case "/api/solar/xray":
      return [{ time_tag: now, flux: 4e-7, satellite: 18, energy: "0.1-0.8nm" }];
    case "/api/solar/protons":
      return [{ time_tag: now, flux: 0.5, satellite: 18, energy: ">=10 MeV" }];
    case "/api/solar/dst":
      return [{ time_tag: now, dst: -18 }];
    case "/api/solar/drap":
      return { time_tag: now, latitudes: [0, 1], longitudes: [0, 1], frequencies: [[0.5, 1], [1.5, 2]] };
    case "/api/solar/flux-forecast":
      return { issued_at: now, forecast: [{ date: now.slice(0, 10), predicted_flux: 130, predicted_planetary_a: 8 }] };
    case "/api/solar/cme":
      return [];
    case "/api/solar/scales":
      return {
        radio_blackout: { scale: 0, text: "none" },
        solar_radiation: { scale: 0, text: "none" },
        geomagnetic_storm: { scale: 0, text: "none" },
      };
    case "/api/solar/alerts":
      return [];
    case "/api/solar/xray-latest":
      return { max_class: "C1.2", max_time: now, current_class: "B4.0", current_time: now };
    case "/api/solar/wind-mag":
      return [{ time_tag: now, bx_gsm: null, by_gsm: null, bz_gsm: -2, bt: 6 }];
    case "/api/solar/wind-plasma":
      return [{ time_tag: now, density: null, speed: 440, temperature: null }];
    default:
      throw new Error(`Missing solar browser fixture for ${pathname}`);
  }
}

async function installSolarFixtures(page: Page) {
  const requested: string[] = [];
  let failedDataPath: string | null = null;
  let failDrapImage = false;
  await page.addInitScript(() => {
    localStorage.setItem("propulse-welcome-seen", "true");
    localStorage.setItem(
      "propulse-settings",
      JSON.stringify({ state: { radioSetupCompleted: true }, version: 33 }),
    );
  });
  await page.route("**/api/solar/**", async (route: Route) => {
    const url = new URL(route.request().url());
    requested.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/api/solar/image-meta") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ observedAt: new Date().toISOString(), checkedAt: new Date().toISOString() }),
      });
      return;
    }
    if (url.pathname === "/api/solar/image" || url.pathname === "/api/solar/frame") {
      if (
        failDrapImage &&
        url.pathname === "/api/solar/image" &&
        url.searchParams.get("product") === "drap-global"
      ) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      } else {
        await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
      }
      return;
    }
    if (url.pathname === "/api/solar/animation") {
      const product = url.searchParams.get("product") ?? "drap-global";
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          product,
          frames: [0, 1].map((frame) => ({
            time_tag: new Date(Date.parse(now) - (1 - frame) * 60_000).toISOString(),
            url: `/api/solar/frame?product=${product}&frame=${frame}`,
          })),
        }),
      });
      return;
    }
    const sourceId = DATA_SOURCES[url.pathname];
    if (!sourceId) {
      await route.fallback();
      return;
    }
    if (failedDataPath === url.pathname) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "UPSTREAM_REJECTED", message: "Injected outage", sourceId, retryable: true } }),
      });
      return;
    }
    const now = new Date().toISOString();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        sourceId,
        provider: sourceId.startsWith("nasa") ? "NASA DONKI" : "NOAA SWPC",
        product: `Fixture ${sourceId}`,
        data: dataFor(url.pathname, now),
        observedAt: now,
        fetchedAt: now,
        sourceUrl: "https://services.swpc.noaa.gov/",
      }),
    });
  });
  return {
    requested,
    failData(pathname: string | null) {
      failedDataPath = pathname;
    },
    failImage(value: boolean) {
      failDrapImage = value;
    },
  };
}

test("desktop journey retains last-good data, opens details, and recovers media", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"));
  const fixtures = await installSolarFixtures(page);
  await page.goto("/solar");

  await expect(page.getByRole("heading", { name: "What the Sun is doing now" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Planetary Kp", exact: true })).toContainText("2.3");
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  const kpRegion = page.getByRole("region", { name: "Planetary Kp", exact: true });
  await kpRegion.getByRole("button", { name: "Explain" }).click();
  const metricDialog = page.getByRole("dialog", { name: "Planetary Kp" });
  await expect(metricDialog).toBeVisible();
  await expect(metricDialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(metricDialog).toHaveCount(0);

  fixtures.failData("/api/solar/k-index");
  await page.getByRole("button", { name: "Refresh visible data feeds" }).click();
  await expect(page.getByText(/could not refresh/)).toBeVisible();
  await expect(kpRegion).toContainText("Stale");
  await expect(kpRegion).toContainText("2.3");

  const drapCard = page.locator("article").filter({ hasText: "Global D-RAP absorption" });
  await expect(drapCard).toHaveCount(1);
  fixtures.failImage(true);
  await drapCard.locator("img").evaluate((image: HTMLImageElement) => {
    image.dispatchEvent(new Event("error"));
  });
  await expect(drapCard.getByText("Image temporarily unavailable")).toBeVisible();
  fixtures.failImage(false);
  await drapCard.getByRole("button", { name: "Retry now" }).click();
  await expect(drapCard.getByText("Current")).toBeVisible();

  await drapCard.getByRole("button", { name: "Play timeline" }).click();
  const timelineDialog = page.getByRole("dialog", { name: "Global D-RAP absorption timeline" });
  await expect(timelineDialog).toBeVisible();
  await expect(timelineDialog.getByText("Frame 2 of 2")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(timelineDialog).toHaveCount(0);
});

test("mobile journey defers nonessential queries and expensive DOM until expansion", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  const fixtures = await installSolarFixtures(page);
  await page.goto("/solar");
  await expect(page.getByRole("heading", { name: "What the Sun is doing now" })).toBeVisible();

  const expectedInitialPaths = new Set([
    "/api/solar/k-index",
    "/api/solar/flux",
    "/api/solar/magnetometer",
    "/api/solar/xray",
    "/api/solar/scales",
    "/api/solar/alerts",
  ]);
  await expect.poll(
    () => new Set(fixtures.requested.map((request) => request.split("?")[0])),
    { message: "the complete mobile summary source set should start" },
  ).toEqual(expectedInitialPaths);
  expect(await page.locator("main svg").count()).toBe(0);
  expect(await page.locator("main table").count()).toBe(0);
  expect(await page.locator("main img").count()).toBe(0);
  expect(await page.locator("main *").count()).toBeLessThan(250);
  expect(await page.getByRole("region", { name: "Planetary Kp", exact: true }).count()).toBe(1);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBe(widths.client);
  const undersizedVisibleButtons = await page.locator("main button:visible").evaluateAll((buttons) =>
    buttons
      .map((button) => ({
        name: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "unnamed",
        rect: button.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .map(({ name, rect }) => `${name}: ${Math.round(rect.width)}x${Math.round(rect.height)}`),
  );
  expect(undersizedVisibleButtons).toEqual([]);

  const forecast = page.getByRole("button", {
    name: "Official forecast NOAA predicted Kp, solar flux, planetary A, and event probabilities",
  });
  await forecast.focus();
  await page.keyboard.press("Space");
  await expect(forecast).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("main svg")).not.toHaveCount(0);
  await expect(page.locator("main table")).toHaveCount(1);
  expect(fixtures.requested.some((request) => request.startsWith("/api/solar/probabilities"))).toBe(true);
  expect(fixtures.requested.some((request) => request.startsWith("/api/solar/flux-forecast"))).toBe(true);

  await page.getByRole("button", {
    name: "Details and history Chronological trends, solar cycle context, and independent wind products",
  }).click();
  expect(fixtures.requested.some((request) => request.startsWith("/api/solar/sunspots"))).toBe(true);
  expect(fixtures.requested.some((request) => request.startsWith("/api/solar/wind-mag"))).toBe(true);
  expect(fixtures.requested.some((request) => request.startsWith("/api/solar/wind-plasma"))).toBe(true);

  await page.getByRole("button", {
    name: "Imagery Cache-stable scientific maps with complete legends and recoverable timelines",
  }).click();
  await expect(page.locator("main img")).toHaveCount(6);
  expect(fixtures.requested.some((request) => request.startsWith("/api/solar/image?"))).toBe(true);
});
