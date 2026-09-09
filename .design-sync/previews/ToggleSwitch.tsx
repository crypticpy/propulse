import { useState } from "react";
import { Stack, Surface, ToggleSwitch } from "propulse";

export function States() {
  const [alerts, setAlerts] = useState(true);
  const [beacon, setBeacon] = useState(false);
  return (
    <Surface>
      <Stack>
        <ToggleSwitch
          checked={alerts}
          onChange={setAlerts}
          label="Band opening alerts"
          description="Notify when 20 m opens to Europe"
        />
        <ToggleSwitch
          checked={beacon}
          onChange={setBeacon}
          label="NCDXF beacon tracking"
        />
        <ToggleSwitch
          checked={false}
          onChange={() => {}}
          disabled
          label="Rotor control"
          description="Requires BRIDGE_ROTOR enabled"
        />
      </Stack>
    </Surface>
  );
}
