import { useState } from "react";
import { ChoiceGroup, Surface } from "propulse";

export function Basic() {
  const [choice, setChoice] = useState("owned");
  return (
    <Surface>
      <ChoiceGroup
        label="Ownership"
        value={choice}
        onChange={setChoice}
        options={[
          { value: "owned", label: "Owned" },
          { value: "planned", label: "Planned" },
          { value: "borrowed", label: "Borrowed" },
        ]}
      />
    </Surface>
  );
}

export function WithDisabledOption() {
  const [mode, setMode] = useState("ssb");
  return (
    <Surface>
      <ChoiceGroup
        label="Mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "cw", label: "CW" },
          { value: "ssb", label: "SSB" },
          { value: "ft8", label: "FT8" },
          { value: "rtty", label: "RTTY", disabled: true },
        ]}
      />
    </Surface>
  );
}
