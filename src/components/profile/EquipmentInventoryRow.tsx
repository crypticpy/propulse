import { EquipmentGlyph } from "@/components/station-ui";
import { useImageUrl } from "@/hooks/useImageUrl";
import type { EquipmentType } from "@/components/shack/equipmentCardTypes";
import "./my-shack-tab.css";

export function EquipmentInventoryRow({
  title,
  subtitle,
  equipmentType,
  stats,
  imageId,
}: {
  title: string;
  subtitle?: string;
  equipmentType: EquipmentType;
  stats?: Array<{ label: string; value: string }>;
  imageId?: string;
}) {
  const { url } = useImageUrl(imageId);
  const kind =
    equipmentType === "feedline"
      ? "cable"
      : equipmentType === "accessory" || equipmentType === "inline"
        ? "tuner"
        : equipmentType;
  return (
    <li className="profile-shack-row">
      {url ? <img src={url} alt="" /> : <EquipmentGlyph kind={kind} />}
      <div>
        <strong>{title}</strong>
        {subtitle && <p className="su-hint">{subtitle}</p>}
      </div>
      {stats && (
        <dl>
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="su-hint">{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
