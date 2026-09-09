import { BandRow, Surface } from "propulse";

export function Table() {
  return (
    <Surface>
      <div role="table" aria-label="HF Band Conditions">
        <div className="divide-y divide-su-line/20">
          <BandRow
            name="20m"
            freq="14.0 MHz"
            dayCondition="Excellent"
            nightCondition="Fair"
            bestFor="Daytime DX"
            spotCount={24}
          />
          <BandRow
            name="40m"
            freq="7.0 MHz"
            dayCondition="Good"
            nightCondition="Excellent"
            bestFor="Evening DX"
            spotCount={11}
          />
          <BandRow
            name="15m"
            freq="21.0 MHz"
            dayCondition="Fair"
            nightCondition="Poor"
            bestFor="Midday openings"
            spotCount={2}
          />
          <BandRow
            name="160m"
            freq="1.8 MHz"
            dayCondition="Poor"
            nightCondition="Good"
            bestFor="Top-band DX"
            isNightOnly
          />
        </div>
      </div>
    </Surface>
  );
}

export function AuroraAndQuiet() {
  return (
    <Surface>
      <div role="table" aria-label="HF Band Conditions">
        <div className="divide-y divide-su-line/20">
          <BandRow
            name="10m"
            freq="28.0 MHz"
            dayCondition="Aurora"
            nightCondition="Poor"
            bestFor="Sporadic-E, aurora flutter"
            spotCount={0}
          />
          <BandRow
            name="6m"
            freq="50.0 MHz"
            dayCondition="Aurora"
            nightCondition="Poor"
            bestFor="Magic band openings"
          />
        </div>
      </div>
    </Surface>
  );
}
