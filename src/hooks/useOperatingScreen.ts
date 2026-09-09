/**
 * Registers the workspace this route is rendering with the shared operating
 * state (#658), and applies the inbound commands only a workspace host can
 * carry out — today just `flipPage`.
 *
 * Route-scoped on purpose, and only the registration is: the *connection*
 * lives at the app boundary (`useOperatingTransport`, mounted in `App.tsx`)
 * so a cursor written from the map or the wall still reaches the operator's
 * other screens. What is route-specific is which workspace exists here and
 * what it can do; that record is withdrawn when the route unmounts.
 *
 * It lives outside `operatingStateStore` on purpose too: the cursor has to
 * work on canvases that have no workspace at all, so the store must not
 * depend on `workspaceStore`.
 */

import { useEffect } from "react";
import { queueTune, tuneDisabledReason } from "@/lib/radio/tune";
import { useKioskStore } from "@/stores/kioskStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useActiveWorkspace, useEffectiveCanvasType, useWorkspaceStore } from "@/stores/workspaceStore";

export function useOperatingScreen(): void {
  const workspace = useActiveWorkspace();
  const workspaceId = workspace.id;
  // `useEffectiveCanvasType()`, not `workspace.canvasType` directly (#686
  // review item 7): every stored workspace is `"workstation"` today, but
  // `WorkspacePage` sets a `"tablet"` override on a narrower viewport
  // (`workspaceStore.ts`'s `canvasTypeOverride`) so this registration — the
  // operating-state roster another screen's cursor UI reads — agrees with
  // what is actually rendered, rather than always claiming "workstation".
  const canvasType = useEffectiveCanvasType();
  const label = workspace.name;
  const canTune = useRigStore(
    (state) => state.catEnabled && state.bridgeConnected && state.connected,
  );
  // Owner rule (epic #652 #5): a wall shows information, it never acts.
  const canCommand = canvasType !== "wall";

  useEffect(
    () =>
      useOperatingStateStore.getState().registerWorkspace({
        workspaceId,
        canvasType,
        label,
        capabilities: { canTune, canCommand },
      }),
    [workspaceId, canvasType, label, canTune, canCommand],
  );

  useEffect(
    () =>
      useOperatingStateStore.subscribe((state, previous) => {
        const received = state.lastCommand;
        if (!received || received === previous.lastCommand) return;

        if (received.command.type === "flipPage") {
          const { workspaceId: target, pageIndex } = received.command;

          // `workspaceStore.setActivePage` moves the *active* workspace only
          // (#656), so a command aimed at a background workspace is ignored
          // here rather than silently flipping the wrong one; per-workspace
          // paging arrives with workspace switching (#657).
          const workspaceState = useWorkspaceStore.getState();
          if (workspaceState.activeWorkspaceId !== target) return;
          const page = workspaceState.workspaces.find((ws) => ws.id === target)?.pages[pageIndex];
          if (!page) return;
          workspaceState.setActivePage(page.id);
          return;
        }

        if (received.command.type === "tune") {
          // Only the exact screen the phone named acts on it (PR #694
          // review, item 1/8): `workspaceId` alone is not unique — every
          // non-phone canvas that hasn't picked a workspace defaults to the
          // same id — so both the device and workspace id must match the
          // registration the phone actually chose.
          const ownDeviceId = useOperatingStateStore.getState().deviceId;
          if (
            received.command.deviceId !== ownDeviceId ||
            received.command.workspaceId !== workspaceId
          ) {
            return;
          }
          // A wall never acts on a command (item 4), mirroring the
          // `capabilities.canCommand` filter the phone applies when it
          // picks a workspace to tune.
          if (!canCommand) {
            useOperatingStateStore
              .getState()
              .reportTuneResult(ownDeviceId, workspaceId, false, "This screen cannot act on commands.");
            return;
          }

          const ok = queueTune(received.command.frequencyKHz, received.command.mode);
          const reason = ok
            ? null
            : tuneDisabledReason(
                {
                  ...useRigStore.getState(),
                  bridgeEnabled: useSettingsStore.getState().bridgeEnabled,
                  kiosk: useKioskStore.getState().active,
                },
                received.command.frequencyKHz,
              );
          // PR #694 review, item 2(a): TUNE was fire-and-forget; report back
          // so the phone can show an honest SENT/FAILED result.
          useOperatingStateStore.getState().reportTuneResult(ownDeviceId, workspaceId, ok, reason);
        }
      }),
    [workspaceId, canCommand],
  );
}
