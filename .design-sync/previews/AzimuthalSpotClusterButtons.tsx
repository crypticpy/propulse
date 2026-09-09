import { AzimuthalSpotClusterButtons, Surface } from "propulse";

function candidate(dx: string, lat: number, lon: number) {
  return {
    dxLat: lat,
    dxLon: lon,
    originalSpot: {
      id: `spot-${dx}`,
      spotter: "W1AW",
      dx,
      frequency: 14074,
      mode: "FT8",
      comment: "",
      time: new Date(),
      band: "20m",
      source: "PSKReporter" as const,
    },
  };
}

function AzimuthalCrop({ children }: { children: React.ReactNode }) {
  return (
    <Surface
      style={{
        position: "relative",
        width: 360,
        height: 220,
        overflow: "hidden",
        backgroundColor: "#070a12",
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.08), transparent 65%)",
      }}
    >
      {children}
    </Surface>
  );
}

export function Idle() {
  return (
    <AzimuthalCrop>
      <AzimuthalSpotClusterButtons
        clusters={[
          {
            key: "eu-cluster",
            x: 130,
            y: 70,
            left: 130,
            top: 70,
            width: 26,
            height: 26,
            members: [
              candidate("DL2ABC", 51.5, 7.0),
              candidate("G4XYZ", 51.5, -0.1),
              candidate("F5ABC", 48.9, 2.3),
            ],
          },
          {
            key: "ja-cluster",
            x: 260,
            y: 110,
            left: 260,
            top: 110,
            width: 30,
            height: 30,
            members: [
              candidate("JA1XYZ", 35.7, 139.7),
              candidate("JA3ABC", 34.7, 135.5),
              candidate("JH2DEF", 35.2, 136.9),
              candidate("JR6GHI", 26.2, 127.7),
              candidate("JA6JKL", 31.6, 130.6),
              candidate("JH8MNO", 43.1, 141.3),
              candidate("JA7PQR", 38.3, 140.9),
            ],
          },
          {
            key: "vk-cluster",
            x: 70,
            top: 170,
            left: 70,
            y: 170,
            width: 22,
            height: 22,
            members: [candidate("VK6LC", -32.0, 115.9), candidate("VK3ABC", -37.8, 144.9)],
          },
        ]}
        onOpen={() => {}}
      />
    </AzimuthalCrop>
  );
}

export function DenseCluster() {
  return (
    <AzimuthalCrop>
      <AzimuthalSpotClusterButtons
        clusters={[
          {
            key: "dense-eu",
            x: 180,
            y: 100,
            left: 180,
            top: 100,
            width: 34,
            height: 34,
            members: Array.from({ length: 14 }, (_, i) =>
              candidate(`DL${i}ABC`, 51 + i * 0.1, 7 + i * 0.1),
            ),
          },
        ]}
        onOpen={() => {}}
      />
    </AzimuthalCrop>
  );
}
