import { FeedlineLossSparkline, Surface, Inline } from "propulse";

export function NoFeedlineData() {
  return (
    <Surface>
      <Inline className="items-center gap-3">
        <span className="text-sm text-su-muted">LMR-400, 30 m run</span>
        <FeedlineLossSparkline feedlineId="lmr400-preview" />
      </Inline>
    </Surface>
  );
}

export function Wide() {
  return (
    <Surface>
      <Inline className="items-center gap-3">
        <span className="text-sm text-su-muted">RG-8X, 15 m run</span>
        <FeedlineLossSparkline feedlineId="rg8x-preview" width={200} height={48} />
      </Inline>
    </Surface>
  );
}
