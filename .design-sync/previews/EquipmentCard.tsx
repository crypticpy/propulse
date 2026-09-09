import { EquipmentCard, Grid } from "propulse";

export function Transceiver() {
  return (
    <Grid>
      <EquipmentCard
        title="Icom IC-7300"
        subtitle="HF/6m SDR transceiver"
        equipmentType="radio"
        typeLabel="Transceiver"
        tier="highend"
        badges={[{ label: "Tested", color: "green" }, { label: "High-End", color: "blue" }]}
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
        isActive
        onToggleActive={() => {}}
      />
    </Grid>
  );
}

export function Antenna() {
  return (
    <Grid>
      <EquipmentCard
        title="Hy-Gain TH-7DX"
        subtitle="7-element HF Yagi"
        equipmentType="antenna"
        typeLabel="Yagi"
        tier="flagship"
        badges={[{ label: "Flagship", color: "orange" }]}
        stats={[
          { icon: "gain", label: "Gain (20m)", value: "9.2 dBi" },
          { icon: "bands", label: "Bands", value: "5 bands" },
          { icon: "length", label: "Height", value: "18 m" },
          { icon: "impedance", label: "Mount", value: "Tower, rotatable" },
        ]}
        capabilities={[
          { label: "20m", category: "band" },
          { label: "15m", category: "band" },
          { label: "10m", category: "band" },
        ]}
      />
    </Grid>
  );
}

export function WithEdit() {
  return (
    <Grid>
      <EquipmentCard
        title="LDG AT-200"
        subtitle="Automatic antenna tuner"
        equipmentType="accessory"
        typeLabel="Tuner"
        tier="midrange"
        badges={[{ label: "Mid-Range", color: "green" }]}
        stats={[
          { icon: "power", label: "Power", value: "200W" },
          { icon: "impedance", label: "Range", value: "6-1000Ω" },
        ]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </Grid>
  );
}
