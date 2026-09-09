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
import { queueTune } from "@/lib/radio/tune";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useRigStore } from "@/stores/rigStore";
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
          // Only the screen the phone actually named acts on it — the same
          // registration record (`capabilities.canTune`) it read to enable
          // its TUNE button names this workspace id.
          if (received.command.workspaceId !== workspaceId) return;
          queueTune(received.command.frequencyKHz, received.command.mode);
        }
      }),
    [workspaceId],
  );
}
