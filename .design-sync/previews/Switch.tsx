import { useState } from "react";
import { Stack, Surface, Switch } from "propulse";

export function Basic() {
  const [activity, setActivity] = useState(true);
  const [alerts, setAlerts] = useState(false);
  return (
    <Surface>
      <Stack>
        <Switch
          label="Show station activity"
          checked={activity}
          onChange={(event) => setActivity(event.target.checked)}
        />
        <Switch
          label="Band opening alerts"
          hint="Notify when 10 m opens to your grid square."
          checked={alerts}
          onChange={(event) => setAlerts(event.target.checked)}
        />
      </Stack>
    </Surface>
  );
}
