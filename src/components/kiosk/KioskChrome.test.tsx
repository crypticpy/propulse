import { beforeEach, describe, expect, it, vi } from "vitest";

let reduceMotion = false;

vi.mock("@/hooks/useWakeLock", () => ({ useWakeLock: vi.fn() }));
vi.mock("@/components/kiosk/KioskQr", () => ({ KioskQr: () => null }));
vi.mock("@/components/map/LayoutModeDropdown", () => ({
  LayoutModeDropdown: () => <button type="button">Display selector</button>,
}));

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useAlertsStore } from "@/stores/alertsStore";
import { useKioskStore, type KioskScene } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import type { SolarAlert } from "@/types/alerts";
import { KioskChrome } from "./KioskChrome";

type TestScene = KioskScene & {
  enabled?: boolean;
  durationSec?: number;
  transition?: "fade" | "cut";
};

function makeScene(
  id: string,
  route: string,
  options: Partial<TestScene> = {},
): TestScene {
  return {
    id,
    name: `Scene ${id.toUpperCase()}`,
    route,
    enabled: true,
    transition: "cut",
    ...options,
  };
}

function makeAlert(): SolarAlert {
  return {
    id: "critical-alert",
    type: "GEOMAGNETIC_STORM",
    priority: "CRITICAL",
    status: "ACTIVE",
    title: "Geomagnetic storm",
    message: "Rotation should pause for this alert.",
    affectedBands: ["20m"],
    triggeredAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-01T01:00:00.000Z",
    source: "K_INDEX",
    thresholdValue: 5,
    currentValue: 7,
  };
}

function configureWall(
  scenes: TestScene[],
  options: { intervalSec?: number; rotationEnabled?: boolean } = {},
) {
  useKioskStore.setState({
    scenes,
    rotation: {
      enabled: options.rotationEnabled ?? true,
      intervalSec: options.intervalSec ?? 15,
    },
    breakInLevel: "CRITICAL",
    presentation: {
      headerScale: "standard",
      slashedZero: false,
      autoNightDim: false,
    },
    active: true,
    activeSceneId: scenes[0]?.id ?? null,
  });
}

function LocationProbe() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

function WallHarness({ show = true }: { show?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/solar"]}>
      {show && <KioskChrome />}
      <LocationProbe />
    </MemoryRouter>
  );
}

