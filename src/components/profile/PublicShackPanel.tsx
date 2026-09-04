/**
 * PublicShackPanel — Visitor showroom: schematic sketch, L-cards, photos.
 */

import { EquipmentCard } from "@/components/shack/EquipmentCard";
import { usePublicEquipmentImage } from "@/hooks/usePublicEquipmentImage";
import { parsePublicEquipmentSummary } from "@/lib/station/stationIdentity";

interface PublicShackPanelProps {
  equipment: unknown;
  ownerUserId?: string;
}

function formatErp(watts?: number): string | null {
  if (watts == null || !Number.isFinite(watts)) return null;
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  if (watts >= 10) return `${Math.round(watts)} W`;
  return `${watts.toFixed(1)} W`;
}

export function PublicShackPanel({
  equipment,
  ownerUserId,
}: PublicShackPanelProps) {
  const summary = parsePublicEquipmentSummary(equipment);
  const radioPhoto = usePublicEquipmentImage(ownerUserId, summary?.radioPhotoId);
  const antennaPhoto = usePublicEquipmentImage(
    ownerUserId,
    summary?.antennaPhotoId,
  );

  if (!summary) {
    return (
      <p className="text-gray-500 text-sm italic py-4 text-center">
        Equipment info not available
      </p>
    );
  }

  const erp20 = formatErp(summary.erp20m);
  const erp40 = formatErp(summary.erp40m);
  const nodes =
    summary.nodes && summary.nodes.length > 0
      ? summary.nodes
      : [
          summary.radioName
            ? { type: "radio" as const, label: summary.radioName }
            : null,
          summary.antennaName
            ? { type: "antenna" as const, label: summary.antennaName }
            : null,
        ].filter((node): node is { type: "radio" | "antenna"; label: string } =>
          Boolean(node),
        );

  return (
    <div className="space-y-5">
      <div className="bg-void/50 border border-white/10 rounded-xl px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          {summary.chainName ?? "Active station"}
        </p>
        <p className="text-sm text-gray-100">
          {summary.stationLine ||
            [summary.radioName, summary.antennaName]
              .filter(Boolean)
              .join(" · ")}
        </p>
      </div>

      {nodes.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {nodes.map((node, index) => (
            <div key={`${node.type}-${node.label}`} className="flex items-center gap-2">
              {index > 0 && (
                <span className="text-gray-600 font-mono text-xs" aria-hidden>
                  →
                </span>
              )}
              <div className="rounded-lg border border-white/10 bg-void/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider text-gray-500">
                  {node.type}
                </p>
                <p className="text-xs text-gray-200 whitespace-nowrap">
                  {node.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {summary.radioName && (
          <EquipmentCard
            title={summary.radioName}
            subtitle={summary.chainName}
            equipmentType="radio"
            typeLabel="TRANSCEIVER"
            photoUrl={radioPhoto ?? undefined}
            stats={
              summary.powerWatts
                ? [
                    {
                      icon: "power",
                      label: "Power",
                      value: `${Math.round(summary.powerWatts)} W`,
                    },
                  ]
                : undefined
            }
          />
        )}
        {summary.antennaName && (
          <EquipmentCard
            title={summary.antennaName}
            subtitle={summary.antennaType}
            equipmentType="antenna"
            typeLabel="ANTENNA"
            photoUrl={antennaPhoto ?? undefined}
            stats={[
              ...(erp20
                ? [{ icon: "power" as const, label: "20m ERP", value: erp20 }]
                : []),
              ...(erp40
                ? [{ icon: "power" as const, label: "40m ERP", value: erp40 }]
                : []),
            ]}
          />
        )}
      </div>
    </div>
  );
}
