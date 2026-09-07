/** Strict decimal frequency input; unlabelled profile frequencies are MHz. */
export function parseFrequencyKHz(value: string): number {
  const match = /^(\d+(?:\.\d*)?|\.\d+)\s*(MHz|kHz|Hz)?$/i.exec(value.trim());
  if (!match) return NaN;
  const unit = (match[2] ?? "MHz").toLowerCase();
  const kHz = Number(match[1]) * (unit === "mhz" ? 1000 : unit === "hz" ? 0.001 : 1);
  return Number.isSafeInteger(Math.round(kHz * 1000)) && kHz > 0 ? kHz : NaN;
}