async function advanceTime(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

describe("KioskChrome", () => {
  beforeEach(() => {
    localStorage.clear();
    reduceMotion = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: reduceMotion,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(async () => {}),
    });
    useAlertsStore.setState({
      alerts: [],
      dismissedAlertIds: [],
      alertHistory: [],
    });
    useUserStore.setState({ station: null });
    useMapStore.setState({ layoutMode: "pro" });
  });

  it("re-arms equal-duration scene timers from A to B to C", async () => {
    vi.useFakeTimers();
    configureWall([
      makeScene("a", "/solar"),
      makeScene("b", "/dx"),
      makeScene("c", "/atmos"),
    ]);
    render(<WallHarness />);

    await advanceTime(15_000);
    expect(useKioskStore.getState().activeSceneId).toBe("b");
    expect(screen.getByLabelText("Current route").textContent).toBe("/dx");

    await advanceTime(15_000);
    expect(useKioskStore.getState().activeSceneId).toBe("c");
    expect(screen.getByLabelText("Current route").textContent).toBe("/atmos");
  });

  it("honors each scene dwell time before advancing", async () => {
    vi.useFakeTimers();
    configureWall([
      makeScene("a", "/solar", { durationSec: 15 }),
      makeScene("b", "/dx", { durationSec: 30 }),
      makeScene("c", "/atmos", { durationSec: 15 }),
    ]);
    render(<WallHarness />);

    await advanceTime(15_000);
    expect(useKioskStore.getState().activeSceneId).toBe("b");
    await advanceTime(15_000);
    expect(useKioskStore.getState().activeSceneId).toBe("b");
    await advanceTime(15_000);
    expect(useKioskStore.getState().activeSceneId).toBe("c");
  });

  it("skips disabled scenes in rotation and the scene counter", async () => {
    vi.useFakeTimers();
    configureWall([
      makeScene("a", "/solar"),
      makeScene("b", "/dx", { enabled: false }),
      makeScene("c", "/atmos"),
    ]);
    render(<WallHarness />);

    expect(screen.getByTestId("kiosk-clock-bar").dataset.sceneCount).toBe("2");
    await advanceTime(15_000);
    expect(useKioskStore.getState().activeSceneId).toBe("c");
    expect(screen.getByLabelText("Current route").textContent).toBe("/atmos");
  });

  it("pauses and resumes the dwell timer from the wall controls", async () => {
    vi.useFakeTimers();
    configureWall([makeScene("a", "/solar"), makeScene("b", "/dx")]);
    render(<WallHarness />);

    fireEvent.pointerMove(window);
    fireEvent.click(screen.getByRole("button", { name: "Pause rotation" }));
    await advanceTime(30_000);
    expect(useKioskStore.getState().activeSceneId).toBe("a");

    fireEvent.click(screen.getByRole("button", { name: "Resume rotation" }));
    await advanceTime(15_000);
    expect(useKioskStore.getState().activeSceneId).toBe("b");
  });

  it("suspends rotation during an alert and starts a fresh dwell afterward", async () => {
    vi.useFakeTimers();
    configureWall([makeScene("a", "/solar"), makeScene("b", "/dx")]);
    useAlertsStore.setState({ alerts: [makeAlert()] });
    render(<WallHarness />);

    await advanceTime(30_000);
    expect(useKioskStore.getState().activeSceneId).toBe("a");

    act(() => useAlertsStore.setState({ alerts: [] }));
    await advanceTime(14_999);
    expect(useKioskStore.getState().activeSceneId).toBe("a");
    await advanceTime(1);
    expect(useKioskStore.getState().activeSceneId).toBe("b");
  });

  it.each([
    ["cut", false],
    ["fade", true],
  ] as const)(
    "switches a %s scene immediately when reduced motion is %s",
    async (transition, prefersReducedMotion) => {
      reduceMotion = prefersReducedMotion;
      configureWall(
        [
          makeScene("a", "/solar"),
          makeScene("b", "/dx", { transition }),
        ],
        { rotationEnabled: false },
      );
      const user = userEvent.setup();
      render(<WallHarness />);

      fireEvent.pointerMove(window);
      await user.click(screen.getByRole("button", { name: "Next scene" }));

      expect(screen.getByLabelText("Current route").textContent).toBe("/dx");
      expect(
        screen.getByTestId("kiosk-scene-transition").dataset.visible,
      ).toBe("false");
    },
  );

  it("completes a fade only after its navigation delay", async () => {
    vi.useFakeTimers();
    configureWall(
      [
        makeScene("a", "/solar"),
        makeScene("b", "/dx", { transition: "fade" }),
      ],
      { rotationEnabled: false },
    );
    render(<WallHarness />);

    fireEvent.pointerMove(window);
    fireEvent.click(screen.getByRole("button", { name: "Next scene" }));
    expect(screen.getByLabelText("Current route").textContent).toBe("/solar");
    expect(
      screen.getByTestId("kiosk-scene-transition").dataset.visible,
    ).toBe("true");

    await advanceTime(209);
    expect(screen.getByLabelText("Current route").textContent).toBe("/solar");
    await advanceTime(1);
    expect(screen.getByLabelText("Current route").textContent).toBe("/dx");
    await advanceTime(210);
    expect(
      screen.getByTestId("kiosk-scene-transition").dataset.visible,
    ).toBe("false");
  });

  it("cancels a pending fade when the kiosk chrome unmounts", async () => {
    vi.useFakeTimers();
    configureWall(
      [
        makeScene("a", "/solar"),
        makeScene("b", "/dx", { transition: "fade" }),
      ],
      { rotationEnabled: false },
    );
    const { rerender } = render(<WallHarness />);

    fireEvent.pointerMove(window);
    fireEvent.click(screen.getByRole("button", { name: "Next scene" }));
    expect(
      screen.getByTestId("kiosk-scene-transition").dataset.visible,
    ).toBe("true");

    rerender(<WallHarness show={false} />);
    await advanceTime(500);
    expect(screen.getByLabelText("Current route").textContent).toBe("/solar");
  });

  it("exits fullscreen and returns to the literal Normal map", async () => {
    const exitFullscreen = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    configureWall([makeScene("a", "/solar")], { rotationEnabled: false });
    const user = userEvent.setup();
    render(<WallHarness />);

    fireEvent.pointerMove(window);
    await user.click(screen.getByRole("button", { name: "Exit to Normal" }));

    await waitFor(() => {
      expect(useKioskStore.getState().active).toBe(false);
      expect(useMapStore.getState().layoutMode).toBe("normal");
      expect(screen.getByLabelText("Current route").textContent).toBe("/map");
    });
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it("uses Escape as the same literal Normal exit", async () => {
    configureWall([makeScene("a", "/solar")], { rotationEnabled: false });
    const user = userEvent.setup();
    render(<WallHarness />);

    await user.keyboard("{Escape}");

    expect(useKioskStore.getState().active).toBe(false);
    expect(useMapStore.getState().layoutMode).toBe("normal");
    expect(screen.getByLabelText("Current route").textContent).toBe("/map");
  });
});
