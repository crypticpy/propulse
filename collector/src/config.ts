import type { CollectorConfig } from "./types.js";

export function loadConfig(): CollectorConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const sourcesRaw =
    process.env.COLLECTOR_ENABLED_SOURCES || "pskreporter,rbn,dxcluster,solar";

  return {
    supabaseUrl,
    supabaseServiceKey,
    logLevel:
      (process.env.COLLECTOR_LOG_LEVEL as CollectorConfig["logLevel"]) ||
      "info",
    enabledSources: new Set(sourcesRaw.split(",").map((s) => s.trim())),
    healthPort: parseInt(process.env.PORT || "8080", 10),
  };
}
