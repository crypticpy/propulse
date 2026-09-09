import { DetailModal, KeyValueList, Stack } from "propulse";

export function SolarFluxDetail() {
  return (
    <DetailModal
      isOpen
      onClose={() => {}}
      title="Solar Flux Index"
      subtitle="Detailed breakdown"
      size="md"
    >
      <Stack>
        <KeyValueList
          items={[
            { label: "SFI", value: "142" },
            { label: "A-index", value: "8" },
            { label: "K-index", value: "3" },
            { label: "Sunspot number", value: "97" },
            { label: "X-ray flux", value: "C2.1" },
            { label: "Updated", value: "18:40 UTC" },
          ]}
        />
      </Stack>
    </DetailModal>
  );
}

export function BandConditionsDetail() {
  return (
    <DetailModal
      isOpen
      onClose={() => {}}
      title="Band Conditions — 20 m"
      subtitle="Path to VK6LC, short path"
      size="lg"
    >
      <Stack>
        <KeyValueList
          items={[
            { label: "Distance", value: "7,842 km" },
            { label: "Bearing", value: "312°" },
            { label: "MUF", value: "24.3 MHz" },
            { label: "S-meter estimate", value: "S7" },
            { label: "Best mode", value: "FT8" },
          ]}
        />
      </Stack>
    </DetailModal>
  );
}
