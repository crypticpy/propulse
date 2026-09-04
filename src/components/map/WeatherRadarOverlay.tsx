/**
 * WeatherRadarOverlay Component
 *
 * Renders animated RainViewer precipitation radar on the 3D globe, with
 * optional IEM NEXRAD composited over CONUS for past frames. Frame baking
 * lives in `radarComposite` / `radarBudget` (zoom-3 / 2048² equirect).
 */

import React, {
  useRef,
  useMemo,
  useEffect,
  useState,
  useCallback,
} from "react";
import * as THREE from "three";
import type { RadarManifest } from "@/lib/api/radar";
import { getAllRadarFrames } from "@/lib/api/radar";
import {
  RADAR_TEXTURE_BUDGET,
  selectInitialRadarFrameIndex,
} from "@/lib/map/radarBudget";
import { compositeRadarTilesForFrame } from "@/lib/map/radarComposite";
import {
  GLOBE_LAYER_ORDER,
  GLOBE_OVERLAY_MATERIAL,
} from "@/lib/map/globeRenderOrder";

/** Radar animation control state, exported for scrubber UI */
export interface RadarAnimationState {
  frameCount: number;
  activeIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  timestamps: number[];
  isNowcast: boolean[];
  hasNexrad: boolean;
  setFrame: (idx: number) => void;
  togglePlay: () => void;
}

interface WeatherRadarOverlayProps {
  manifest: RadarManifest;
  onAnimationState?: (state: RadarAnimationState) => void;
}

/** Load one frame at a time to avoid hammering the API */
const FRAME_BATCH_SIZE = 1;
const MAX_FRAMES = RADAR_TEXTURE_BUDGET.maxFrames;

function getLoadedFrameIndices(
  frames: ReadonlyMap<number, THREE.Texture>,
): number[] {
  return Array.from(frames.keys()).sort((a, b) => a - b);
}

