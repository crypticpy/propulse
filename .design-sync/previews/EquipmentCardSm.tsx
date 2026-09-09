import { EquipmentCardSm, Stack } from "propulse";

export function DrawerList() {
  return (
    <Stack className="gap-2">
      <EquipmentCardSm
        title="Icom IC-7300"
        equipmentType="radio"
        typeLabel="Transceiver"
        tier="highend"
        stats={[
          { icon: "power", label: "Power", value: "100W" },
          { icon: "bands", label: "Bands", value: "160m-6m" },
        ]}
        draggable
      />
      <EquipmentCardSm
        title="Yaesu FT-991A"
        equipmentType="radio"
        typeLabel="Transceiver"
        tier="midrange"
        stats={[
          { icon: "power", label: "Power", value: "100W" },
          { icon: "bands", label: "Bands", value: "160m-70cm" },
        ]}
        draggable
      />
      <EquipmentCardSm
        title="LMR-400, 30m run"
        equipmentType="feedline"
        typeLabel="Coax"
        tier="entry"
        stats={[{ icon: "loss", label: "Loss (20m)", value: "1.4 dB" }]}
        draggable
      />
    </Stack>
  );
}

export function InUse() {
  return (
    <Stack className="gap-2">
      <EquipmentCardSm
        title="Hy-Gain TH-7DX"
        equipmentType="antenna"
        typeLabel="Yagi"
        tier="flagship"
        stats={[{ icon: "gain", label: "Gain (20m)", value: "9.2 dBi" }]}
        inUse
      />
    </Stack>
  );
}
