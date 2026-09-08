import { KeyValueList, Surface } from "propulse";

export function EquipmentSummary() {
  return (
    <Surface>
      <KeyValueList
        items={[
          { label: "Type", value: "Transceiver" },
          { label: "Ownership", value: "Owned" },
          { label: "Power rating", value: "100 W · User entered" },
          { label: "Photo", value: "ic-7300-front.jpg" },
          { label: "Private notes", value: "Firmware 1.42, filters installed" },
        ]}
      />
    </Surface>
  );
}

export function StationTotals() {
  return (
    <Surface>
      <KeyValueList
        items={[
          { label: "Power in shared setup", value: "1.5 kW" },
          { label: "Antennas", value: "3" },
          { label: "Bands covered", value: "160 m through 70 cm" },
        ]}
      />
    </Surface>
  );
}
