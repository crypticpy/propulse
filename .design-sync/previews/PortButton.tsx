import { useState } from "react";
import { Inline, PortButton, Surface } from "propulse";

export function PortSelector() {
  const [port, setPort] = useState("RF IN");
  return (
    <Surface>
      <Inline>
        {["RF IN", "RF OUT"].map((name) => (
          <PortButton
            key={name}
            name={name}
            detail="Connector unknown"
            selected={port === name}
            onClick={() => setPort(name)}
          />
        ))}
      </Inline>
    </Surface>
  );
}

export function RadioPorts() {
  return (
    <Surface>
      <Inline>
        <PortButton name="ANT 1" detail="SO-239" selected onClick={() => {}} />
        <PortButton name="ANT 2" detail="SO-239" onClick={() => {}} />
        <PortButton name="ACC" detail="13-pin DIN" onClick={() => {}} />
      </Inline>
    </Surface>
  );
}
