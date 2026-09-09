import { useEffect } from "react";
import { LayoutModeDropdown, Surface } from "propulse";

// open is internal useState(false) with no controlling prop. Simulate the
// same click the operator makes on the trigger to reveal the layout/
// destination menu — the only way to get an honest populated card.
function OpenOnMount({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    (document.querySelector('[aria-haspopup="menu"]') as HTMLElement | null)?.click();
  }, []);
  return <>{children}</>;
}

export function Open() {
  return (
    <Surface style={{ width: 320, height: 360 }}>
      <OpenOnMount>
        <LayoutModeDropdown />
      </OpenOnMount>
    </Surface>
  );
}

export function CompactOpen() {
  return (
    <Surface style={{ width: 260, height: 360 }}>
      <OpenOnMount>
        <LayoutModeDropdown compact activeDestination="explorer" />
      </OpenOnMount>
    </Surface>
  );
}
