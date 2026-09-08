import { EquipmentSection } from "propulse";

export function Default() {
  return <EquipmentSection />;
}

export function Standalone() {
  return (
    <div className="max-w-3xl">
      <EquipmentSection />
    </div>
  );
}
