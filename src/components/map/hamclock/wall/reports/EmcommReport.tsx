import { useMemo } from "react";
import { useRIM } from "@/hooks/useRIM";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import type { WeatherAlert } from "@/lib/api/weather";
import type { RIMSubScore } from "@/types/atmos";
import { reportTone, rimGrade } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

/** Alerts worth drawing before the box runs out of height. */
const MAX_ALERTS = 4;

const SEVERITY_RANK: Record<WeatherAlert["severity"], number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

const SEVERITY_TONE: Record<WeatherAlert["severity"], string> = {
  Extreme: "hc-bad",
  Severe: "hc-bad",
  Moderate: "hc-warn",
  Minor: "hc-info-text",
  Unknown: "hc-dim-text",
};

const TREND_ARROW: Record<RIMSubScore["trend"], string> = {
  up: "▲",
  down: "▼",
  stable: "—",
};

function subScoreValue(part: RIMSubScore): string {
  return part.dataAvailable
    ? `${Math.round(part.value)} ${TREND_ARROW[part.trend]}`
    : "—";
}

export interface EmcommReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The readiness drill-down: the composite RIM score an emergency coordinator
 * reads at a glance, its three situational sub-scores, and the severe-weather
 * alerts that are pulling it down. The sub-scores carry no attribution, so the
 * report shows the alert set as context rather than claiming causation.
 */
export function EmcommReport({ open, onClose }: EmcommReportProps) {
  const { rimResult, isLoading } = useRIM();
  const { alerts, error: alertError } = useWeatherAlerts();

  const ranked = useMemo(
    () =>
      [...alerts].sort(
        (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
      ),
    [alerts],
  );

  if (!rimResult || !rimResult.emcommReadiness.dataAvailable) {
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Emcomm report · regional readiness"
        hero="—"
        verdict="NO SCORE"
        footer="RIM · SPACE WEATHER + NWS ACTIVE ALERTS"
      >
        <p className="hcr-note">
          {isLoading
            ? "Computing readiness from space and severe weather…"
            : "Readiness inputs are unavailable right now."}
        </p>
      </WallReport>
    );
  }

  const score = rimResult.emcommReadiness;
  const { word, tone } = rimGrade(score.value);

  const facts: WallReportFact[] = [
    { label: "HF BAND", value: subScoreValue(rimResult.hfBand) },
    { label: "VHF / UHF", value: subScoreValue(rimResult.vhfUhf) },
    { label: "INFRA RISK", value: subScoreValue(rimResult.infraRisk) },
    { label: "COMPOSITE", value: Math.round(rimResult.composite) },
    { label: "TREND", value: TREND_ARROW[score.trend] },
    { label: "NWS ALERTS", value: alerts.length },
  ];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Emcomm report · regional readiness"
      tone={reportTone(tone)}
      hero={Math.round(score.value)}
      verdict={word}
      facts={facts}
      footer="RIM · SPACE WEATHER + NWS ACTIVE ALERTS"
      updated={`READ ${new Date(rimResult.updatedAt)
        .toISOString()
        .slice(11, 16)}Z`}
    >
      <div className={`hcr-bar ${tone}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, score.value))}%` }} />
      </div>
      <div className="hcr-cols">
        <div className="hcr-box">
          <h4>Sub-scores</h4>
          <dl className="hcr-kv">
            <dt>{rimResult.hfBand.label.toUpperCase()}</dt>
            <dd>{subScoreValue(rimResult.hfBand)}</dd>
            <dt>{rimResult.vhfUhf.label.toUpperCase()}</dt>
            <dd>{subScoreValue(rimResult.vhfUhf)}</dd>
            <dt>{rimResult.infraRisk.label.toUpperCase()}</dt>
            <dd>{subScoreValue(rimResult.infraRisk)}</dd>
          </dl>
        </div>
        <div className="hcr-box">
          <h4>Active alerts · {alerts.length}</h4>
          {alertError ? (
            <p className="hcr-note">NWS alert feed unreachable. Retrying.</p>
          ) : ranked.length === 0 ? (
            <p className="hcr-empty hc-good">ALL CLEAR</p>
          ) : (
            <div className="hcr-list">
              {ranked.slice(0, MAX_ALERTS).map((alert) => (
                <div
                  key={alert.id}
                  className={`hcr-item ${SEVERITY_TONE[alert.severity]}`}
                >
                  <b>
                    {alert.event} · {alert.severity}
                  </b>
                  <span>{alert.areaDesc}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WallReport>
  );
}
