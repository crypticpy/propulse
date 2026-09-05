export interface SpotLayerFlags {
  spots: boolean;
  spotTraces: boolean;
  gridActivity: boolean;
}

export interface SpotLayerPolicy {
  pathsVisible: boolean;
  endpointsInteractive: boolean;
  labelsInteractive: boolean;
  gridCollectionsInteractive: boolean;
  /** A chosen target is navigation state, not a live-feed layer. */
  selectedTargetVisible: boolean;
}

export interface SpotLayerPolicyOptions {
  isolateTargetPath?: boolean;
  hasTarget?: boolean;
}

/** Shared visibility/interaction matrix for the 2D spot overlays. */
export function getSpotLayerPolicy(
  layers: SpotLayerFlags,
  options?: SpotLayerPolicyOptions,
): SpotLayerPolicy {
  if (options?.isolateTargetPath && options.hasTarget) {
    return {
      pathsVisible: false,
      endpointsInteractive: false,
      labelsInteractive: false,
      gridCollectionsInteractive: false,
      selectedTargetVisible: false,
    };
  }
  const pathsVisible = layers.spots || layers.spotTraces;
  return {
    pathsVisible,
    endpointsInteractive: pathsVisible,
    labelsInteractive: layers.spots,
    gridCollectionsInteractive: layers.gridActivity,
    selectedTargetVisible: true,
  };
}
