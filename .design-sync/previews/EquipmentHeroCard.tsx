import { EquipmentHeroCard } from "propulse";

export function Transceiver() {
  return (
    <EquipmentHeroCard
      open
      onClose={() => {}}
      title="Icom IC-7300"
      subtitle="HF/6m SDR transceiver"
      equipmentType="radio"
      typeLabel="Transceiver"
      tier="highend"
      stats={[
        { icon: "power", label: "Power", value: "100W" },
        { icon: "bands", label: "Bands", value: "160m-6m" },
        { icon: "score", label: "RX Score", value: "82" },
        { icon: "impedance", label: "Impedance", value: "50Ω" },
      ]}
      capabilities={[
        { label: "20m", category: "band" },
        { label: "40m", category: "band" },
        { label: "FT8", category: "mode" },
        { label: "Waterfall", category: "feature" },
      ]}
      groups={[
        {
          heading: "Receiver",
          fields: [
            { label: "RMDR", value: 108, unit: "dB" },
            { label: "Sensitivity", value: 0.16, unit: "µV" },
          ],
        },
      ]}
      badges={[{ label: "Tested", color: "#22C55E" }]}
      isActive
      onEdit={() => {}}
      onDelete={() => {}}
      onSetActive={() => {}}
    />
  );
}

export function Antenna() {
  return (
    <EquipmentHeroCard
      open
      onClose={() => {}}
      title="Hy-Gain TH-7DX"
      subtitle="7-element HF Yagi"
      equipmentType="antenna"
      typeLabel="Yagi"
      tier="flagship"
      stats={[
        { icon: "gain", label: "Gain (20m)", value: "9.2 dBi" },
        { icon: "length", label: "Height", value: "18 m" },
      ]}
      groups={[
        {
          heading: "Mounting",
          fields: [
            { label: "Mount", value: "Tower" },
            { label: "Rotatable", value: true },
          ],
        },
      ]}
    />
  );
}
