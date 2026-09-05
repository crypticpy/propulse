import { expect, test } from "@playwright/test";
import { installSolarFixtures } from "./fixtures";

const stamp = () => new Date().toISOString();
const scales = (r = 0, s = 0, g = 0) => ({ observed_at: stamp(), radio_blackout: { scale: r, text: r ? "Minor" : "none" }, solar_radiation: { scale: s, text: s ? "Minor" : "none" }, geomagnetic_storm: { scale: g, text: g ? "Minor" : "none" } });

test("a blackout overrides quiet background, preserves provenance, and distinguishes recent watches", async ({ page }) => {
  const fixture = await installSolarFixtures(page);
  fixture.setData("/api/solar/scales", scales(1));
  fixture.setData("/api/solar/alerts", Array.from({ length: 6 }, (_, i) => ({ product_id: `WAT${i}`, issued_at: stamp(), title: `NOAA watch ${i + 1}`, severity: "watch", message: "WATCH: geomagnetic conditions tomorrow. Refer to issue and validity times." })));
  await page.goto("/solar");
  const briefing = page.getByRole("region", { name: "HF briefing", exact: true });
  await expect(briefing.getByRole("heading")).toHaveText("Radio-blackout conditions need attention");
  await expect(briefing).toContainText("Sunlit HF paths may be affected");
  await briefing.getByRole("button", { name: "Why this briefing?" }).click();
  await expect(briefing).toContainText("X-ray flux (B4.0) and the official R1 snapshot differ");
  await briefing.getByRole("button", { name: "Sources & times" }).click();
  await expect(briefing.getByRole("link", { name: "NOAA weather scales" })).toBeVisible();
  await page.getByRole("button", { name: "Show all 6 bulletins" }).click();
  await expect(page.getByRole("button", { name: /NOAA watch 6/ })).toBeVisible();
  await page.getByRole("button", { name: /NOAA watch 6/ }).click();
  await expect(page.getByRole("dialog")).toContainText("validity times");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /NOAA watch 6/ })).toBeFocused();
});

test("unusable X-ray data qualifies supportive inputs instead of silently retaining it", async ({ page }) => {
  const fixture = await installSolarFixtures(page);
  fixture.ageData("/api/solar/xray", 3_600_000);
  await page.goto("/solar");
  const briefing = page.getByRole("region", { name: "HF briefing", exact: true });
  await expect(briefing.getByRole("heading")).toHaveText("The HF picture is incomplete");
  await expect(briefing).toContainText("Unavailable:");
  await expect(page.getByRole("region", { name: "GOES long X-ray", exact: true })).not.toContainText("B4.0");
});

test("retained event probabilities disclose when their one-day forecast window ended", async ({ page }, info) => {
  const fixture = await installSolarFixtures(page);
  const issued = new Date(Date.now() - 25 * 3_600_000).toISOString();
  fixture.setData("/api/solar/probabilities", { issue_time: issued, horizon: "1 day", c_class: 40, m_class: 10, x_class: 1, proton_10mev: 2 });
  fixture.ageData("/api/solar/probabilities", 25 * 3_600_000);
  await page.goto("/solar");
  if (info.project.name.startsWith("mobile")) await page.getByRole("button", { name: /^Official forecast/ }).click();
  const forecast = page.getByRole("region", { name: "One-day event probabilities", exact: true });
  await expect(forecast).toContainText("one-day window has ended");
  await expect(forecast).not.toContainText("Data current");
  await expect(forecast).toContainText("40%");
});

