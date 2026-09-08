import { PullToRefreshIndicator, Surface } from "propulse";

export function Pulling() {
  return (
    <Surface className="w-full max-w-sm">
      <PullToRefreshIndicator pullProgress={0.6} isRefreshing={false} />
    </Surface>
  );
}

export function Refreshing() {
  return (
    <Surface className="w-full max-w-sm">
      <PullToRefreshIndicator pullProgress={1} isRefreshing />
    </Surface>
  );
}
