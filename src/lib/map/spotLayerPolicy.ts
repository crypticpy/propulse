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

/** Shared visibility/interaction matrix for the 2D spot overlays. */
export function getSpotLayerPolicy(
  layers: SpotLayerFlags,
): SpotLayerPolicy {
  const pathsVisible = layers.spots || layers.spotTraces;
  return {
    pathsVisible,
    endpointsInteractive: pathsVisible,
    labelsInteractive: layers.spots,
    gridCollectionsInteractive: layers.gridActivity,
    selectedTargetVisible: true,
  };
}
