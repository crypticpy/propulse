import { HelpModal } from "propulse";

export function GlobeHelp() {
  return (
    <HelpModal
      isOpen
      onClose={() => {}}
      title="3D Globe View"
      sections={[
        {
          title: "What it shows",
          content:
            "An interactive 3D globe showing the Earth with day/night regions (terminator), aurora activity, MUF contours, and live DX spot paths.",
        },
        {
          title: "How to use",
          content:
            "• Click and drag to rotate the globe\n• Scroll to zoom in/out\n• Click any location to set it as your target\n• Use the layer toggles to show/hide overlays",
        },
        {
          title: "What the overlays mean",
          content:
            "• Greyline: The dawn/dusk transition zone - excellent for propagation\n• Aurora: Northern lights activity affecting HF signals\n• MUF: Maximum Usable Frequency contours\n• Spots: Live DX spots from PSKReporter and RBN",
        },
      ]}
    />
  );
}

export function BandConditionsHelp() {
  return (
    <HelpModal
      isOpen
      onClose={() => {}}
      title="Band Conditions Panel"
      sections={[
        {
          title: "What it shows",
          content:
            "Real-time propagation estimates for each amateur HF band based on current solar conditions (SFI, K-index) and the path to your selected target.",
        },
        {
          title: "Understanding the data",
          content:
            "• S-Meter: Estimated signal strength (S1-S9+30dB)\n• SNR: Signal-to-noise ratio in dB\n• Status: excellent/good/fair/poor/closed\n• Best For: Recommended operating modes",
        },
      ]}
    />
  );
}