test("chart inspection works with keyboard and touch and retains data gaps", async ({ page }) => {
  const fixture = await installSolarFixtures(page);
  const now = Date.now();
  fixture.setData("/api/solar/magnetometer", [
    { time_tag: new Date(now - 30 * 60_000).toISOString(), bz_gsm: -4, by_gsm: 1, bt: 5 },
    { time_tag: new Date(now - 29 * 60_000).toISOString(), bz_gsm: -2, by_gsm: 1, bt: 5 },
    // NOAA also supplies UTC instants without an explicit zone suffix.
    { time_tag: new Date(now).toISOString().slice(0, -1), bz_gsm: 1, by_gsm: 1, bt: 5 },
  ]);
  await page.goto("/solar");
  await page.getByRole("button", { name: /^Details and history/ }).click();
  const region = page.getByRole("region", { name: "IMF Bz history", exact: true });
  await expect(region).toContainText("1 gap in coverage");
  const slider = region.getByRole("slider");
  await expect(slider).toHaveAttribute("aria-valuetext", `${new Date(now).toISOString()}: 1 nT, observed`);
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", /-4 nT/);
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /-2 nT/);
  await slider.click({ position: { x: 8, y: 20 } });
  await expect(slider).toHaveAttribute("aria-valuetext", /-4 nT/);
  await region.getByRole("button", { name: "Show values" }).click();
  await expect(region.getByRole("row")).toHaveCount(4);
});

test("desktop disclosure choices do not start hidden work on mobile", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("desktop"));
  await installSolarFixtures(page);
  await page.goto("/solar");
  await page.getByRole("button", { name: /^Details and history/ }).click();
  await page.getByRole("button", { name: /^Imagery/ }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Details and history/ })).toHaveAttribute("aria-expanded", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: /^Details and history/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("main svg, main img, main table")).toHaveCount(0);
  await page.getByRole("button", { name: /^Official forecast/ }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Official forecast/ })).toHaveAttribute("aria-expanded", "true");
});

test("responsive visual review including larger shared text and reduced motion", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("desktop"));
  await installSolarFixtures(page, { textScale: "lg" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, width, height] of [["phone", 390, 844], ["tablet", 834, 1194], ["desktop", 1440, 1000], ["large", 2560, 1440]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/solar");
    await expect(page.getByRole("region", { name: "HF briefing", exact: true })).toContainText("Evidence current");
    await expect(page.locator("html")).toHaveAttribute("data-text-scale", "lg");
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    const overflow = await page.locator("body *").evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(node).position !== "fixed").slice(0, 15).map((node) => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right })));
    expect(widths.scroll, JSON.stringify(overflow)).toBe(widths.client);
    if (width >= 768) {
      await expect(page.getByRole("region", { name: "Planetary Kp timeline", exact: true }).getByRole("slider")).toBeVisible();
      for (const image of await page.locator("main img").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0 && getComputedStyle(node).opacity === "1")).toBe(true);
      }
    }
    await page.getByRole("heading", { name: "Solar Pulse", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`solar-${name}.png`), fullPage: true });
  }
});

test("first visit reaches the briefing without configuring hardware", async ({ page }) => {
  await installSolarFixtures(page, { firstVisit: true });
  await page.goto("/solar");
  await page.getByRole("button", { name: "Close welcome overlay" }).click();
  const setup = page.getByRole("button", { name: "Close setup wizard" });
  if (await setup.isVisible()) await setup.click();
  await expect(page.getByRole("heading", { name: "Supportive HF background conditions" })).toBeVisible();
});

for (const [link, destination] of [["Plan a session", "/planner"], ["Find a band for a target", "/dx"]] as const) {
  test(`operating link opens ${destination} with usable handoff context`, async ({ page }) => {
    await installSolarFixtures(page);
    await page.goto("/solar");
    await page.getByRole("link", { name: link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(destination));
    await expect(page.getByText(/From Solar Pulse/)).toBeVisible();
    if (destination === "/planner") {
      const mode = page.getByRole("combobox", { name: "Planning mode" });
      await expect(mode).toHaveValue("SSB");
      await mode.selectOption("CW");
      await expect(mode).toHaveValue("CW");
    } else {
      await expect(page).toHaveURL(/mode=SSB/);
      await expect(page.getByText(/From Solar Pulse/)).toBeVisible();
    }
  });
}
