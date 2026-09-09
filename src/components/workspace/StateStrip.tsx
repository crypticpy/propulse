/**
 * Shared operating-state strip: session · band · target. Static for this PR
 * — it reads nothing yet, since the shared operating-state store (#658) does
 * not exist. Present now so the shell's footer layout does not shift once
 * #658 wires it up.
 */
export function StateStrip() {
  return (
    <div className="su-surface su-inline workspace-state-strip" aria-label="Shared operating state">
      <span className="su-hint">SESSION —</span>
      <span className="su-hint">BAND —</span>
      <span className="su-hint">TARGET —</span>
    </div>
  );
}
