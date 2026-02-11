/**
 * SubscriptionSection — Subscription management for Settings page.
 *
 * Shows current plan status, feature comparison (free vs pro),
 * and actions to upgrade or manage billing via Stripe.
 */

import { useSubscription } from "@/hooks/useSubscription";

// ─── Feature comparison data ─────────────────────────────────────────────────

interface FeatureRow {
  label: string;
  free: string;
  pro: string;
}

const FEATURE_ROWS: FeatureRow[] = [
  { label: "Cloud Sync (logbook, settings, watches)", free: "No", pro: "Yes" },
  { label: "Custom Profile Images & Gear Photos", free: "No", pro: "Yes" },
  { label: "Per-User Propagation Modeling", free: "No", pro: "Yes" },
  {
    label: "Spot Replay & Extended History",
    free: "7 days local",
    pro: "30 days",
  },
  { label: "Contest Watch Presets", free: "No", pro: "Yes" },
  { label: "Saved Watch Presets", free: "5", pro: "20" },
  { label: "Arc Density Limit", free: "100", pro: "200" },
];

// ─── Icons ───────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-signal-green flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      className="w-4 h-4 text-gray-600 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPeriodEnd(iso: string | null): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FeatureComparisonTable() {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_72px_72px] gap-2 px-4 py-3 bg-white/5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        <span>Feature</span>
        <span className="text-center">Free</span>
        <span className="text-center text-plasma-orange">Pro</span>
      </div>

      {/* Rows */}
      {FEATURE_ROWS.map((row, i) => (
        <div
          key={row.label}
          className={`grid grid-cols-[1fr_72px_72px] gap-2 px-4 py-2.5 text-sm items-center ${
            i % 2 === 0 ? "bg-white/[0.02]" : ""
          }`}
        >
          <span className="text-gray-300">{row.label}</span>

          {/* Free column */}
          <span className="flex items-center justify-center">
            {row.free === "No" ? (
              <CrossIcon />
            ) : (
              <span className="text-xs text-gray-500">{row.free}</span>
            )}
          </span>

          {/* Pro column */}
          <span className="flex items-center justify-center">
            {row.pro === "Yes" ? (
              <CheckIcon />
            ) : (
              <span className="text-xs text-plasma-orange font-medium">
                {row.pro}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function PastDueBanner({
  onManage,
  isLoading,
}: {
  onManage: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="p-4 bg-caution-amber/10 border border-caution-amber/30 rounded-xl space-y-3">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-caution-amber flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-caution-amber">
            Payment issue
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Update your payment method to keep Pro features active.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onManage}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                   bg-caution-amber/20 text-caution-amber hover:bg-caution-amber/30
                   border border-caution-amber/30 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? <SpinnerIcon /> : null}
        {isLoading ? "Redirecting..." : "Update Payment Method"}
      </button>
    </div>
  );
}

// ─── Free Tier View ──────────────────────────────────────────────────────────

function FreeTierView({
  onUpgrade,
  isLoading,
  error,
}: {
  onUpgrade: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Current plan indicator */}
      <div className="flex items-center gap-3">
        <div className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-sm font-medium text-gray-300">
          Free Plan
        </div>
      </div>

      {/* Feature comparison */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Plan Comparison
        </h3>
        <FeatureComparisonTable />
      </div>

      {/* Upgrade CTA */}
      <button
        type="button"
        onClick={onUpgrade}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold
                   bg-plasma-orange text-white hover:bg-plasma-orange/90
                   transition-colors shadow-lg shadow-plasma-orange/20
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? <SpinnerIcon /> : null}
        {isLoading ? "Redirecting..." : "Upgrade to Pro \u2014 $6.99/mo"}
      </button>

      {error && <p className="text-xs text-alert-red">{error}</p>}
    </div>
  );
}

// ─── Pro Tier View ───────────────────────────────────────────────────────────

function ProTierView({
  status,
  periodEnd,
  isPastDue,
  onManage,
  isLoading,
  error,
}: {
  status: string;
  periodEnd: string | null;
  isPastDue: boolean;
  onManage: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Past due warning */}
      {isPastDue && <PastDueBanner onManage={onManage} isLoading={isLoading} />}

      {/* Plan badge + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-plasma-orange/20 border border-plasma-orange/30 text-sm font-semibold text-plasma-orange shadow-[0_0_12px_rgba(255,140,50,0.15)]">
            Pro
          </div>
          {!isPastDue && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-signal-green" />
              <span className="text-sm text-signal-green font-medium capitalize">
                {status === "trialing" ? "Trial" : "Active"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Renewal info */}
      {periodEnd && !isPastDue && (
        <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
          <p className="text-sm text-gray-400">
            {status === "canceled" ? "Access until" : "Renews"}{" "}
            <span className="text-gray-200 font-medium">
              {formatPeriodEnd(periodEnd)}
            </span>
          </p>
        </div>
      )}

      {/* Feature list */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Unlocked Features
        </h3>
        <div className="space-y-2">
          {FEATURE_ROWS.map((row) => (
            <div key={row.label} className="flex items-center gap-2.5">
              <CheckIcon />
              <span className="text-sm text-gray-300">{row.label}</span>
              {row.pro !== "Yes" && (
                <span className="text-xs text-plasma-orange font-medium ml-auto">
                  {row.pro}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Manage subscription */}
      {!isPastDue && (
        <button
          type="button"
          onClick={onManage}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-white/5 border border-white/10 text-gray-300
                     hover:bg-white/10 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? <SpinnerIcon /> : null}
          {isLoading ? "Redirecting..." : "Manage Subscription"}
        </button>
      )}

      {error && <p className="text-xs text-alert-red">{error}</p>}
    </div>
  );
}

// ─── Main Section ────────────────────────────────────────────────────────────

export function SubscriptionSection() {
  const {
    isPro,
    isLoading,
    error,
    status,
    periodEnd,
    isPastDue,
    upgrade,
    manageSubscription,
  } = useSubscription();

  if (isPro) {
    return (
      <ProTierView
        status={status}
        periodEnd={periodEnd}
        isPastDue={isPastDue}
        onManage={manageSubscription}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  return (
    <FreeTierView onUpgrade={upgrade} isLoading={isLoading} error={error} />
  );
}
