import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import {
  ACTIVITY_PRESET_IDS,
  DISPLAY_PRESET_IDS,
  getActivityRecipe,
  type FeedAvailability,
} from "@/lib/views/presets";
import type { SpotsLibraryPort, SpotsPreferencesController } from "../types";
import { useSpotsLibrary } from "../useSpotsLibrary";
import { useSpotsPreferences } from "../useSpotsPreferences";
import { ALL_FEEDS_AVAILABLE, createMemoryLibraryPort, createTestView, type TestViewHandle } from "../testing";
import { PresetsSection } from "./PresetsSection";

function createControllerBox(): { current: SpotsPreferencesController | null } {
  return { current: null };
}

function Harness({
  view,
  library,
  feedAvailability = ALL_FEEDS_AVAILABLE,
  controllerBox,
}: {
  view: TestViewHandle["view"];
  library: SpotsLibraryPort;
  feedAvailability?: readonly FeedAvailability[];
  controllerBox?: { current: SpotsPreferencesController | null };
}) {
  const controller = useSpotsPreferences({ view, feedAvailability });
  const libraryController = useSpotsLibrary(library);
  if (controllerBox) controllerBox.current = controller;
  return <PresetsSection controller={controller} library={libraryController} />;
}

async function openAndApply(dialogName: string) {
  await userEvent.click(screen.getByText(dialogName));
  const dialog = await screen.findByRole("dialog", { name: dialogName });
  await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
}

