import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useMapStore } from "@/stores/mapStore";
import {
  useFullscreenEscape,
  type UseFullscreenEscapeOptions,
} from "./useFullscreenEscape";

/**
 * Stand-in for the ~11 modals issue #801 describes as still affected until
 * #773 finishes (e.g. `PassphrasePrompt.tsx`, `QslSyncPanel.tsx`,
 * `EquipmentDetailModal.tsx`): `role="dialog" aria-modal="true"`, closes
 * itself from a bubble-phase (non-capture) `document` keydown listener, and
 * calls only `stopPropagation()` — which is a no-op against a sibling
 * bubble-phase listener on the same node. This is the actual bug shape;
 * `AccessibleDialog` (capture phase + `stopImmediatePropagation`) already
 * protects itself independently of the fix under test, so it can't exercise
 * this path — see the note on the AccessibleDialog test below.
 */
function LegacyBubbleModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div role="dialog" aria-modal="true" />;
}

/**
 * `FullscreenPropSphere` wraps an r3f `<Canvas>`, which renders zero
 * children in jsdom (its content is gated on `react-use-measure`, which
 * never reports a size there). A test that mounted the component itself
 * would find nothing and pass vacuously. The Escape handler doesn't touch
 * the Canvas subtree at all — it's a `document`-level keydown listener — so
 * it's extracted into this hook and exercised directly with a real
 * `AccessibleDialog` mounted alongside it, which is the only way to see the
 * bug: it lives in the interaction between two independent `document`
 * listeners, not in either one alone.
 */
function Harness(props: UseFullscreenEscapeOptions) {
  useFullscreenEscape(props);
  return null;
}

describe("useFullscreenEscape", () => {
  afterEach(() => {
    useMapStore.setState({ satelliteModalId: null });
  });

  it("exits fullscreen on Escape when no dialog is open", async () => {
    const user = userEvent.setup();
    const setFullscreen = vi.fn();
    render(
      <Harness
        observatoryMode={false}
        exitObservatory={vi.fn()}
        setAmbientMode={vi.fn()}
        setFullscreen={setFullscreen}
      />,
    );

    await user.keyboard("{Escape}");

    expect(setFullscreen).toHaveBeenCalledTimes(1);
    expect(setFullscreen).toHaveBeenCalledWith(false);
  });

  it("exits observatory mode instead of fullscreen when observatoryMode is true", async () => {
    const user = userEvent.setup();
    const exitObservatory = vi.fn();
    const setAmbientMode = vi.fn();
    const setFullscreen = vi.fn();
    render(
      <Harness
        observatoryMode
        exitObservatory={exitObservatory}
        setAmbientMode={setAmbientMode}
        setFullscreen={setFullscreen}
      />,
    );

    await user.keyboard("{Escape}");

    expect(exitObservatory).toHaveBeenCalledTimes(1);
    expect(setAmbientMode).toHaveBeenCalledWith(false);
    expect(setFullscreen).not.toHaveBeenCalled();
  });

  // NOTE: AccessibleDialog owns Escape via a `document` *capture*-phase
  // listener that calls `stopImmediatePropagation()` (see AccessibleDialog.tsx
  // ~line 328), which halts the whole dispatch before it ever reaches this
  // hook's bubble-phase listener — with or without the predicate below. This
  // test is a real composition guard (it would catch a regression in either
  // layer), but it is not, by itself, evidence that the predicate works;
  // `LegacyBubbleModal` below is.
  it("does not exit fullscreen while a real AccessibleDialog is open, and the dialog closes", async () => {
    const user = userEvent.setup();
    const setFullscreen = vi.fn();
    const dialogClose = vi.fn();
    render(
      <>
        <Harness
          observatoryMode={false}
          exitObservatory={vi.fn()}
          setAmbientMode={vi.fn()}
          setFullscreen={setFullscreen}
        />
        <AccessibleDialog open onClose={dialogClose} title="Weather alert">
          <p>A severe weather alert is active along this path.</p>
        </AccessibleDialog>
      </>,
    );
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy(),
    );

    await user.keyboard("{Escape}");

    expect(dialogClose).toHaveBeenCalledTimes(1);
    expect(setFullscreen).not.toHaveBeenCalled();
  });

  it("exits fullscreen when only a non-modal aria-modal=false dialog (SelectedSpotCard shape) is present", async () => {
    const user = userEvent.setup();
    const setFullscreen = vi.fn();
    render(
      <>
        <Harness
          observatoryMode={false}
          exitObservatory={vi.fn()}
          setAmbientMode={vi.fn()}
          setFullscreen={setFullscreen}
        />
        <div role="dialog" aria-modal="false">
          Non-modal companion panel
        </div>
      </>,
    );

    await user.keyboard("{Escape}");

    expect(setFullscreen).toHaveBeenCalledTimes(1);
    expect(setFullscreen).toHaveBeenCalledWith(false);
  });

  it("does not exit fullscreen when a legacy bubble-phase modal is open, and only that modal closes", async () => {
    const user = userEvent.setup();
    const setFullscreen = vi.fn();
    const legacyClose = vi.fn();
    render(
      <>
        <Harness
          observatoryMode={false}
          exitObservatory={vi.fn()}
          setAmbientMode={vi.fn()}
          setFullscreen={setFullscreen}
        />
        <LegacyBubbleModal onClose={legacyClose} />
      </>,
    );

    await user.keyboard("{Escape}");

    expect(legacyClose).toHaveBeenCalledTimes(1);
    expect(setFullscreen).not.toHaveBeenCalled();
  });

  it("does not exit fullscreen while the satellite detail modal owns satelliteModalId", async () => {
    const user = userEvent.setup();
    const setFullscreen = vi.fn();
    useMapStore.setState({ satelliteModalId: 25544 });
    render(
      <Harness
        observatoryMode={false}
        exitObservatory={vi.fn()}
        setAmbientMode={vi.fn()}
        setFullscreen={setFullscreen}
      />,
    );

    await user.keyboard("{Escape}");

    expect(setFullscreen).not.toHaveBeenCalled();
  });
});
