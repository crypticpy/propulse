import { chromium } from "@playwright/test";
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
await mkdir("tmp/map-animation-check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
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
let generation = 0;
await context.route("**/api/spots/rbn*", r => r.fulfill({json:{spots:[]}}));
await context.route("**/api/spots/pskreporter*", (r) =>
  r.fulfill({
    json: {
      spots: Array.from({ length: 200 }, (_, i) => ({
        senderCallsign: `W${generation++}T${i}`,
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
      spots: Array.from({ length: 200 }, (_, i) => ({
        id: `hc-${i}`,
        dx: `W${i}HCDX`,
        spotter: "N0TEST",
        dxGrid: `${["FN","IO","PM","QF","JO"][i % 5]}${i % 10}${Math.floor(i / 10) % 10}`,
        spotterGrid: "EM38",
        frequency: i % 2 ? 14074 : 7030,
        mode: i % 2 ? "FT8" : "CW",
        band: i % 2 ? "20m" : "40m",
        time: new Date().toISOString(),
        comment: "Local UI fixture",
      })),
    },
  }),
);
const gpuPage = await context.newPage();
const renderer = await gpuPage.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
});
await gpuPage.close();
if (!renderer || /swiftshader|disabled|llvmpipe/i.test(renderer)) {
  await browser.close();
  throw new Error("A real GPU is required; refusing software-rendered globe profiling.");
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGE ERROR", e.message); });
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


try {
 await page.goto(new URL("/map", origin).href);
 await page.getByRole("button", {name:"Normal",exact:true}).waitFor({timeout:30000});
 await page.evaluate(async () => {
   const mod=async path=>import(performance.getEntriesByType("resource").find(e=>new URL(e.name).pathname===path)?.name||path);
   const {useProfileStore}=await mod("/src/stores/profileStore.ts");
   useProfileStore.setState({station:{callsign:"N0TEST",grid:"EM38",lat:38.5,lon:-92.5,homeLocationId:"test",activeLocationId:null,savedLocations:[{id:"test",name:"Test station",grid:"EM38",lat:38.5,lon:-92.5,timezone:"America/Chicago"}]}});
   const {useMapStore:m}=await mod("/src/stores/mapStore.ts");
   m.setState({viewMode:"globe",layers:{...m.getState().layers,rayPath:true,spots:true,spotTraces:true,ionosphere:true},target:{lat:35.7,lon:139.7,name:"Test Tokyo",grid:"PM95"},pathMode:"both",isolateTargetPath:false});
 });
 await page.locator("canvas").first().waitFor({timeout:60000});
 await page.waitForTimeout(3000);

 await page.evaluate(async () => {
   const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/@react-three_fiber.js'))?.name;
   if(!url) throw new Error('R3F module not found');
   const {_roots}=await import(url);
   window.__profileRoot=[..._roots.values()][0].store;
 });
 console.log("Waiting for one normal feed refresh to exercise newly arriving traces.");
 await page.waitForTimeout(61000);
 for(const isolate of [false,true]) {
  await page.evaluate(async isolate=>{const {useMapStore:m}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/stores/mapStore.ts').name);m.getState().setIsolateTargetPath(isolate);},isolate);
  await page.waitForTimeout(1500);
  const sample=await page.evaluate(async () => {
   const r=window.__profileRoot.getState();
   const deltas=[];
   await new Promise(done=>{let previous;const frame=t=>{if(previous!==undefined)deltas.push(t-previous);previous=t;if(deltas.length<120)requestAnimationFrame(frame);else done();};requestAnimationFrame(frame);});
   const gl=r.gl.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
   const rayGroups=[];let traces=0;
   r.scene.traverse(o=>{if(o.name.startsWith('ray-path-arc'))rayGroups.push({name:o.name,objects:o.children.length});if(o.name==='animated-spot-traces')traces=o.children.length;});
   return {renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),subscribers:r.internal.subscribers.length,drawCalls:r.gl.info.render.calls,triangles:r.gl.info.render.triangles,rayGroups,traces,frameMedian:deltas.sort((a,b)=>a-b)[60],frameP95:deltas[114]};
  });
  console.log(JSON.stringify({isolate,...sample}));result.checks.push({isolate,...sample});
 }
 for (const viewMode of ["flat", "azimuthal"]) {
  await page.evaluate(async viewMode => {
   const {useMapStore:m}=await import(performance.getEntriesByType("resource").find(e=>new URL(e.name).pathname==="/src/stores/mapStore.ts").name);
   m.getState().setViewMode(viewMode);
  }, viewMode);
  await page.waitForTimeout(3000);
  if (errors.length) throw new Error(errors.join("\n"));
  await page.locator("canvas").first().waitFor({timeout:30000});
  if (!(await page.locator("body").innerText()).includes("Test Tokyo")) throw new Error("Target context disappeared");
  await page.screenshot({path:`tmp/map-animation-check/${viewMode}.png`});
  console.log(`PASS ${viewMode}: target path remains mounted without page errors`);
 }
 await writeFile(process.argv[3]||"tmp/map-animation-check/profile.json",JSON.stringify(result,null,2));
} finally { await browser.close(); }
