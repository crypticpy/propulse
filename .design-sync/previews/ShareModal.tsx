import { ShareModal } from "propulse";

export function PathShare() {
  return (
    <ShareModal
      isOpen
      onClose={() => {}}
      title="Share Propagation View"
      description="Globe view, 20 m path to VK6LC"
      state={{
        viewMode: "globe",
        target: { lat: -31.9, lon: 115.9, name: "VK6LC", grid: "OF78vs" },
        timeOffset: 3,
        layers: {
          terminator: true,
          greyline: true,
          aurora: false,
          muf: true,
          nvis: false,
          spots: true,
          nightLights: true,
          labels: true,
        },
        pathMode: "short",
      }}
    />
  );
}

export function SessionShare() {
  return (
    <ShareModal
      isOpen
      onClose={() => {}}
      state={{
        viewMode: "flat",
        target: null,
        timeOffset: 0,
        layers: {
          terminator: true,
          greyline: false,
          aurora: false,
          muf: false,
          nvis: false,
          spots: true,
          nightLights: false,
          labels: true,
        },
        pathMode: "short",
      }}
    />
  );
}
