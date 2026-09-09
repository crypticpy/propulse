import { useState } from "react";
import { Button, KeyValueList, Notice, Stack, Surface, Tabs } from "propulse";

export function StationCategories() {
  const [tab, setTab] = useState("controls");
  return (
    <Tabs
      label="Component categories"
      value={tab}
      onChange={setTab}
      items={[
        {
          value: "controls",
          label: "Controls & forms",
          content: (
            <Stack>
              <Button variant="primary">Add equipment</Button>
              <Button variant="quiet">Cancel</Button>
            </Stack>
          ),
        },
        {
          value: "feedback",
          label: "States & feedback",
          content: (
            <Notice title="Connection saved" tone="success">
              Radio ANT 1 is connected to the tuner RF IN.
            </Notice>
          ),
        },
        {
          value: "station",
          label: "Station objects",
          content: (
            <Surface>
              <KeyValueList
                items={[
                  { label: "Type", value: "Transceiver" },
                  { label: "Ownership", value: "Owned" },
                ]}
              />
            </Surface>
          ),
        },
      ]}
    />
  );
}

export function WithDisabledTab() {
  const [tab, setTab] = useState("gear");
  return (
    <Tabs
      label="Equipment inspector"
      value={tab}
      onChange={setTab}
      items={[
        {
          value: "gear",
          label: "Gear",
          content: <p>IC-7300 · Home HF · 100 W · Firmware 1.42</p>,
        },
        {
          value: "log",
          label: "Log",
          content: <p>No contacts logged with this radio yet.</p>,
          disabled: true,
        },
      ]}
    />
  );
}
