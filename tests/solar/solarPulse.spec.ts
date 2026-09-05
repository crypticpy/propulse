import { expect, test } from "@playwright/test";
import { installSolarFixtures } from "./fixtures";

test("desktop journey retains last-good data, opens details, and recovers media", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"));
  const fixtures = await installSolarFixtures(page);
  await page.goto("/solar");

  await expect(page.getByRole("heading", { name: "Solar Pulse" })).toBeVisible();
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
  await page.getByRole("button", { name: "Refresh" }).click();
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
  await expect(page.getByRole("heading", { name: "Solar Pulse" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Three-day outlook" })).toBeVisible();
  await page.getByRole("button", { name: "Show values" }).click();
  await expect(page.locator("main table")).toHaveCount(1);
  await expect.poll(() => fixtures.requested.some((request) => request.startsWith("/api/solar/probabilities"))).toBe(true);
  await expect.poll(() => fixtures.requested.some((request) => request.startsWith("/api/solar/flux-forecast"))).toBe(true);

  await page.getByRole("button", {
    name: "Details and history Explore solar history, the solar cycle, and the wind approaching Earth",
  }).click();
  await expect.poll(() => fixtures.requested.some((request) => request.startsWith("/api/solar/sunspots"))).toBe(true);
  await expect.poll(() => fixtures.requested.some((request) => request.startsWith("/api/solar/wind-mag"))).toBe(true);
  await expect.poll(() => fixtures.requested.some((request) => request.startsWith("/api/solar/wind-plasma"))).toBe(true);

  await page.getByRole("button", {
    name: "Imagery Explore absorption, aurora, and the visible Sun",
  }).click();
  await expect(page.locator("main img")).toHaveCount(6);
  await expect.poll(() => fixtures.requested.some((request) => request.startsWith("/api/solar/image?"))).toBe(true);
});
