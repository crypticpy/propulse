import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page, Route } from "@playwright/test";
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
        ...[-2, -1, 0].map((offset) => ({ time_tag: new Date(Date.parse(now) + offset * 10_800_000).toISOString(), kp: offset === 0 ? 2.3 : 2, kind: offset === 0 ? "estimated" : "observed", noaa_scale: null, a_running: null })),
        ...Array.from({ length: 24 }, (_, i) => ({ time_tag: new Date(Date.parse(now) + (i + 1) * 10_800_000).toISOString(), kp: i > 15 && i < 21 ? 5 : 3, kind: "predicted", noaa_scale: null, a_running: null })),
      ];
    case "/api/solar/flux":
      return Array.from({ length: 7 }, (_, i) => ({ time_tag: new Date(Date.parse(now) - (6 - i) * 86_400_000).toISOString(), flux: 143 - i * 3, frequency: 2800, schedule: "noon" }));
    case "/api/solar/magnetometer":
      return Array.from({ length: 60 }, (_, i) => ({ time_tag: new Date(Date.parse(now) - (59 - i) * 60_000).toISOString(), bx_gsm: 1, by_gsm: 2, bz_gsm: i === 59 ? -3 : Math.sin(i / 8) * 4 - 1, bt: 5 }));
    case "/api/solar/probabilities":
      return { issue_time: now, c_class: 40, m_class: 10, x_class: 1, proton_10mev: 2, horizon: "1 day" };
    case "/api/solar/sunspots":
      return [{ time_tag: month, ssn: 118 }];
    case "/api/solar/xray":
      return Array.from({ length: 60 }, (_, i) => ({ time_tag: new Date(Date.parse(now) - (59 - i) * 60_000).toISOString(), flux: i === 59 ? 4e-7 : 4e-7 + 3e-6 * Math.exp(-((i - 20) ** 2) / 50), satellite: 18, energy: "0.1-0.8nm" }));
    case "/api/solar/protons":
      return [{ time_tag: now, flux: 0.5, satellite: 18, energy: ">=10 MeV" }];
    case "/api/solar/dst":
      return [{ time_tag: now, dst: -18 }];
    case "/api/solar/drap":
      return { observation_time: now, forecast_time: now, latitudes: [0, 1], longitudes: [0, 1], frequencies: [[0.5, 1], [1.5, 2]] };
    case "/api/solar/flux-forecast":
      return { issued_at: now, forecast: Array.from({ length: 3 }, (_, i) => ({ date: new Date(Date.parse(now) + i * 86_400_000).toISOString().slice(0, 10), predicted_flux: 130 - i * 2, predicted_planetary_a: 8 + i * 4 })) };
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
      return { time_tag: now, max_class: "C1.2", max_time: now, current_class: "B4.0", begin_time: now, end_time: null, satellite: 18 };
    case "/api/solar/wind-mag":
      return [{ time_tag: now, bx_gsm: null, by_gsm: null, bz_gsm: -2, bt: 6 }];
    case "/api/solar/wind-plasma":
      return [{ time_tag: now, density: null, speed: 440, temperature: null }];
    default:
      throw new Error(`Missing solar browser fixture for ${pathname}`);
  }
}

export async function installSolarFixtures(page: Page, options: { firstVisit?: boolean; textScale?: string } = {}) {
  const requested: string[] = [];
  const overrides = new Map<string, unknown>();
  const ages = new Map<string, number>();
  let failedDataPath: string | null = null;
  let failDrapImage = false;
  await page.addInitScript((options) => {
    if (!options.firstVisit) localStorage.setItem("propulse-welcome-seen", "true");
    localStorage.setItem("propulse-onboarding-completed", "true");
    localStorage.setItem(
      "propulse-settings",
      JSON.stringify({ state: { radioSetupCompleted: !options.firstVisit, textScale: options.textScale ?? "md" } }),
    );
  }, options);
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
        const product = url.searchParams.get("product") ?? "";
        const directory = process.env.SOLAR_VISUAL_MEDIA_DIR;
        const file = directory && ["sunspot-hmi", "drap-global", "aurora-north"].includes(product) ? path.join(directory, `${product}.${product === "drap-global" ? "png" : "jpg"}`) : null;
        await route.fulfill({ status: 200, contentType: file?.endsWith("jpg") ? "image/jpeg" : "image/png", body: file && existsSync(file) ? readFileSync(file) : PNG });
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
        data: overrides.has(url.pathname) ? overrides.get(url.pathname) : dataFor(url.pathname, now),
        observedAt: new Date(Date.parse(now) - (ages.get(url.pathname) ?? 0)).toISOString(),
        fetchedAt: now,
        sourceUrl: "https://services.swpc.noaa.gov/",
      }),
    });
  });
  return {
    requested,
    setData(pathname: string, data: unknown) { overrides.set(pathname, data); },
    ageData(pathname: string, ageMs: number) { ages.set(pathname, ageMs); },
    failData(pathname: string | null) {
      failedDataPath = pathname;
    },
    failImage(value: boolean) {
      failDrapImage = value;
    },
  };
}
