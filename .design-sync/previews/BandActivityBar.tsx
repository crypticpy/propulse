import { BandActivityBar, Surface } from "propulse";

interface PreviewSpot {
  id: string;
  spotter: string;
  dx: string;
  frequency: number;
  comment: string;
  time: Date;
  band: string;
}

function spotsFor(bands: Array<[string, number]>): PreviewSpot[] {
  const spots: PreviewSpot[] = [];
  let n = 0;
  for (const [band, count] of bands) {
    for (let i = 0; i < count; i++) {
      n += 1;
      spots.push({
        id: `spot-${n}`,
        spotter: "W1AW",
        dx: `JA1XY${n}`,
        frequency: 14000 + n,
        comment: "",
        time: new Date(),
        band,
      });
    }
  }
  return spots;
}

export function Distribution() {
  const spots = spotsFor([
    ["160m", 1],
    ["80m", 3],
    ["40m", 8],
    ["20m", 24],
    ["17m", 5],
    ["15m", 11],
    ["10m", 2],
  ]);
  return (
    <Surface>
      <BandActivityBar spots={spots} onBandClick={() => {}} />
    </Surface>
  );
}

export function ActiveFilter() {
  const spots = spotsFor([
    ["40m", 6],
    ["20m", 18],
    ["15m", 9],
    ["10m", 3],
  ]);
  return (
    <Surface>
      <BandActivityBar
        spots={spots}
        activeBands={["20m"]}
        onBandClick={() => {}}
      />
    </Surface>
  );
}
