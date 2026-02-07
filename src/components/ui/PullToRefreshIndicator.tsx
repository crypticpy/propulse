/**
 * PullToRefreshIndicator - Visual indicator shown during pull-to-refresh gesture.
 *
 * Renders a small spinner/progress indicator at the top of the scroll area
 * that animates based on pullProgress (0-1) and shows a spinning animation
 * while isRefreshing is true.
 */
export interface PullToRefreshIndicatorProps {
  pullProgress: number;
  isRefreshing: boolean;
}

export function PullToRefreshIndicator({
  pullProgress,
  isRefreshing,
}: PullToRefreshIndicatorProps) {
  if (pullProgress <= 0 && !isRefreshing) {
    return null;
  }

  const translateY = isRefreshing ? 0 : (pullProgress - 1) * 40;
  const opacity = isRefreshing ? 1 : Math.min(pullProgress * 1.5, 1);
  const scale = isRefreshing ? 1 : 0.5 + pullProgress * 0.5;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
      style={{ height: isRefreshing ? 48 : pullProgress * 48 }}
      role={isRefreshing ? "status" : undefined}
      aria-label={isRefreshing ? "Refreshing" : undefined}
    >
      <div
        className="flex items-center gap-2"
        style={{
          transform: `translateY(${translateY}px) scale(${scale})`,
          opacity,
        }}
      >
        <div
          className={`w-5 h-5 rounded-full border-2 border-nebula-blue border-t-plasma-orange ${
            isRefreshing || pullProgress >= 1 ? "animate-spin" : ""
          }`}
          style={
            !isRefreshing && pullProgress < 1
              ? { transform: `rotate(${pullProgress * 360}deg)` }
              : undefined
          }
        />
        {isRefreshing && (
          <span className="text-xs text-gray-400">Refreshing...</span>
        )}
      </div>
    </div>
  );
}
