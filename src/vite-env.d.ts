/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_CARTO_BASEMAPS_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PROPAGATION_MODEL_URL?: string;
  readonly VITE_PROPAGATION_V4_MODE?:
    | "off" | "internal" | "released"
    | "shadow" | "active";
  readonly VITE_PROPAGATION_V4_ENABLED?: string;
  readonly VITE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED?: string;
  readonly VITE_SPOT_HISTORY_REALTIME_TABLE?:
    | "spot_history"
    | "spot_history_partitioned_v1";
  readonly VITE_GOOGLE_PHOTOREALISTIC_3D_ENABLED?: string;
  readonly VITE_GOOGLE_PHOTOREALISTIC_MAX_DPR?: string;
}
