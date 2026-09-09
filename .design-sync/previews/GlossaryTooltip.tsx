import { GlossaryTooltip, Inline } from "propulse";

// GlossaryTooltip's popover is internal hover/focus state with no prop to
// force it open. This card shows the trigger terms only. See learnings.
export function Terms() {
  return (
    <Inline>
      <span className="text-sm text-su-text">
        Work a new <GlossaryTooltip term="cq-zone">CQ zone</GlossaryTooltip> for
        the <GlossaryTooltip term="multiplier">multiplier</GlossaryTooltip>.
      </span>
    </Inline>
  );
}
