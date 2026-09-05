/** Layout proposals only arrange a pinned revision; they cannot edit its electrical graph. */
import { layoutSchema, parseWorkbenchArchive, type DeepReadonly, type Layout, type WorkbenchArchive } from "@/lib/station/workbench/contracts";

type Archive = DeepReadonly<WorkbenchArchive>;
export type LayoutContent = Pick<Layout, "positions" | "groups" | "viewport" | "itemOrder" | "preferences">;

/** Caller supplies stable identity; archive validation checks every member/group reference. */
export function prepareLayout(archiveInput: Archive, input: Omit<Layout, "ownerId">): DeepReadonly<Layout> {
  const archive = parseWorkbenchArchive(archiveInput);
  const layout = layoutSchema.parse({ ...input, ownerId: archive.ownerId });
  if (archive.layouts.some((item) => item.id === layout.id)) throw new Error("Layout ID already exists");
  return parseWorkbenchArchive({ ...archive, layouts: [...archive.layouts, layout] }).layouts.at(-1)!;
}

/** Full replacement of presentation content. Identity, view and pinned revision remain stable.
 * W04 must commit this proposal with its storage concurrency checks. */
export function prepareLayoutUpdate(archiveInput: Archive, layoutId: string, content: LayoutContent): DeepReadonly<Layout> {
  const archive = parseWorkbenchArchive(archiveInput);
  const original = archive.layouts.find((item) => item.id === layoutId);
  if (!original) throw new Error("Layout does not exist");
  // Reject extra identity/connectivity fields even from untyped runtime callers.
  const parsed = layoutSchema.pick({ positions: true, groups: true, viewport: true, itemOrder: true, preferences: true }).parse(content);
  const { itemOrder: _order, preferences: _preferences, ...identityAndRequired } = original;
  const layout = layoutSchema.parse({ ...identityAndRequired, ...parsed });
  return parseWorkbenchArchive({ ...archive, layouts: archive.layouts.map((item) => item.id === layoutId ? layout : item) }).layouts.find((item) => item.id === layoutId)!;
}
