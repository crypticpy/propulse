import type { PropagationPrediction } from "./modelClient";

/**
 * Human-readable model diagnostics.
 *
 * The service returns stable machine identifiers for telemetry and tests. They
 * are intentionally preserved on the wire, but exposing underscore-delimited
 * identifiers in operator UI made the model's physics profile look like a
 * model crash. Keep the technical contract separate from its concise
 * explanation.
 */
const FLAG_LABELS: Record<string, string> = {
  missing_features: "Some model inputs are unavailable",
  recent_network_stale_physics_fallback:
    "Recent path history is stale or unavailable; served by the physics profile",
};

export function predictionIssueLabels(
  prediction: Pick<PropagationPrediction, "ood_flags">,
): string[] {
  return prediction.ood_flags.map(
    (flag) => FLAG_LABELS[flag] ?? flag.replace(/_/g, " "),
  );
}

const UNSUPPORTED_REASONS: ReadonlyArray<[code: string, reason: string]> = [
  ["radio_missing", "chain radio is not in your inventory"],
  ["antenna_missing", "chain antenna is not in your inventory"],
  ["accessory_missing", "a chain accessory is not in your inventory"],
  ["feedline_missing", "chain feedline is not in your inventory"],
  ["inline_component_missing", "an inline component is not in your inventory"],
  ["radio_band_unsupported", "radio does not declare this band"],
  ["antenna_band_unsupported", "antenna does not declare this band"],
  ["accessory_band_unsupported", "an accessory does not declare this band"],
];

/** Names the chain part that blocks this band so the operator can fix it. */
export function unsupportedChainReason(warningCodes: readonly string[]): string {
  const match = UNSUPPORTED_REASONS.find(([code]) => warningCodes.includes(code));
  return match
    ? `Chain unsupported: ${match[1]}`
    : "Chain unsupported on this band";
}
