import { SpotAlertToastContainer, Surface } from "propulse";

const newDxccRule = {
  id: "rule-new-dxcc",
  name: "New DXCC entities",
  enabled: true,
  conditions: { entityPattern: "*", continents: ["AF", "AN", "OC"] },
  notification: { sound: true, browser: true, highlight: true },
  createdAt: "2026-08-01T00:00:00Z",
};

const rareCallRule = {
  id: "rule-rare-call",
  name: "Bouvet & rare DXpeditions",
  enabled: true,
  conditions: { callsignPattern: "3Y*" },
  notification: { sound: true, browser: false, highlight: true },
  createdAt: "2026-08-01T00:00:00Z",
};

const standardRule = {
  id: "rule-20m-ft8",
  name: "20m FT8 strong signals",
  enabled: true,
  conditions: { bands: ["20m"], modes: ["FT8"], minSnr: -5 },
  notification: { sound: false, browser: false, highlight: true },
  createdAt: "2026-08-01T00:00:00Z",
};

export function NewDxccStack() {
  return (
    <Surface style={{ width: 400, height: 260, position: "relative" }}>
      <SpotAlertToastContainer
        alerts={[
          {
            rule: newDxccRule,
            spot: {
              callsign: "3Y0J",
              frequency: 14195,
              mode: "SSB",
              band: "20m",
              snr: 4,
              source: "dxcluster",
              dxcc: 508,
              country: "Bouvet Island",
              continent: "AN",
              grid: "IB59",
            },
            matchedAt: "2026-09-08T18:22:00Z",
            matchedFields: ["entityPattern", "continents"],
          },
          {
            rule: rareCallRule,
            spot: {
              callsign: "VK0EK",
              frequency: 21074,
              mode: "FT8",
              band: "15m",
              snr: -8,
              source: "pskreporter",
              dxcc: 111,
              country: "Heard Island",
              continent: "AN",
              grid: "MH53",
            },
            matchedAt: "2026-09-08T18:20:15Z",
            matchedFields: ["callsignPattern"],
          },
        ]}
        onDismiss={() => {}}
      />
    </Surface>
  );
}

export function StandardMatch() {
  return (
    <Surface style={{ width: 400, height: 200, position: "relative" }}>
      <SpotAlertToastContainer
        alerts={[
          {
            rule: standardRule,
            spot: {
              callsign: "JA1XYZ",
              frequency: 14074,
              mode: "FT8",
              band: "20m",
              snr: -2,
              source: "pskreporter",
              dxcc: 339,
              country: "Japan",
              continent: "AS",
              grid: "PM95",
            },
            matchedAt: "2026-09-08T18:24:40Z",
            matchedFields: ["bands", "modes", "minSnr"],
          },
        ]}
        onDismiss={() => {}}
      />
    </Surface>
  );
}
