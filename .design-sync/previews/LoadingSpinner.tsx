import { Inline, LoadingSpinner } from "propulse";

export function Sizes() {
  return (
    <Inline>
      <LoadingSpinner size="sm" />
      <LoadingSpinner size="md" />
      <LoadingSpinner size="lg" />
    </Inline>
  );
}

export function WithText() {
  return <LoadingSpinner size="md" text="Loading solar data…" />;
}
