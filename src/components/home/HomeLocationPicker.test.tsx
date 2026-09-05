import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeLocationPicker } from "./HomeLocationPicker";

const choose = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useHomeLocation", () => ({
  useHomeLocation: () => ({ location: null, choose, guest: false }),
}));

let success: PositionCallback;
let failure: PositionErrorCallback;
beforeEach(() => {
  choose.mockClear();
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition: vi.fn((onSuccess, onError) => { success = onSuccess; failure = onError; }) },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function startLocation() {
  fireEvent.click(screen.getByRole("button", { name: "Set your location" }));
  fireEvent.click(screen.getByRole("button", { name: "Use my approximate location" }));
}
function resolveLocation() {
  act(() => success({ coords: { latitude: 40, longitude: -105 } } as GeolocationPosition));
}

it.each(["Use global view", "Use station location", "Use this location"])("ignores a location callback after %s", name => {
  render(<HomeLocationPicker />);
  startLocation();
  fireEvent.change(screen.getByLabelText("Maidenhead grid"), { target: { value: "IO91" } });
  fireEvent.click(screen.getByRole("button", { name }));
  expect(choose).toHaveBeenCalledTimes(1);
  resolveLocation();
  expect(choose).toHaveBeenCalledTimes(1);
});

it("ignores success and error callbacks after closing and reopening", () => {
  render(<HomeLocationPicker />);
  startLocation();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Set your location" }));
  resolveLocation();
  act(() => failure({ code: 1 } as GeolocationPositionError));
  expect(choose).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Use my approximate location" }).hasAttribute("disabled")).toBe(false);
});

it("ignores callbacks after unmount", () => {
  const view = render(<HomeLocationPicker />);
  startLocation();
  view.unmount();
  resolveLocation();
  expect(choose).not.toHaveBeenCalled();
});

it("applies a current geolocation result", () => {
  render(<HomeLocationPicker />);
  startLocation();
  resolveLocation();
  expect(choose).toHaveBeenCalledWith(expect.stringMatching(/^[A-R]{2}\d{2}[a-x]{2}$/i));
  expect(screen.queryByRole("dialog")).toBeNull();
});
