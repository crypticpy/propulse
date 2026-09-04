import { Canvas } from "@react-three/fiber";
import {
  GlobeControls,
  TilesAttributionOverlay,
  TilesPlugin,
  TilesRenderer,
} from "3d-tiles-renderer/r3f";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";

interface PhotorealisticGoogleTilesProps {
  apiKey: string;
  errorTarget: number;
  pixelRatio: number;
  onRootLoadError: () => void;
}

/** Isolated Google 3D Tiles canvas so a missing key never blocks the page chunk. */
export default function PhotorealisticGoogleTiles({
  apiKey,
  errorTarget,
  pixelRatio,
  onRootLoadError,
}: PhotorealisticGoogleTilesProps) {
  return (
    <Canvas
      dpr={[1, pixelRatio]}
      camera={{ position: [0, 0, 1e8], near: 1, far: 1e10 }}
    >
      <TilesRenderer
        key={apiKey}
        errorTarget={errorTarget}
        onLoadError={(event) => {
          if (event.tile === null) onRootLoadError();
        }}
      >
        <TilesPlugin
          plugin={GoogleCloudAuthPlugin}
          args={[
            {
              apiToken: apiKey,
              autoRefreshToken: true,
              useRecommendedSettings: false,
            },
          ]}
        />
        <GlobeControls />
        <TilesAttributionOverlay
          style={{
            left: "auto",
            right: 0,
            zIndex: 10,
            maxWidth: "calc(100vw - 145px)",
            textAlign: "right",
            background: "rgba(0, 0, 0, 0.55)",
          }}
        />
      </TilesRenderer>
    </Canvas>
  );
}
