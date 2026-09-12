import { Badge, Dialog, Notice } from "@/components/station-ui";
import type { EquipmentUsedInViewModel } from "@/lib/station/workbench/equipment/inventoryQuery";

const ROLE_LABELS = {
  "current-draft": "Current draft",
  "pinned-revision": "Pinned revision",
  operating: "Using in ProPulse",
  experiment: "Experiment",
  publication: "Publication",
} as const;

export interface EquipmentUsedInDialogProps {
  open: boolean;
  onClose: () => void;
  view: EquipmentUsedInViewModel | null;
  readOnly?: boolean;
}

export function EquipmentUsedInDialog({
  open,
  onClose,
  view,
  readOnly = true,
}: EquipmentUsedInDialogProps) {
  const title = view ? `Used in · ${view.label}` : "Used in";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Owner-scoped impact review. This read-only view does not change inventory or setups."
    >
      {!view ? (
        <Notice title="Impact unavailable">
          Used in references could not be loaded for this item.
        </Notice>
      ) : view.references.length === 0 ? (
        <Notice title="Not referenced yet">
          This item is in My gear but not referenced by any setup draft, operating
          selection, experiment or publication projection.
        </Notice>
      ) : (
        <ul className="space-y-3">
          {view.references.map((reference) => (
            <li
              key={`${reference.role}:${reference.referenceId}:${reference.revisionId}`}
              className="rounded-xl border border-su-line/20 bg-panel/20 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{ROLE_LABELS[reference.role]}</Badge>
                {reference.isCurrentMembership && (
                  <Badge>Current setup membership</Badge>
                )}
                {reference.isHistorical && !reference.isCurrentMembership && (
                  <Badge>Historical / pinned</Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-su-text">{reference.label}</p>
              <p className="mt-1 text-xs text-su-muted">
                Setup {reference.setupName} · revision {reference.revisionId}
              </p>
            </li>
          ))}
        </ul>
      )}

      {view && (
        <div className="mt-6 space-y-3">
          <Notice title="Remove from setup">{view.removeFromSetupHelp}</Notice>
          <Notice title="Delete or retire inventory">{view.deleteInventoryHelp}</Notice>
          {readOnly && (
            <p className="text-xs text-su-muted">
              Legacy My gear editing is unchanged. Typed inventory services are not
              writing to cloud storage yet.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
