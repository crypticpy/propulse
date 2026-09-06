import { beforeEach, expect, it, vi } from "vitest";

const key = "propulse-visual-effects";
const defaults = {
  level: "subtle", celebrations: true, animatedBadges: true, particles: true, glow: true,
};
const envelope = (state = defaults) => JSON.stringify({ version: 1, state });
async function fresh() {
  vi.resetModules();
  return (await import("./visualEffectsStore")).useVisualEffectsStore;
}
beforeEach(() => localStorage.clear());

it("defaults calmly and persists only explicit local choices, retaining capped toggles across reload", async () => {
  const store = await fresh();
  expect(store.getState()).toMatchObject(defaults);
  expect(localStorage.getItem(key)).toBeNull();
  store.getState().setEffect("particles", false);
  store.getState().setLevel("off");
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
    version: 1, state: { ...defaults, level: "off", particles: false },
  });
  const reloaded = await fresh();
  expect(reloaded.getState()).toMatchObject({ level: "off", particles: false });
  reloaded.getState().setLevel("full");
  expect(reloaded.getState().particles).toBe(false);
  reloaded.getState().reset();
  expect(reloaded.getState()).toMatchObject(defaults);
});

it.each([
  "broken", "null", "[]", "{}",
  JSON.stringify({ version: 2, state: defaults }),
  envelope({ ...defaults, level: "loud" }),
  JSON.stringify({ version: 1, state: { ...defaults, glow: "false" } }),
  JSON.stringify({ version: 1, state: { ...defaults, unexpected: true } }),
  JSON.stringify({ version: 1, state: { level: "full" } }),
])("uses defaults without destroying malformed/unknown data: %s", async (raw) => {
  localStorage.setItem(key, raw);
  expect((await fresh()).getState()).toMatchObject(defaults);
  expect(localStorage.getItem(key)).toBe(raw);
});

it("syncs cross-tab choices, removal and clear without write-back; ignores unrelated keys", async () => {
  const store = await fresh();
  const write = vi.spyOn(localStorage, "setItem");
  window.dispatchEvent(new StorageEvent("storage", {
    key, newValue: envelope({ ...defaults, level: "full", glow: false }),
  }));
  expect(store.getState()).toMatchObject({ level: "full", glow: false });
  window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: "bad" }));
  expect(store.getState().level).toBe("full");
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: null }));
  expect(store.getState()).toMatchObject(defaults);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: envelope({ ...defaults, level: "off" }) }));
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  expect(store.getState()).toMatchObject(defaults);
  expect(write).not.toHaveBeenCalled();
});

it("rejects malformed cross-tab data and sessionStorage events", async () => {
  const store = await fresh();
  store.getState().setLevel("full");
  const event = new StorageEvent("storage", {
    key, newValue: envelope({ ...defaults, level: "off" }),
  });
  // Node 26's experimental sessionStorage is not a jsdom Storage instance.
  // Set the event's source after construction to test the real source guard.
  Object.defineProperty(event, "storageArea", { value: window.sessionStorage });
  window.dispatchEvent(event);
  expect(store.getState().level).toBe("full");
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: "broken" }));
  expect(store.getState()).toMatchObject(defaults);
});

it("keeps choices usable when storage fails and supports explicit retry", async () => {
  const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  const store = await fresh();
  expect(store.getState().persistenceAvailable).toBe(false);
  read.mockRestore();
  const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(() => store.getState().setEffect("glow", false)).not.toThrow();
  expect(store.getState()).toMatchObject({ glow: false, persistenceAvailable: false });
  write.mockRestore();
  store.getState().retryPersistence();
  expect(store.getState().persistenceAvailable).toBe(true);
  expect((await fresh()).getState().glow).toBe(false);
});
