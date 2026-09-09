import { useState } from "react";
import { SolarDisclosure } from "propulse";

export function Open() {
  const [open, setOpen] = useState(true);
  return (
    <SolarDisclosure
      id="band-conditions"
      title="HF Band Conditions"
      summary="20 m excellent, 40 m good"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      accent="accent"
    >
      <p className="text-sm text-su-text">
        SFI 142, Kp 2. Expect excellent daytime DX on 20 m and 15 m, with
        strong evening conditions on 40 m.
      </p>
    </SolarDisclosure>
  );
}

export function Collapsed() {
  const [open, setOpen] = useState(false);
  return (
    <SolarDisclosure
      id="solar-wind"
      title="Solar Wind"
      summary="420 km/s, Bz -4 nT"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      accent="info"
    >
      <p className="text-sm text-su-text">
        Solar wind speed 420 km/s, density 6.2 p/cm³, IMF Bz -4 nT.
      </p>
    </SolarDisclosure>
  );
}

export function WarningOpen() {
  const [open, setOpen] = useState(true);
  return (
    <SolarDisclosure
      id="geomagnetic-watch"
      title="Geomagnetic Watch"
      summary="Kp 6, G2 storm in progress"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      accent="warning"
    >
      <p className="text-sm text-su-text">
        Kp reached 6 in the last interval. High-latitude paths may see
        absorption; 6 m aurora openings possible.
      </p>
    </SolarDisclosure>
  );
}
