import { Disclosure, KeyValueList } from "propulse";

export function Collapsed() {
  return (
    <Disclosure title="Advanced settings" summary="3 overrides">
      <KeyValueList
        items={[
          { label: "CAT baud rate", value: "19200" },
          { label: "PTT method", value: "CAT" },
        ]}
      />
    </Disclosure>
  );
}

export function Expanded() {
  return (
    <Disclosure title="Antenna details" summary="Dipole · 40 m" open>
      <KeyValueList
        items={[
          { label: "Feedpoint", value: "Center-fed" },
          { label: "Height", value: "9 m" },
          { label: "SWR at 7.074 MHz", value: "1.3 : 1" },
        ]}
      />
    </Disclosure>
  );
}
