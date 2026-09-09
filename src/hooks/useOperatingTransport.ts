/**
 * Attaches this browsing context to the shared operating-state transport
 * (#658) for as long as the app is mounted.
 *
 * It is deliberately separate from `useOperatingScreen`, and mounted at the
 * app boundary rather than on `/workspace`: the workflow cursor is written
 * from every canvas — a contact entered on the map goes through
 * `opsPostureStore`, which writes `cursor.contact` — so a connection that
 * only existed while the operator happened to be on the workspace route
 * would silently drop those writes on the floor.
 *
 * It imports nothing but the store, so the app entry chunk does not gain
 * `workspaceStore` or the widget registry.
 */

import { useEffect } from "react";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

export function useOperatingTransport(): void {
  useEffect(() => useOperatingStateStore.getState().connect(), []);
}
