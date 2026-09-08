import { Inline, ProvenanceBadge, Surface } from "propulse";

export function Sources() {
  return (
    <Surface>
      <Inline>
        <ProvenanceBadge source="measured" />
        <ProvenanceBadge source="manufacturer" />
        <ProvenanceBadge source="declared" />
        <ProvenanceBadge source="estimated" />
        <ProvenanceBadge source="unknown" />
      </Inline>
    </Surface>
  );
}
