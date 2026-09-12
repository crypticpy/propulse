/**
 * Bridge connection status dot. BridgeInfoPage rendered this at `w-3 h-3`;
 * SetupGuidePage rendered an equivalent dot (via its own `StatusDot`) at
 * `w-2.5 h-2.5`. Both are preserved via `size`, defaulting to
 * BridgeInfoPage's `"md"` — SetupGuidePage passes `size="sm"` to keep its
 * existing look (#1097).
 */
export type ConnectionDotSize = "sm" | "md";

const SIZE_CLASSES: Record<ConnectionDotSize, string> = {
  md: "w-3 h-3",
  sm: "w-2.5 h-2.5",
};

export function ConnectionDot({
  state,
  size = "md",
}: {
  state: string;
  size?: ConnectionDotSize;
}) {
  const dotClass = (() => {
    switch (state) {
      case "connected":
        return "bg-signal-green shadow-[0_0_10px_theme(colors.signal-green)]";
      case "connecting":
        return "bg-plasma-orange animate-pulse";
      case "error":
        return "bg-alert-red animate-[pulse_2s_ease-in-out_infinite]";
      case "disconnected":
      default:
        return "bg-su-line";
    }
  })();

  return (
    <span
      className={`inline-block ${SIZE_CLASSES[size]} rounded-full shrink-0 ${dotClass}`}
      aria-hidden="true"
    />
  );
}
