import type { MouseEvent } from "react";
import { ArrowDown, ArrowUp, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button, EmptyState, IconButton } from "@/components/station-ui";
import {
  useShackStore,
  useUserAccessories,
  useUserAntennas,
  useUserFeedlines,
  useUserRadios,
} from "@/stores/shackStore";
import type { StationChain } from "@/types/stationChain";

/** The same ordered path and actions as the canvas, without dragging. */
export function SignalPathList({
  chain,
  onSelect,
  onSwap,
  onRemove,
}: {
  chain: StationChain;
  onSelect: (index: number) => void;
  onSwap: (index: number) => void;
  onRemove: (index: number, name: string) => void;
}) {
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const reorder = useShackStore((s) => s.reorderChainNodes);
  const move = (
    event: MouseEvent<HTMLButtonElement>,
    index: number,
    direction: -1 | 1,
  ) => {
    const list = event.currentTarget.closest("ol");
    const destination = index + direction;
    const result = reorder(chain.id, index, destination);
    if (result.ok) {
      // Resolve after render by destination: duplicate equipment references
      // have occurrence keys and can exchange DOM identities when reordered.
      requestAnimationFrame(() => {
        if (!list?.isConnected) return;
        const row = list.children.item(destination);
        const control =
          row?.querySelector<HTMLButtonElement>(
            `[data-path-move="${direction}"]:not(:disabled)`,
          ) ?? row?.querySelector<HTMLButtonElement>("[data-path-configure]");
        control?.focus();
      });
    }
  };
  if (!chain.nodes.length)
    return (
      <EmptyState title="Your path starts here">
        Choose Add to path to place your first piece of equipment.
      </EmptyState>
    );
  const occurrences = new Map<string, number>();
  return (
    <ol
      className="sw-path-list"
      aria-label={`${chain.name} equipment in signal order`}
    >
      {chain.nodes.map((node, index) => {
        let name = "Equipment unavailable";
        let detail: string = node.type;
        if (node.type === "radio") {
          const entry = radios.find((r) => r.userRadio.id === node.radioId);
          name =
            entry?.userRadio.nickname ||
            entry?.equipment?.displayName ||
            (entry?.equipment
              ? `${entry.equipment.manufacturer} ${entry.equipment.model}`
              : "Radio unavailable");
          detail = "Radio";
        } else if (node.type === "antenna") {
          name =
            antennas.find((a) => a.id === node.antennaId)?.name ??
            "Antenna unavailable";
          detail = "Antenna";
        } else if (node.type === "accessory") {
          name =
            accessories.find((a) => a.id === node.accessoryId)?.name ??
            "Accessory unavailable";
          detail = "RF accessory";
        } else {
          const run = chain.feedlineRuns.find(
            (r) => r.id === node.feedlineRunId,
          );
          name =
            feedlines.find((f) => f.id === run?.feedlineId)?.name ??
            "Feedline unavailable";
          detail = `Feedline · ${run?.inlineComponentIds.length ?? 0} inline components`;
        }
        const equipmentId =
          node.type === "radio"
            ? node.radioId
            : node.type === "antenna"
              ? node.antennaId
              : node.type === "accessory"
                ? node.accessoryId
                : node.feedlineRunId;
        const identity = JSON.stringify([node.type, equipmentId]);
        const occurrence = occurrences.get(identity) ?? 0;
        occurrences.set(identity, occurrence + 1);
        return (
          <li key={JSON.stringify([identity, occurrence])}>
            <span className="sw-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <div className="sw-path-item-name">
              <strong>{name}</strong>
              <span className="su-hint">{detail}</span>
            </div>
            <div className="sw-path-actions">
              <Button
                data-path-configure
                onClick={() => onSelect(index)}
                aria-label={`Configure ${name}`}
              >
                <Pencil size={16} aria-hidden="true" /> Configure
              </Button>
              <IconButton label={`Swap ${name}`} onClick={() => onSwap(index)}>
                <RefreshCw size={17} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Move ${name} earlier`}
                data-path-move={-1}
                disabled={index === 0}
                onClick={(event) => move(event, index, -1)}
              >
                <ArrowUp size={17} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Move ${name} later`}
                data-path-move={1}
                disabled={index === chain.nodes.length - 1}
                onClick={(event) => move(event, index, 1)}
              >
                <ArrowDown size={17} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Remove ${name} from path`}
                onClick={() => onRemove(index, name)}
              >
                <Trash2 size={17} aria-hidden="true" />
              </IconButton>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
