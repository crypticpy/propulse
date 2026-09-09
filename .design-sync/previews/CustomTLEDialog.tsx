import { useEffect } from "react";
import { CustomTLEDialog } from "propulse";

const SAMPLE_TLE = [
  "ISS (ZARYA)",
  "1 25544U 98067A   24020.54842296  .00011842  00000+0  21418-3 0  9994",
  "2 25544  51.6412 290.4332 0004460  43.4590  51.3729 15.49594862437036",
].join("\n");

/**
 * Simulate pasting TLE text into the textarea (the same native-value-setter
 * dispatch React Testing Library uses for typing) so the detected-satellite
 * preview list renders — the component has no prop to seed that state.
 */
function pasteSampleTLE() {
  const textarea = document.getElementById(
    "tle-input",
  ) as HTMLTextAreaElement | null;
  if (!textarea) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, SAMPLE_TLE);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function Empty() {
  return <CustomTLEDialog isOpen onClose={() => {}} />;
}

export function WithPreview() {
  useEffect(() => {
    pasteSampleTLE();
  }, []);
  return <CustomTLEDialog isOpen onClose={() => {}} />;
}
