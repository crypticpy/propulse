import { SpotRow, Surface } from "propulse";

const baseWorked = {
  isWorked: false,
  workedOnBand: false,
  workedBands: [] as string[],
  isATNO: false,
};

interface PreviewSpot {
  id: string;
  spotter: string;
  dx: string;
  dxGrid?: string;
  frequency: number;
  mode?: string;
  comment: string;
  time: Date;
  band?: string;
}

function makeSpot(overrides: Partial<PreviewSpot> & { id: string }): PreviewSpot {
  return {
    spotter: "W1AW",
    dx: "JA1XYZ",
    dxGrid: "PM95",
    frequency: 14025.0,
    mode: "CW",
    comment: "599 UP2",
    time: new Date("2026-09-08T18:42:00Z"),
    band: "20m",
    ...overrides,
  };
}

const headerCols =
  "grid grid-cols-[46px_40px_52px_66px_1fr_50px_62px_1fr_72px] gap-1.5 px-2 py-1.5 border-b border-su-line/40 text-[10px] font-semibold text-su-muted uppercase tracking-wider";

export function List() {
  return (
    <Surface>
      <div role="table" aria-label="DX Spots" className="bg-nebula-blue rounded-lg overflow-hidden">
        <div className={headerCols} role="row" style={{ borderLeft: "3px solid transparent" }}>
          <div>Time</div>
          <div>Age</div>
          <div>Band</div>
          <div>Freq</div>
          <div>DX</div>
          <div className="text-right">Dist-km</div>
          <div>Spotter</div>
          <div>Info</div>
          <div />
        </div>
        <div className="divide-y divide-su-line/20">
          <SpotRow
            spot={makeSpot({ id: "s1", dx: "JA1XYZ", band: "20m", frequency: 14025.0, spotter: "W1AW", comment: "599 UP2 QSX 14028" })}
            index={0}
            isSelected={false}
            isHovered={false}
            workedStatus={{ ...baseWorked }}
            isAlertMatch={false}
            isNeeded={true}
            distanceKm={9612}
            onSelect={() => {}}
            onHover={() => {}}
            onSetTarget={() => {}}
            onWork={() => {}}
            onWatchCallsign={() => {}}
            onHideSpot={() => {}}
          />
          <SpotRow
            spot={makeSpot({ id: "s2", dx: "VK6LC", band: "40m", frequency: 7025.0, spotter: "DL2ABC", mode: "SSB", comment: "Loud in EU" })}
            index={1}
            isSelected={true}
            isHovered={false}
            workedStatus={{ isWorked: true, workedOnBand: true, workedBands: ["40m", "20m"], isATNO: false }}
            isAlertMatch={false}
            isNeeded={false}
            distanceKm={16820}
            onSelect={() => {}}
            onHover={() => {}}
          />
          <SpotRow
            spot={makeSpot({ id: "s3", dx: "3B8XF", band: "17m", frequency: 18100.0, spotter: "F5ABC", mode: "FT8", comment: "New DXCC!" })}
            index={2}
            isSelected={false}
            isHovered={false}
            workedStatus={{ isWorked: false, workedOnBand: false, workedBands: [], isATNO: true, entityName: "Mauritius" }}
            isAlertMatch={true}
            isNeeded={true}
            distanceKm={9130}
            onSelect={() => {}}
            onHover={() => {}}
          />
        </div>
      </div>
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface>
      <div role="table" aria-label="DX Spots" className="bg-nebula-blue rounded-lg overflow-hidden divide-y divide-su-line/20">
        <SpotRow
          compact
          spot={makeSpot({ id: "c1", dx: "DL2ABC", band: "20m", frequency: 14074.0, spotter: "K5XYZ", mode: "FT8", dxGrid: "JO31", comment: "" })}
          index={0}
          isSelected={false}
          isHovered={false}
          workedStatus={{ ...baseWorked, isWorked: true, workedOnBand: true, workedBands: ["20m"] }}
          isAlertMatch={false}
          isNeeded={false}
          distanceKm={7480}
          onSelect={() => {}}
          onHover={() => {}}
        />
        <SpotRow
          compact
          spot={makeSpot({ id: "c2", dx: "VK6LC", band: "15m", frequency: 21030.0, spotter: "W1AW", mode: "CW", dxGrid: "OF87", comment: "Weak, QSB" })}
          index={1}
          isSelected={false}
          isHovered={true}
          workedStatus={{ ...baseWorked }}
          isAlertMatch={false}
          isNeeded={true}
          distanceKm={16820}
          onSelect={() => {}}
          onHover={() => {}}
        />
      </div>
    </Surface>
  );
}