describe("PresetsSection", () => {
  it("PRESET-01: lists every catalog id so a deferred preset fails this test", () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    render(<Harness view={testView.view} library={port} />);

    for (const id of ACTIVITY_PRESET_IDS) {
      expect(screen.getByText(id)).toBeTruthy();
    }
    for (const id of DISPLAY_PRESET_IDS) {
      expect(screen.getByText(id)).toBeTruthy();
    }
    expect(screen.getByText(/activity recipe changes Spots & Paths only/i)).toBeTruthy();
    expect(screen.getByText(/display template replaces the whole view/i)).toBeTruthy();
  });

  it("previewPreset reports exact field-level changes for FT8 and Quiet monitoring from defaults", () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    const controllerBox = createControllerBox();
    render(<Harness view={testView.view} library={port} controllerBox={controllerBox} />);
    const controller = controllerBox.current!;

    const ft8 = controller.previewPreset(getActivityRecipe("activity-ft8-v1"));
    expect(ft8.changes).toEqual(
      expect.arrayContaining([
        { path: "spots.filters.maxAgeMinutes", before: 30, after: 5 },
        { path: "spots.filters.spotLimit", before: 50, after: 100 },
        { path: "spots.filters.modes.modes", before: [], after: ["FT8"] },
      ]),
    );

    const quiet = controller.previewPreset(getActivityRecipe("activity-quiet-v1"));
    expect(quiet.changes).toEqual(
      expect.arrayContaining([
        { path: "spots.paths.background.style", before: "quick-sweep", after: "off" },
        { path: "spots.paths.selected.style", before: "traveling-pulse", after: "off" },
      ]),
    );
  });

  it("PRESET-03: preview writes nothing, and Apply preserves presentation while replacing spots", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    render(<Harness view={testView.view} library={port} />);

    const beforePresentation = testView.view.store.getState().config.presentation;
    const beforeSnapshot = JSON.stringify(testView.view.store.getState().config);

    await userEvent.click(screen.getByText("FT8 monitoring"));
    await screen.findByRole("dialog", { name: "FT8 monitoring" });
    expect(JSON.stringify(testView.view.store.getState().config)).toBe(beforeSnapshot);

    const dialog = screen.getByRole("dialog", { name: "FT8 monitoring" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    const after = testView.view.store.getState().config;
    expect(after.presentation).toEqual(beforePresentation);
    expect(after.spots.filters.maxAgeMinutes).toBe(5);
    expect(after.spots.filters.spotLimit).toBe(100);
    expect(after.spots.filters.modes).toEqual({
      all: false, categories: [], modes: ["FT8"], includeUnknown: false, includeInferred: true,
    });
  });

  it("applies a display template as a full configuration replacement", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    render(<Harness view={testView.view} library={port} />);

    await openAndApply("HamClock Wall");

    const config = testView.view.store.getState().config;
    expect(config.family).toBe("hamclock");
    expect(config.presentation.projection).toBe("flat");
    expect(config.presentation.hamclock.theme).toBe("pulse");
  });

  it("no-op application: matches current settings, changes nothing, no phantom revert state", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    render(<Harness view={testView.view} library={port} />);

    const beforeSnapshot = JSON.stringify(testView.view.store.getState().config);

    await userEvent.click(screen.getByText("Balanced activity"));
    const dialog = await screen.findByRole("dialog", { name: "Balanced activity" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply (no changes)" }));

    expect(JSON.stringify(testView.view.store.getState().config)).toBe(beforeSnapshot);
    expect(screen.getByTestId("active-preset").textContent).toContain("Balanced activity");
    expect(screen.queryByRole("button", { name: "Revert last preset application" })).toBeNull();
  });

  it("shows Customized after a field edit, and resetToBuiltIn clears it", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    const controllerBox = createControllerBox();
    render(<Harness view={testView.view} library={port} controllerBox={controllerBox} />);

    await openAndApply("FT8 monitoring");
    expect(screen.getByTestId("active-preset").textContent).toContain("FT8 monitoring");
    expect(screen.getByTestId("active-preset").textContent).not.toContain("Customized");

    act(() => {
      controllerBox.current!.patchFilters({ spotLimit: 150 });
    });
    expect(screen.getByTestId("active-preset").textContent).toContain("FT8 monitoring (Customized)");

    await userEvent.click(screen.getByRole("button", { name: "Reset to the built-in version" }));

    expect(screen.getByTestId("active-preset").textContent).toContain("FT8 monitoring");
    expect(screen.getByTestId("active-preset").textContent).not.toContain("Customized");
    expect(testView.view.store.getState().config.spots.filters.spotLimit).toBe(100);
  });

  it("reverts to the exact pre-application configuration", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    render(<Harness view={testView.view} library={port} />);

    const beforeSnapshot = JSON.parse(JSON.stringify(testView.view.store.getState().config));

    await openAndApply("FT8 monitoring");
    expect(testView.view.store.getState().config.spots.filters.maxAgeMinutes).toBe(5);

    await userEvent.click(screen.getByRole("button", { name: "Revert last preset application" }));

    expect(testView.view.store.getState().config).toEqual(beforeSnapshot);
  });

  it("custom preset lifecycle: save, duplicate, rename and delete send the expected revisions", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    render(<Harness view={testView.view} library={port} />);

    await userEvent.click(screen.getByRole("button", { name: "Save as preset" }));
    await userEvent.type(screen.getByLabelText("Preset name"), "My Preset");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("My Preset");

    const createCall = port.calls.find((call) => call.kind === "preset" && call.expectedRevision === 0);
    expect(createCall).toBeDefined();
    const createdId = createCall!.id;

    const originalRow = screen.getByText("My Preset").closest('[role="listitem"]') as HTMLElement;
    await userEvent.click(within(originalRow).getByRole("button", { name: "Duplicate" }));
    await screen.findByText("My Preset (copy)");

    const presetCreateCalls = port.calls.filter((call) => call.kind === "preset" && call.expectedRevision === 0);
    expect(presetCreateCalls).toHaveLength(2);
    expect(presetCreateCalls[1].id).not.toBe(createdId);

    await userEvent.click(within(originalRow).getByRole("button", { name: "Rename" }));
    const renameInput = screen.getByLabelText("Preset name");
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "Renamed Preset");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Renamed Preset");

    expect(port.calls).toContainEqual({ kind: "preset", id: createdId, expectedRevision: 1 });

    const renamedRow = screen.getByText("Renamed Preset").closest('[role="listitem"]') as HTMLElement;
    await userEvent.click(within(renamedRow).getByRole("button", { name: "Delete" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Delete preset" });
    await userEvent.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Renamed Preset")).toBeNull());
    expect(port.calls).toContainEqual({ kind: "delete:preset", id: createdId, expectedRevision: 2 });
  });

  it("shows a not-stored message on conflict and a queued message when offline, never claiming success", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    render(<Harness view={testView.view} library={port} />);

    port.failNextWith({ status: "conflict", current: null });
    await userEvent.click(screen.getByRole("button", { name: "Save as preset" }));
    await userEvent.type(screen.getByLabelText("Preset name"), "Conflicted");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText(/changed elsewhere/i);
    expect(screen.queryByText("Conflicted")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    port.failNextWith({ status: "pending", operationId: "op-1" });
    await userEvent.click(screen.getByRole("button", { name: "Save as preset" }));
    await userEvent.type(screen.getByLabelText("Preset name"), "Queued");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText(/queued and will be sent/i);
    expect(screen.queryByText("Queued")).toBeNull();
  });

  it("keeps two independent view instances isolated when a preset is applied to one", async () => {
    const viewA = createTestView();
    const viewB = createTestView();
    const portA = createMemoryLibraryPort();
    const portB = createMemoryLibraryPort();

    render(
      <>
        <div data-testid="panel-a">
          <Harness view={viewA.view} library={portA} />
        </div>
        <div data-testid="panel-b">
          <Harness view={viewB.view} library={portB} />
        </div>
      </>,
    );

    const beforeSnapshotB = JSON.stringify(viewB.view.store.getState().config);
    const panelA = screen.getByTestId("panel-a");

    await userEvent.click(within(panelA).getByText("FT8 monitoring"));
    const dialog = await screen.findByRole("dialog", { name: "FT8 monitoring" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    expect(viewA.view.store.getState().config.spots.filters.maxAgeMinutes).toBe(5);
    expect(JSON.stringify(viewB.view.store.getState().config)).toBe(beforeSnapshotB);
  });

  it("Escape on the nested preset-delete confirmation cancels the confirmation, not the enclosing panel", async () => {
    const testView = createTestView();
    const port = createMemoryLibraryPort();
    const onClosePanel = vi.fn();

    render(
      <AccessibleDialog open onClose={onClosePanel} title="Spots & paths preferences" size="xl">
        <Harness view={testView.view} library={port} />
      </AccessibleDialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save as preset" }));
    await userEvent.type(screen.getByLabelText("Preset name"), "Escape Target");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Escape Target");

    const row = screen.getByText("Escape Target").closest('[role="listitem"]') as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete preset" })).toBeTruthy();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Delete preset" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Spots & paths preferences" })).toBeTruthy();
    expect(onClosePanel).not.toHaveBeenCalled();
    // The preset survived the cancelled delete.
    expect(screen.getByText("Escape Target")).toBeTruthy();
  });
});
