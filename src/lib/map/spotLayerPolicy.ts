export interface SpotLayerFlags {
  spots: boolean;
  spotTraces: boolean;
  gridActivity: boolean;
  /** Activation pills/labels overlay. Defaults to `false` when omitted. */
  activations?: boolean;
}

export interface SpotLayerPolicy {
  pathsVisible: boolean;
  endpointsInteractive: boolean;
  labelsInteractive: boolean;
  gridCollectionsInteractive: boolean;
  /** A chosen target is navigation state, not a live-feed layer. */
  selectedTargetVisible: boolean;
  /** Retained grid-glow / activity canvas effects. */
  activityVisible: boolean;
  /** Activation pills/labels overlay and their buttons. */
  activationsVisible: boolean;
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
      activityVisible: false,
      activationsVisible: false,
    };
  }
  const pathsVisible = layers.spots || layers.spotTraces;
  return {
    pathsVisible,
    endpointsInteractive: pathsVisible,
    labelsInteractive: layers.spots,
    gridCollectionsInteractive: layers.gridActivity,
    selectedTargetVisible: true,
    activityVisible: layers.spots || layers.spotTraces || layers.gridActivity,
    activationsVisible: Boolean(layers.activations),
  };
}
