import { z } from "zod";
import { normalizeMode } from "../../spots/presentation/modes";
import type { PresetRecipe, ViewConfiguration } from "../contracts";
import { contractIdSchema } from "../spotContracts";
import { recipesFromLegacyOperatingProfile } from "../presets";

// Validate the legacy identity and filters before handing explicit captured data
// to the accepted recipe adapter. Its final recipe schema validates presentation.
const profileSchema = z.object({
  id: contractIdSchema,
  name: z.string().trim().min(1).max(120),
  version: z.number().int().min(1).optional(),
  spotFilters: z.object({ bands: z.array(z.string()), modes: z.array(z.string().refine((mode) => normalizeMode(mode).category !== "unknown", "Unsupported legacy mode; original profile retained")) }),
}).passthrough();

/** Preserve one named display recipe per legacy identity, including presentation. */
export function convertCapturedOperatingProfiles(
  profiles: readonly unknown[],
  capturedConfig: ViewConfiguration,
): { presets: PresetRecipe[]; warnings: string[] } {
  const warnings = new Set<string>();
  const presets = profiles.map((raw) => {
    const profile = profileSchema.parse(structuredClone(raw));
    const { display, omitted } = recipesFromLegacyOperatingProfile({ profile, capturedConfig });
    for (const omission of omitted) {
      warnings.add(`Legacy profile ${omission.field} retained in backup: ${omission.reason}`);
    }
    return display;
  });
  return { presets, warnings: [...warnings] };
}
