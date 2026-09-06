import { z } from "zod";
import { BAND_CENTER_FREQUENCIES } from "@/lib/data/feedlines";

// stationChainEngine's MODE_LINK_ASSUMPTIONS is private. Keep this allowlist
// aligned with its explicit entries; unknown modes must not use its fallback.
const engineModes = ["WSPR", "FT8", "FT4", "CW", "DATA", "RTTY", "SSB", "AM", "FM"] as const;
export const routeCompileModeSchema = z.string().trim().toUpperCase().pipe(z.enum(engineModes));
export const routeCompileBandSchema = z.string().refine(
  (value) => Object.prototype.hasOwnProperty.call(BAND_CENTER_FREQUENCIES, value),
  "Band has no station engine center frequency",
);
const bands = z.array(routeCompileBandSchema).min(1, "Explicit bands cannot be empty").superRefine((values, ctx) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: "Duplicate requested band" });
    seen.add(value);
  });
});

/** Strict caller boundary. No coercion, default band/mode, or engine fallback.
 * Bearing accepts the compass endpoints 0 and 360; takeoff is above the horizon.
 * Noise must be finite; this boundary does not invent a physical dBm range.
 * Omitted options/mode stay omitted: the compiler must validate a pinned mode
 * separately after resolving its explicit caller-over-pinned precedence.
 */
export const routeCompileRequestSchema = z.object({
  revisionId: z.string().trim().min(1),
  routeId: z.string().trim().min(1),
  options: z.object({
    bands: bands.optional(),
    targetBearingDeg: z.number().finite().min(0).max(360).optional(),
    takeoffAngleDeg: z.number().finite().min(0).max(90).optional(),
    localNoiseFloorDbm: z.number().finite().optional(),
    mode: routeCompileModeSchema.optional(),
    preferTestedSpecs: z.boolean().optional(),
  }).strict().optional(),
}).strict();
