import { beforeEach, expect, it } from "vitest";
import { useSettingsStore } from "./settingsStore";

beforeEach(() => {
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  localStorage.removeItem("propulse-settings");
});

it("starts a fresh radio configuration on the standard rigctld port", () => {
  expect(useSettingsStore.getState().catHamlibPort).toBe(4532);
});

it.each([
  { version: 36, port: 4533, expected: 4532 },
  { version: 36, port: 5555, expected: 5555 },
  { version: 36, port: 4532, expected: 4532 },
  { version: 36, port: undefined, expected: 4532 },
  { version: 2, port: undefined, expected: 4532 },
  { version: 37, port: 4533, expected: 4533 },
])("hydrates version $version port $port as $expected", async ({ version, port, expected }) => {
  localStorage.setItem("propulse-settings", JSON.stringify({ version, state: {
    catHamlibPort: port, catHamlibHost: "radio.local", catBackend: "hamlib",
  } }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().catHamlibPort).toBe(expected);
  expect(useSettingsStore.getState().catHamlibHost).toBe("radio.local");
  expect(useSettingsStore.getState().catBackend).toBe("hamlib");
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().catHamlibPort).toBe(expected);
});
