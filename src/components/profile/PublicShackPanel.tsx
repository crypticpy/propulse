/** Public summary only: no visitor inventory, rank, history or hardware state. */
import { useState } from "react";
import {
  Badge,
  EmptyState,
  EquipmentGlyph,
  KeyValueList,
  Section,
  StationProvider,
  Surface,
} from "@/components/station-ui";
import { usePublicEquipmentImage } from "@/hooks/usePublicEquipmentImage";
import { parsePublicEquipmentSummary } from "@/lib/station/stationIdentity";
import "./public-shack.css";

interface PublicShackPanelProps {
  equipment: unknown;
  ownerUserId?: string;
}

function formatWatts(watts?: number): string {
  if (watts == null || !Number.isFinite(watts)) return "Not shared";
  if (watts === 0) return "0 W";
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  if (watts >= 10) return `${Math.round(watts)} W`;
  return `${watts.toFixed(1)} W`;
}

function SharedPhoto({
  src,
  name,
  kind,
}: {
  src: string | null;
  name: string;
  kind: "radio" | "antenna";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className="public-shack-photo">
      {src && src !== failedUrl ? (
        <img
          src={src}
          alt={`Shared photo of ${name}`}
          loading="lazy"
          onError={() => setFailedUrl(src)}
        />
      ) : (
        <EquipmentGlyph kind={kind} />
      )}
    </div>
  );
}

export function PublicShackPanel({ equipment, ownerUserId }: PublicShackPanelProps) {
  const summary = parsePublicEquipmentSummary(equipment);
  const radioPhoto = usePublicEquipmentImage(ownerUserId, summary?.radioPhotoId);
  const antennaPhoto = usePublicEquipmentImage(ownerUserId, summary?.antennaPhotoId);

  if (!summary) {
    return (
      <StationProvider className="public-shack">
        <Surface>
          <EmptyState title="Equipment info not available">
            This operator has not shared a station summary.
          </EmptyState>
        </Surface>
      </StationProvider>
    );
  }

  const nodes = summary.nodes?.length
    ? summary.nodes
    : [
        ...(summary.radioName ? [{ type: "radio" as const, label: summary.radioName }] : []),
        ...(summary.antennaName ? [{ type: "antenna" as const, label: summary.antennaName }] : []),
      ];

  return (
    <StationProvider className="public-shack su-stack">
      <Surface>
        <Section
          title={summary.chainName || "Shared station"}
          description={summary.stationLine || [summary.radioName, summary.antennaName].filter(Boolean).join(" · ")}
          actions={<Badge>Shared setup</Badge>}
        >
          <p className="su-hint">
            Equipment and estimated performance shared by this operator.
          </p>
        </Section>
      </Surface>

      {nodes.length > 0 && (
        <Section title="Equipment in the shared setup" description="Named equipment, in the order provided by the station summary.">
          <ol className="public-shack-nodes" role="list">
            {nodes.map((node, index) => (
              <li key={`${index}-${node.type}-${node.label}`}>
                <span className="public-shack-step" aria-hidden="true">{index + 1}</span>
                <EquipmentGlyph kind={node.type === "feedline" ? "cable" : node.type} />
                <div>
                  <span className="su-hint">{node.type === "feedline" ? "Feedline" : node.type === "radio" ? "Radio" : "Antenna"}</span>
                  <p>{node.label}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(summary.radioName || summary.antennaName) && (
        <Section title="A closer look" description="Shared equipment photos and specifications.">
          <div className="public-shack-equipment">
            {summary.radioName && (
              <article className="public-shack-detail">
                <SharedPhoto src={radioPhoto} name={summary.radioName} kind="radio" />
                <div className="public-shack-detail-body">
                  <p className="su-eyebrow">Radio</p>
                  <h3>{summary.radioName}</h3>
                  {summary.chainName && <p className="su-hint">{summary.chainName}</p>}
                  <KeyValueList items={[{ label: "Power in shared setup", value: formatWatts(summary.powerWatts) }]} />
                </div>
              </article>
            )}
            {summary.antennaName && (
              <article className="public-shack-detail">
                <SharedPhoto src={antennaPhoto} name={summary.antennaName} kind="antenna" />
                <div className="public-shack-detail-body">
                  <p className="su-eyebrow">Antenna</p>
                  <h3>{summary.antennaName}</h3>
                  {summary.antennaType && <p className="su-hint">{summary.antennaType}</p>}
                  <KeyValueList items={[
                    { label: "20m ERP · estimated", value: formatWatts(summary.erp20m) },
                    { label: "40m ERP · estimated", value: formatWatts(summary.erp40m) },
                  ]} />
                  <p className="su-hint">Effective radiated power (ERP) is an estimate from the shared setup.</p>
                </div>
              </article>
            )}
          </div>
        </Section>
      )}
    </StationProvider>
  );
}
