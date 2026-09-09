import { handleSpotsHeatmapBaseline } from "../_lib/handlers/heatmapBaseline.js";

export const config = { runtime: "edge" };

export default { fetch: handleSpotsHeatmapBaseline };
