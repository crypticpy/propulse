import { expect, test, type Page } from "@playwright/test";
import { installSolarFixtures } from "../solar/fixtures";

async function fixtures(page: Page, extraLocations?: Array<{ id: string; name: string; grid: string; lat: number; lon: number }>) {
  const requests: string[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    requests.push(path);
    return route.fulfill({ status: 503, json: { error: "Unavailable optional source fixture" } });
  });
  const solar = await installSolarFixtures(page, { extraLocations });
  await page.route("https://api.open-meteo.com/**", route => {
    const time = Math.floor(Date.now()/1000);
    return route.fulfill({json:{timezone:"America/Denver",current:{time,temperature_2m:18,wind_speed_10m:8,wind_gusts_10m:14,weather_code:0},hourly:{time:Array.from({length:25},(_,i)=>time+i*3600),temperature_2m:Array(25).fill(16),precipitation_probability:Array(25).fill(10),wind_speed_10m:Array(25).fill(8)}}});
  });
  await page.route("**/api/spots/band-activity*", route => route.fulfill({ json: { meta: { fetchedAt: new Date().toISOString() }, bands: [
    ["20m", 420, 78, { phone: 200, digital: 180, cw: 40 }], ["40m", 180, 40, { digital: 150, cw: 30 }], ["15m", 90, 21, { phone: 80, cw: 10 }], ["10m", 20, 8, { digital: 20 }], ["80m", 0, 0, {}],
  ].map(([band, count, reporters, modes]) => ({ band, count_60m: count, obs_20m: count, reporters_20m: reporters, count_10m_recent: count, count_10m_prior: count, source_counts_60m: { RBN: count }, mode_obs_20m: modes })) } }));
  await page.addInitScript(() => {
    // Suppress development fixtures without writing cloud data or entitlements.
    localStorage.setItem("propulse-onboarding-completed", "true");
  });
  return { solar, requests };
}

test("current band reports lead Home and optional feeds wait", async ({ page }, info) => {
  const { requests } = await fixtures(page);
  await page.goto("/");
  const home = page.locator("[data-home-elevation]");
  await expect(home.getByRole("heading", { name: "On the bands now" })).toBeVisible();
  await expect(home.getByText("420", { exact: true })).toBeVisible();
  await expect(home.getByText(/Regional · North America/)).toBeVisible();
  await expect(home.getByText(/Phone 200/)).toBeVisible();
  await expect(home.getByText("Global Conditions Score")).toHaveCount(0);
  await expect(home.getByText(/All Quiet/)).toHaveCount(0);
  expect(requests.filter(path => /atmos|tides|news|dxpedition/.test(path))).toEqual([]);
  const viewport = page.viewportSize()!;
  expect((await home.getByRole("heading", { name: "On the bands now" }).boundingBox())!.y).toBeLessThan(500);
  await page.screenshot({ path: `tmp/home-elevation/${info.project.name}-initial.png`, fullPage: true });

  await expect(home.getByText("No recent reports · conditions unknown")).toBeVisible();
  expect(await home.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `tmp/home-elevation/${info.project.name}-${viewport.width}.png`, fullPage: true });
});

test("failed updates withhold retained activity instead of declaring bands closed", async ({ page }) => {
  await fixtures(page);
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByText("420", { exact: true })).toBeVisible();
  await page.route("**/api/spots/band-activity*", route => route.fulfill({ status: 503, json: {} }));
  const failed = page.waitForResponse(response => response.url().includes("/api/spots/band-activity") && response.status() === 503);
  await page.clock.fastForward(65_000);
  await failed;
  await page.clock.runFor(2_000);
  await expect(page.getByText("420", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Activity updates are unavailable/)).toBeVisible();
});