function WeatherRadarOverlayInner({
  manifest,
  onAnimationState,
}: WeatherRadarOverlayProps) {
  const framesRef = useRef<Map<number, THREE.CanvasTexture>>(new Map());
  const nexradFramesRef = useRef<Set<number>>(new Set());
  const [loadedVersion, setLoadedVersion] = useState(0);
  const [activeFrameIndex, setActiveFrameIndex] = useState(-1);
  const activeFrameRef = useRef(activeFrameIndex);
  activeFrameRef.current = activeFrameIndex;
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  const allFrames = useMemo(() => getAllRadarFrames(manifest), [manifest]);
  const pastCount = manifest.radar.past.length;

  const framesToLoad = useMemo(() => {
    if (allFrames.length <= MAX_FRAMES) return allFrames.map((_, i) => i);
    const startIdx = allFrames.length - MAX_FRAMES;
    return Array.from({ length: MAX_FRAMES }, (_, i) => startIdx + i);
  }, [allFrames]);

  const setFrame = useCallback((displayIndex: number) => {
    const loadedIndices = getLoadedFrameIndices(framesRef.current);
    const sourceIndex = loadedIndices[displayIndex];
    if (sourceIndex === undefined) return;
    setActiveFrameIndex(sourceIndex);
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const map = new Map<number, THREE.CanvasTexture>();
    framesRef.current = map;
    nexradFramesRef.current = new Set();
    setLoadedVersion(0);
    setActiveFrameIndex(-1);
    setIsLoading(true);

    const loadFrame = async (
      idx: number,
    ): Promise<THREE.CanvasTexture | null> => {
      if (cancelled) return null;
      const frame = allFrames[idx];
      if (!frame) return null;

      const isNowcast = idx >= pastCount;
      try {
        const { canvas, hasNexrad } = await compositeRadarTilesForFrame(
          manifest,
          frame,
          !isNowcast,
        );
        if (cancelled) return null;

        if (hasNexrad) {
          nexradFramesRef.current.add(idx);
        } else {
          nexradFramesRef.current.delete(idx);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        // Linear minify keeps distant soft; Linear mag avoids blocky cells when
        // zoomed. Source tiles are now unsmoothed (`0_1`) so edges stay sharper.
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;

        map.set(idx, tex);
        setLoadedVersion((v) => v + 1);
        return tex;
      } catch (err) {
        console.warn(
          `[WeatherRadarOverlay] Skipping frame ${frame.time}:`,
          err,
        );
        return null;
      }
    };

    const latestIdx = selectInitialRadarFrameIndex(framesToLoad, pastCount);
    if (latestIdx === undefined) {
      setIsLoading(false);
      return;
    }

    const loadOrder = [
      latestIdx,
      ...framesToLoad.filter((index) => index !== latestIdx),
    ];
    const loadSequentially = async () => {
      let displayedFrame = false;
      for (let i = 0; i < loadOrder.length; i += FRAME_BATCH_SIZE) {
        if (cancelled) return;
        const batch = loadOrder.slice(i, i + FRAME_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((index) => loadFrame(index)),
        );

        if (!displayedFrame) {
          const firstLoaded = results.find(
            (result): result is PromiseFulfilledResult<THREE.CanvasTexture> =>
              result.status === "fulfilled" && result.value !== null,
          );
          if (firstLoaded && !cancelled) {
            const sourceIndex = batch[results.indexOf(firstLoaded)];
            setActiveFrameIndex(sourceIndex);
            setIsLoading(false);
            displayedFrame = true;
          }
        }

        if (!cancelled && i + FRAME_BATCH_SIZE < loadOrder.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!cancelled && !displayedFrame) setIsLoading(false);
    };

    void loadSequentially();

    return () => {
      cancelled = true;
      map.forEach((tex) => tex.dispose());
      map.clear();
    };
  }, [manifest, allFrames, pastCount, framesToLoad]);

  const hasAnimationFrames = framesRef.current.size >= 2;

  useEffect(() => {
    if (!isPlaying || activeFrameRef.current < 0) return;
    if (!hasAnimationFrames) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let stopped = false;

    const advance = () => {
      if (stopped) return;

      setActiveFrameIndex((prev) => {
        const frameMap = framesRef.current;
        if (frameMap.size < 2) return prev;

        const loadedIndices = getLoadedFrameIndices(frameMap);
        const currentPos = loadedIndices.indexOf(prev);
        const nextPos = (currentPos + 1) % loadedIndices.length;
        const next = loadedIndices[nextPos];

        const isLatest = next === pastCount - 1;
        if (!stopped) {
          timeoutId = setTimeout(advance, isLatest ? 2000 : 500);
        }
        return next;
      });
    };

    timeoutId = setTimeout(advance, 500);
    return () => {
      stopped = true;
      clearTimeout(timeoutId);
    };
  }, [isPlaying, pastCount, hasAnimationFrames]);

  useEffect(() => {
    const mat = materialRef.current;
    const tex = framesRef.current.get(activeFrameIndex);
    if (mat && tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }, [activeFrameIndex, loadedVersion]);

  useEffect(() => {
    const loadedIndices = getLoadedFrameIndices(framesRef.current);
    onAnimationState?.({
      frameCount: loadedIndices.length,
      activeIndex: loadedIndices.indexOf(activeFrameIndex),
      isPlaying,
      isLoading,
      timestamps: loadedIndices.map((index) => allFrames[index].time),
      isNowcast: loadedIndices.map((index) => index >= pastCount),
      hasNexrad: nexradFramesRef.current.has(activeFrameIndex),
      setFrame,
      togglePlay,
    });
  }, [
    allFrames,
    activeFrameIndex,
    isPlaying,
    isLoading,
    pastCount,
    onAnimationState,
    setFrame,
    togglePlay,
    loadedVersion,
  ]);

  const geometry = useMemo(
    () => new THREE.SphereGeometry(1.007, 128, 64),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (activeFrameIndex < 0 || !framesRef.current.has(activeFrameIndex))
    return null;

  return (
    <mesh geometry={geometry} renderOrder={GLOBE_LAYER_ORDER.surfaceTexture}>
      <meshBasicMaterial
        ref={materialRef}
        opacity={0.85}
        blending={THREE.NormalBlending}
        side={THREE.FrontSide}
        map={framesRef.current.get(activeFrameIndex) ?? null}
        {...GLOBE_OVERLAY_MATERIAL}
      />
    </mesh>
  );
}

export const WeatherRadarOverlay = React.memo(
  WeatherRadarOverlayInner,
  (prev, next) =>
    prev.manifest === next.manifest &&
    prev.onAnimationState === next.onAnimationState,
);
