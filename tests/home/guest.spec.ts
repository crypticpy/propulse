import { expect, test } from "@playwright/test";

test.skip(process.env.PROPULSE_E2E_GUEST !== "1", "Requires a build with disposable configured auth, not the local auth bypass");

test("first visit and cached personal settings stay public without radio connections", async ({ page }, info) => {
  const sockets: string[] = [];
  page.on("websocket", socket => sockets.push(socket.url()));
  await page.route(url => url.pathname.startsWith("/api/"), route => route.fulfill({ status: 503, json: { error: "Guest source unavailable fixture" } }));
  await page.route("https://home-guest.invalid/**", route => route.fulfill({ status: 503, json: {} }));
  await page.addInitScript(() => {
    localStorage.setItem("propulse-home-location-v1", "IO91WM");
    localStorage.setItem("propulse-settings", JSON.stringify({state:{bridgeEnabled:true, bridgeHost:"127.0.0.1", bridgePort:8787},version:0}));
    localStorage.setItem("propulse-home-widgets-v1", JSON.stringify({desktop:["history","countdowns"],mobile:["history","countdowns"]}));
  });
  await page.goto("/");
  const home = page.locator("[data-home-dashboard]");
  await expect(page.locator("[data-public-home-shell]")).toBeVisible();
  await expect(home.getByText("Guest · Global view · no sign-in needed")).toBeVisible();
  await expect(home.getByText("Sign in to view your saved personal panel.")).toHaveCount(2);
  await expect(page.getByRole("button",{name:"My Shack"})).toHaveCount(0);
  await expect(home.getByText("Your station & recent operating")).toHaveCount(0);
  await home.getByRole("button",{name:"Set your location"}).click();
  await page.getByLabel("Maidenhead grid").fill("IO91");
  await page.getByRole("button",{name:"Use this location",exact:true}).click();
  await home.getByRole("button",{name:"Explore nearby reports"}).click();
  await expect(home.getByText(/Nearby reports use IO91/)).toBeVisible();
  expect(sockets).toEqual([]);
  await page.screenshot({path:`tmp/home-dashboard/${info.project.name}-guest.png`,fullPage:true});
  await page.goto("/log");
  await expect(page.locator("[data-home-dashboard]")).toHaveCount(0);
  await expect(page.getByLabel("Email address",{exact:true})).toBeVisible();
  expect(sockets).toEqual([]);
});