test("impact briefing leads on phone, expired inputs are explained, and refresh scope is clear", async ({ page }) => {
  const { solar } = await fixtures(page);
  solar.setData("/api/solar/scales", { radio_blackout: { scale: 2, text: "Moderate" }, solar_radiation: { scale: 0 }, geomagnetic_storm: { scale: 0 } });
  solar.ageData("/api/solar/xray", 86_400_000);
  await page.goto("/");
  const briefing = page.getByRole("region", { name: "Operating briefing" });
  await expect(briefing.getByRole("heading", { level: 2 })).toContainText(/blackout/i);
  await expect(page.getByText(/no station setting needs changing/)).toBeVisible();
  const refresh = page.getByRole("button", { name: "Refresh Home solar briefing" });
  await refresh.focus();
  await expect(page.getByRole("tooltip")).toContainText("solar readings");
  if (page.viewportSize()!.width < 768) {
    expect(await briefing.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('[aria-label="Band activity"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await refresh.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Choose Home location: DM79" })).toBeFocused();
    expect((await briefing.boundingBox())!.y).toBeLessThan((await page.getByRole("region", { name: "Band activity" }).boundingBox())!.y);
  }
});

test("panel discovery and Add to Home are explicit and persist by layout", async ({ page }, info) => {
  await fixtures(page);
  const mobile=info.project.name.includes("mobile");
  await page.goto("/");
  await page.getByRole("button", {name:"View Moon",exact:true}).click();
  await expect(page.getByRole("button", {name:"Hide additional panels"})).toBeVisible();
  await page.getByRole("button", {name:"Add Moon to Home",exact:true}).click();
  await expect(page.getByRole("region", {name:"Your information panels"}).getByRole("region",{name:"Moon",exact:true})).toBeVisible();
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem("propulse-home-widgets-v1")!));
  expect(prefs).toEqual(mobile?{desktop:[],mobile:["moon"]}:{desktop:["moon"],mobile:[]});
  await page.reload();
  await expect(page.getByRole("region",{name:"Your information panels"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Show more information panels"})).toHaveAttribute("aria-expanded","false");
  await page.getByRole("button",{name:"Remove Moon from Home",exact:true}).click();
  await expect(page.getByRole("region",{name:"Your information panels"})).toHaveCount(0);
});

test("switching station setups updates context without moving navigation or opening the console", async ({ page }) => {
  await fixtures(page, [{id:"europe-field",name:"European field QTH",grid:"JN58td",lat:48.15,lon:11.6}]);
  const seen: string[] = [];
  page.on("request", request => seen.push(request.url()));
  await page.addInitScript(() => {
    const make = (id: string, name: string, power: number) => ({ id, name, operatingPowerWatts: power, nodes: [], feedlineRuns: [], shackAccessoryIds: [], linkedLocationId: id === "field" ? "europe-field" : "solar-fixture-home", createdAt: new Date().toISOString() });
    localStorage.setItem("propulse-shack", JSON.stringify({version:5,state:{stationChains:[make("home", "Home HF",100),make("field","POTA pack",10)],activeChainId:"home"}}));
    localStorage.setItem("propulse-map-operational", JSON.stringify({version:1,state:{manualScope:"observe",workspaceOpen:false}}));
  });
  await page.goto("/");
  await page.getByText("Your station & recent operating",{exact:true}).click();
  const picker = page.getByRole("combobox", {name:"Home active station setup"});
  await expect(picker).toHaveValue("home");
  await expect(page.getByText("100 W configured")).toBeVisible();
  await picker.selectOption("field");
  await expect(page.getByText("10 W configured")).toBeVisible();
  await expect(page.getByText(/Regional · Europe/)).toBeVisible();
  await page.getByRole("button",{name:"Explore nearby reports",exact:true}).click();
  await expect(page.getByText(/Nearby reports use JN58td/)).toBeVisible();
  await expect.poll(() => seen.some(url => url.includes("/api/spots/pskreporter") && url.includes("JN58td"))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("propulse-map-operational")!).state.workspaceOpen)).toBe(false);
  await page.getByRole("navigation", {name:"Home operating actions"}).getByRole("link",{name:"Plan a session"}).click();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole("heading",{name:"Band Planner",exact:true})).toBeVisible();
  await expect(page.getByText(/From Home/)).toBeVisible();
  await expect(page.getByRole("combobox", {name:"Planning mode"})).toHaveValue("SSB");
  await page.goBack();
  await page.getByText("Your station & recent operating",{exact:true}).click();
  await expect(picker).toHaveValue("field");
});

test("focused operating policy withholds public activity including cached UI", async ({ page }) => {
  await fixtures(page);
  const activityRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/spots/band-activity")) activityRequests.push(request.url()); });
  await page.addInitScript(() => localStorage.setItem("propulse-map-operational", JSON.stringify({version:1,state:{manualScope:"log",workspaceOpen:false}})));
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Focused operating"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"On the bands now"})).toHaveCount(0);
  expect(activityRequests).toEqual([]);
  // The shared app alert monitor owns other spot requests; this assertion
  // covers Home’s activity source and rendering policy.
});

