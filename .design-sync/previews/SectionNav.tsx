import { SectionNav } from "propulse";

export function OnPrimitives() {
  return (
    <SectionNav
      label="Design review"
      items={[
        { href: "/design-system", label: "Primitives", current: true },
        { href: "/design-system/add-equipment", label: "Add equipment" },
      ]}
    />
  );
}

export function StationSections() {
  return (
    <SectionNav
      label="Station"
      items={[
        { href: "#gear", label: "Gear" },
        { href: "#antennas", label: "Antennas", current: true },
        { href: "#log", label: "Log" },
        { href: "#settings", label: "Settings" },
      ]}
    />
  );
}
