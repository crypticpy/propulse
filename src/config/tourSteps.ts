/**
 * Onboarding Tour Steps Configuration
 *
 * Defines the step-by-step tour of PropSphere's main features.
 * Each step targets a specific UI element and provides an explanation.
 */

import type { TourStep } from "@/hooks/useOnboardingTour";

export const PROPSPHERE_TOUR_STEPS: TourStep[] = [
  // Step 1: Welcome
  {
    id: "welcome",
    title: "Welcome to PropSphere!",
    content:
      "PropSphere is your command center for radio propagation analysis. Let's take a quick tour of the main features to help you get started.",
    isModal: true,
  },

  // Step 2: Globe View
  {
    id: "globe-view",
    title: "Interactive Globe",
    content:
      "This 3D globe shows the Earth with real-time day/night visualization. Click and drag to rotate, scroll to zoom. Click anywhere on the globe to set it as your target location for path analysis.",
    target: "globe-container",
    position: "left",
  },

  // Step 3: View Mode Tabs
  {
    id: "view-modes",
    title: "Map View Modes",
    content:
      "Switch between 3D Globe, 2D Flat Map, and Azimuthal projections. The Azimuthal view is especially useful for beam heading calculations - it shows true bearings from your location.",
    target: "view-mode-tabs",
    position: "bottom",
  },

  // Step 4: Layer Controls
  {
    id: "layer-controls",
    title: "Map Layers",
    content:
      "Toggle different overlays: Day/Night terminator, Greyline enhancement zones, Aurora activity, MUF (Maximum Usable Frequency) contours, and live DX spots. Use presets for quick configuration.",
    target: "layer-controls",
    position: "bottom",
  },

  // Step 5: Time Machine
  {
    id: "time-machine",
    title: "Time Machine",
    content:
      "Simulate propagation conditions at different times. Use the slider to look up to 24 hours into the future or past. Great for planning your operating schedule!",
    target: "time-control",
    position: "bottom",
  },

  // Step 6: Band Conditions Panel
  {
    id: "band-conditions",
    title: "Band Conditions",
    content:
      "Real-time propagation estimates for each amateur band. Shows signal strength predictions, recommended modes, and current band status based on solar conditions and your selected path.",
    target: "band-conditions-panel",
    position: "right",
  },

  // Step 7: Path Analysis
  {
    id: "path-analysis",
    title: "Path Analysis",
    content:
      "Detailed information about the radio path to your target: distance, beam headings, MUF/LUF frequencies, and hop count. Compare short path vs long path options.",
    target: "path-analysis-panel",
    position: "left",
  },

  // Step 8: DX Spot List
  {
    id: "dx-spots",
    title: "Live DX Spots",
    content:
      "Real-time spots from PSKReporter, RBN, and DX clusters. Filter by band, mode, or search for specific callsigns. Click any spot to see the path to that station.",
    target: "dx-spot-list",
    position: "top",
  },

  // Step 9: Quick Targets / Pins
  {
    id: "quick-targets",
    title: "Quick Targets & Pins",
    content:
      "Save your favorite locations for quick access. Use keyboard shortcut 'P' when a target is selected to add a pin, or manage pins from the settings menu.",
    target: "operator-profile",
    position: "bottom",
  },

  // Step 10: Settings & Customization
  {
    id: "settings",
    title: "Settings & Customization",
    content:
      "Set your callsign and QTH location in Settings (gear icon in the header). You can also customize the interface, enable keyboard shortcuts (press '?' to see them all), and more.",
    target: "settings-button",
    position: "bottom-left",
  },

  // Step 11: Completion
  {
    id: "complete",
    title: "You're All Set!",
    content:
      "That's the basics! Remember: you can restart this tour anytime from the Help menu. Press '?' to see all keyboard shortcuts. Happy DXing!",
    isModal: true,
  },
];

/**
 * Get tour steps filtered for current view mode
 * Some steps may not be applicable depending on the user's setup
 */
export function getTourSteps(): TourStep[] {
  return PROPSPHERE_TOUR_STEPS;
}

export default PROPSPHERE_TOUR_STEPS;
