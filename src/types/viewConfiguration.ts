/** Stable type-only entry point. Schema/factory modules never import live stores. */
export type {
  ViewConfiguration, ViewFamily, ViewPresentationPreferences, ViewOperatingContext,
  SavedView, PresetRecipe, SceneSnapshot, DisplayAssignment, WorkingViewPatch,
  SaveResult, ViewRepository, ViewBinding, ViewInteractionState, ViewRuntime, ViewJson,
} from "@/lib/views/contracts";
