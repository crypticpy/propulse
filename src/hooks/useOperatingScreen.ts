/**
 * Joins the screen rendering a workspace to the shared operating state (#658).
 *
 * One hook call does three things, in this order:
 * 1. attaches the transport (`BroadcastChannel` today, plus the account
 *    channel once `createAccountTransport` is real),
 * 2. registers this workspace so the operator's other screens know it exists
 *    and what it can do (`canTune`, `canCommand`),
 * 3. applies inbound commands that only a workspace host can carry out —
 *    today just `flipPage`.
 *
 * It lives outside `operatingStateStore` on purpose: the cursor has to work
 * on canvases that have no workspace at all (the map, the wall), so the store
 * must not depend on `workspaceStore`.
 */

import { useEffect } from "react";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useRigStore } from "@/stores/rigStore";
import { useActiveWorkspace, useWorkspaceStore } from "@/stores/workspaceStore";

export function useOperatingScreen(): void {
  const workspace = useActiveWorkspace();
  const workspaceId = workspace.id;
  const canvasType = workspace.canvasType;
  const label = workspace.name;
  const canTune = useRigStore(
    (state) => state.catEnabled && state.bridgeConnected && state.connected,
  );
  // Owner rule (epic #652 #5): a wall shows information, it never acts.
  const canCommand = canvasType !== "wall";

  useEffect(() => useOperatingStateStore.getState().connect(), []);

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
        if (received.command.type !== "flipPage") return;
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
      }),
    [],
  );
}
