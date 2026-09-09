import { EquipmentCardMd, Grid } from "propulse";

export function Transceiver() {
  return (
    <Grid>
      <EquipmentCardMd
        title="Icom IC-7300"
        subtitle="HF/6m SDR transceiver"
        equipmentType="radio"
        typeLabel="Transceiver"
        tier="highend"
        badges={[{ label: "Tested", color: "green" }]}
        stats={[
          { icon: "power", label: "Power", value: "100W" },
          { icon: "bands", label: "Bands", value: "160m-6m" },
          { icon: "score", label: "RX Score", value: "82" },
        ]}
        capabilities={[
          { label: "20m", category: "band" },
          { label: "FT8", category: "mode" },
        ]}
        isActive
      />
    </Grid>
  );
}

export function Feedline() {
  return (
    <Grid>
      <EquipmentCardMd
        title="LMR-400, 30 m run"
        subtitle="Main tower feedline"
        equipmentType="feedline"
        typeLabel="Coax"
        tier="entry"
        stats={[
          { icon: "loss", label: "Loss (7 MHz)", value: "0.7 dB" },
          { icon: "loss", label: "Loss (144 MHz)", value: "2.7 dB" },
        ]}
        onClick={() => {}}
      />
    </Grid>
  );
}
