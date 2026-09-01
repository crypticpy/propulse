export const MAP_TOOLBAR_BREAKPOINTS = {
  overflowMenu: 1440,
  iconOnly: 960,
  stacked: 760,
} as const;

export interface MapToolbarLayout {
  iconOnly: boolean;
  stacked: boolean;
  useOverflowMenu: boolean;
}

export function getMapToolbarLayout(width: number): MapToolbarLayout {
  return {
    iconOnly: width < MAP_TOOLBAR_BREAKPOINTS.iconOnly,
    stacked: width < MAP_TOOLBAR_BREAKPOINTS.stacked,
    useOverflowMenu: width < MAP_TOOLBAR_BREAKPOINTS.overflowMenu,
  };
}
