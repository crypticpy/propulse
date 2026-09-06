import { useShackStore } from "@/stores/shackStore";
import { Button, Notice } from "@/components/station-ui";
import { StationBuilderLab } from "./builder/StationBuilderLab";

export function DiagramSection({
  onNavigateToEquipment,
}: {
  onNavigateToEquipment?: (category?: string) => void;
}) {
  const hasEquipment = useShackStore(
    (s) => s.radios.length + s.antennas.length + s.feedlines.length > 0,
  );
  const chainCount = useShackStore((s) => s.stationChains.length);
  return (
    <div className="su-stack">
      {chainCount === 0 && (
        <Notice
          title={
            hasEquipment
              ? "Give your signal a path"
              : "Your workbench starts with your gear"
          }
        >
          {hasEquipment ? (
            "A signal path connects a radio through cables and accessories to an antenna. Create a path below, then add equipment in signal order."
          ) : (
            <>
              <p>
                Add a radio, antenna or cable to begin. Your equipment remains
                available to reuse in other paths.
              </p>
              {onNavigateToEquipment && (
                <Button onClick={() => onNavigateToEquipment()}>
                  Go to My gear
                </Button>
              )}
            </>
          )}
        </Notice>
      )}
      <div className="shack-legacy">
        <StationBuilderLab
          embedded
          onNavigateToEquipment={onNavigateToEquipment}
        />
      </div>
    </div>
  );
}
