/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PROPAGATION_MODEL_URL?: string;
  readonly VITE_PROPAGATION_V4_MODE?:
    | "off" | "internal" | "released"
    | "shadow" | "active";
  readonly VITE_PROPAGATION_V4_ENABLED?: string;
  readonly VITE_PROPAGATION_RESEARCH_HEALTH_ENABLED?: string;
  readonly VITE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED?: string;
}
