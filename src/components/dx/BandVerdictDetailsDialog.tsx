/**
 * Shared Band Health details for Home and PropSphere.
 *
 * The evidence content originated in BandVerdictPanel (BH2/BH3). Keeping it
 * here gives both surfaces the same why-lines, canonical ladder provenance,
 * activity detail, lead-time aging, and recent flip history. AccessibleDialog
 * portals to document.body so parent card overflow and stacking contexts can
 * never place the evidence underneath neighboring dashboard widgets.
 */

import { format, formatDistanceToNow } from "date-fns";
import { AccessibleDialog } from "@/components/ui";
import type { BandActivityStatus } from "@/hooks/useBandActivity";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import type { CanonicalBandRow } from "@/lib/verdict/bestBand";
import {
  ACTIVITY_LABEL,
  ACTIVITY_TEXT_CLASSES,
  LADDER_LABEL,
  LADDER_TEXT_CLASSES,
  MODE_BADGE_LABEL,
  TREND_ARROW,
  formatLead,
  leadMinutes,
} from "@/lib/verdict/presentation";
import { useVerdictStore } from "@/stores/verdictStore";

interface BandVerdictDetailsDialogProps {
  entry: BandLadderEntry | null;
  activity?: BandActivityStatus;
  canonical?: CanonicalBandRow;
  scopeLabel?: string;
  onClose: () => void;
}

export function BandVerdictDetailsDialog({
  entry,
  activity,
  canonical,
  scopeLabel,
  onClose,
}: BandVerdictDetailsDialogProps) {
  const log = useVerdictStore((state) => state.log);
  if (!entry) return null;

  const recent = log
    .filter(
      (item) =>
        item.band === entry.band && item.scopeId === entry.result.scopeId,
    )
    .slice(0, 3);
  // A stale row's lead times are stale too (and a future-dated row clamps
  // to age 0), so never advertise them as a current prediction.
  const canonicalOpens =
    canonical && !canonical.stale
      ? leadMinutes(canonical, "opens_in_min")
      : null;
  const canonicalFades =
    canonical && !canonical.stale
      ? leadMinutes(canonical, "fades_in_min")
      : null;

  return (
    <AccessibleDialog
      open
      onClose={onClose}
      title={`${entry.band} band health`}
      description={`${scopeLabel ?? "Current scope"} · live physics and verified activity evidence`}
      size="md"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-lg font-semibold ${LADDER_TEXT_CLASSES[entry.stable]}`}
            >
              {LADDER_LABEL[entry.stable]}
            </span>
            {entry.fading && (
              <span className="rounded border border-caution-amber/30 bg-caution-amber/10 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-su-text">
                Fading
              </span>
            )}
            {entry.result.evaluation.surprise && (
              <span className="rounded border border-plasma-orange/30 bg-plasma-orange/10 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-su-text">
                Surprise
              </span>
            )}
          </div>
          <span className="font-mono text-xs text-su-text/80">
            {entry.result.inputs.obs20m} obs ·{" "}
            {entry.result.inputs.reporters20m} reporters
          </span>
        </div>

        <div className="rounded-xl border border-su-line/40 bg-su-line/10 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-su-text/80">
            Why this status
          </h3>
          <ul className="space-y-1.5">
            {entry.result.evaluation.why.map((line, index) => (
              <li key={index} className="text-sm leading-6 text-su-text/80">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-su-text/80">
            Stable since{" "}
            {formatDistanceToNow(new Date(entry.since), { addSuffix: true })}
          </p>
        </div>

        {canonical && (
          <section className="rounded-xl border border-su-line/40 bg-su-line/10 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-su-text/80">
              Server ladder
            </h3>
            <p className="text-sm text-su-text/80">
              <span className={LADDER_TEXT_CLASSES[canonical.state]}>
                {LADDER_LABEL[canonical.state]}
              </span>
              {canonical.stale && (
                <span className="ml-1.5 rounded border border-caution-amber/30 bg-caution-amber/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-su-text">
                  Stale
                </span>
              )}
              {canonical.surprise && (
                <span className="text-plasma-orange"> · surprise</span>
              )}
              {canonical.openedAt && (
                <span className="text-su-text/80">
                  {" "}· open{" "}
                  {formatDistanceToNow(new Date(canonical.openedAt), {
                    addSuffix: false,
                  })}
                </span>
              )}
            </p>
            {canonical.stale && (
              <p className="mt-1 text-xs text-su-muted">
                Last verdict{" "}
                {formatDistanceToNow(new Date(canonical.updatedAt), {
                  addSuffix: true,
                })}{" "}
                — the collector has stopped scoring this scope; treat as
                historical, not current.
              </p>
            )}
            {canonicalOpens !== null && (
              <p className="mt-1 text-sm text-su-text/80">
                Likely opens in ~{formatLead(canonicalOpens)}
                <span className="text-su-text/80"> · physics sweep</span>
              </p>
            )}
            {canonicalFades !== null && (
              <p className="mt-1 text-sm text-su-text/80">
                May fade in ~{formatLead(canonicalFades)}
                <span className="text-su-text/80"> · physics sweep</span>
              </p>
            )}
          </section>
        )}

        {activity && (
          <section className="rounded-xl border border-su-line/40 bg-su-line/10 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-su-text/80">
              Verified activity
            </h3>
            <p className="text-sm text-su-text/80">
              {activity.level ? (
                <span className={ACTIVITY_TEXT_CLASSES[activity.level]}>
                  {ACTIVITY_LABEL[activity.level]}
                </span>
              ) : (
                <span className="text-su-text/80">No baseline yet</span>
              )}{" "}
              <span aria-hidden="true">{TREND_ARROW[activity.trend]}</span>{" "}
              {activity.trend}
            </p>
            <p className="mt-1 font-mono text-sm text-su-text/80">
              {activity.count60m} spots/hr · {activity.obs20m} obs ·{" "}
              {activity.reporters20m} reporters (20 min)
            </p>
            {Object.keys(activity.modeObs20m).length > 0 && (
              <p className="mt-1 font-mono text-xs text-su-text/80">
                {Object.entries(activity.modeObs20m)
                  .filter(([, count]) => count > 0)
                  .map(
                    ([mode, count]) =>
                      `${MODE_BADGE_LABEL[mode] ?? mode} ${count}`,
                  )
                  .join(" · ")}
              </p>
            )}
            {Object.keys(activity.sourceCounts60m).length > 0 && (
              <p className="mt-1 font-mono text-xs text-su-text/80">
                via{" "}
                {Object.entries(activity.sourceCounts60m)
                  .filter(([, count]) => count > 0)
                  .map(([source, count]) => `${source} ${count}`)
                  .join(" · ")}
              </p>
            )}
            {activity.level && activity.thresholds && (
              <p className="mt-1 font-mono text-xs text-su-text/80">
                vs this hour: p25 {Math.round(activity.thresholds.p25)} · p75{" "}
                {Math.round(activity.thresholds.p75)} · p95{" "}
                {Math.round(activity.thresholds.p95)}
              </p>
            )}
          </section>
        )}

        {recent.length > 0 && (
          <section className="rounded-xl border border-su-line/40 bg-su-line/10 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-su-text/80">
              Recent changes
            </h3>
            <ul className="space-y-1">
              {recent.map((item) => (
                <li key={item.id} className="font-mono text-sm text-su-text/80">
                  {format(new Date(item.at), "HH:mm")} {LADDER_LABEL[item.from]} →{" "}
                  {LADDER_LABEL[item.to]}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AccessibleDialog>
  );
}