test("responsive review at phone, tablet, desktop, and large text", async ({ page }, info) => {
  test.skip(info.project.name.includes("mobile"), "One viewport sweep suffices");
  await fixtures(page);
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const width of [390,834,1440,2560]) {
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.goto("/");
    await expect(page.getByRole("heading",{name:"On the bands now"})).toBeVisible();
    await expect(page.getByText("420",{exact:true})).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize="20px"; });
    const home = page.locator("[data-home-elevation]");
    expect(await home.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const actions = await home.locator("button, a[href]").evaluateAll(elements => elements.filter(element=>element.getBoundingClientRect().height>0).map(element=>({text:element.textContent, height:element.getBoundingClientRect().height})));
    expect(actions.filter(action=>action.height<43)).toEqual([]);
    await page.screenshot({path:`tmp/home-elevation/home-${width}-large-text.png`,fullPage:true});
  }
});

test("cached successful responses cannot renew the age of old observations", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/spots/band-activity*", route => route.fulfill({json:{meta:{fetchedAt:new Date(Date.now()-300_000).toISOString()},bands:[{band:"20m",count_60m:999,obs_20m:999,reporters_20m:40,count_10m_recent:999,count_10m_prior:999}]}}));
  await page.goto("/");
  const activity = page.getByRole("region",{name:"Band activity"});
  await expect(activity.getByText("Stale",{exact:true})).toBeVisible();
  await expect(activity.getByText("999",{exact:true})).toHaveCount(0);
  await expect(activity.getByText(/Activity updates are unavailable/)).toBeVisible();
});


test("band buttons announce the selected nearby disclosure", async ({ page }) => {
  await fixtures(page);
  await page.goto("/");
  const band = page.getByRole("button", { name: "20m nearby reports" });
  await expect(band).toHaveAttribute("aria-expanded", "false");
  await expect(band).toHaveAttribute("aria-controls", "home-nearby-reports");
  await band.click();
  await expect(band).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#home-nearby-reports")).toBeVisible();
  await page.getByRole("button", { name: "Close nearby reports", exact: true }).click();
  await expect(band).toHaveAttribute("aria-expanded", "false");
});

test("empty solar measurements have a neutral no-data status", async ({ page }) => {
  const { solar } = await fixtures(page);
  solar.setData("/api/solar/flux", []);
  solar.setData("/api/solar/xray", []);
  await page.goto("/");
  const briefing = page.getByRole("region", { name: "Solar outlook" });
  await expect(briefing.getByRole("status").filter({ hasText: "No data" })).toHaveCount(2);
  await expect(briefing.getByText("—", { exact: true })).toHaveCount(2);
});


test("Home location drives weather, reports, and Advanced forecast assumptions", async ({page}, info)=>{
  await fixtures(page);
  const requests:string[]=[];page.on("request",r=>requests.push(r.url()));
  await page.goto("/");
  await page.getByRole("button",{name:"Choose Home location: DM79"}).click();
  await page.getByLabel("Maidenhead grid").fill("IO91");
  await page.getByRole("button",{name:"Use this location",exact:true}).click();
  await expect(page.getByText("Regional · Europe · last 20 minutes · all modes",{exact:true})).toBeVisible();
  await expect.poll(()=>requests.some(url=>url.includes("api.open-meteo.com")&&url.includes("latitude=51.5000"))).toBe(true);
  await page.getByRole("button",{name:"Advanced dashboard",exact:true}).click();
  await expect(page.getByRole("region",{name:"Advanced dashboard"})).toBeVisible();
  await page.getByLabel("Target grid").fill("JO31");
  await expect(page.getByRole("region",{name:"Scrollable band forecast"})).toBeVisible();
  await page.getByLabel("Forecast mode").selectOption("CW");
  await page.getByLabel("Noise environment").selectOption("quiet_rural");
  await page.screenshot({path:`tmp/home-dashboard/${info.project.name}-advanced.png`,fullPage:true});
  await page.getByText("Forecast inputs & uncertainty",{exact:true}).click();
  await expect(page.getByText(/current held constant/).first()).toBeVisible();
  await page.getByRole("button",{name:"Choose Home location: IO91"}).click();
  await page.getByRole("button",{name:"Use global view",exact:true}).click();
  await expect(page.getByRole("region",{name:"Scrollable band forecast"})).toHaveCount(0);
  await expect(page.getByText("Set your Home location for a path forecast.")).toBeVisible();
});
