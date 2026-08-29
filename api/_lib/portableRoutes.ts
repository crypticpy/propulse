/**
 * Portable route manifest — every cloud-independent /api/* proxy as a pure
 * (Request) => Response handler, keyed by exact request path.
 *
 * Consumed by the bridge's LAN mount (bundled into bridge/dist) and available
 * to local tooling; the thin Vercel wrappers under api/ stay the deploy-time
 * entry points for the cloud. Cloud-bound routes (Supabase auth, billing,
 * display pairing, credentialed callsign lookups, log sync, …) are
 * deliberately absent — see docs/guides/SELF-HOSTING.md.
 */

import { SOLAR_ROUTES, type EdgeHandler } from "./solarRoutes";
import {
  handleActivationPota,
  handleActivationSota,
} from "./handlers/activation";
import {
  handleAtmosAprs,
  handleAtmosGauges,
  handleAtmosRepeaters,
  handleAtmosSst,
} from "./handlers/atmos";
import {
  handleAtmosTec,
  handleAtmosTropical,
  handleAtmosWinlink,
} from "./handlers/atmosSpace";
import { handleAuroraIndex } from "./handlers/aurora";
import {
  handleCallsignClublogStatus,
  handleCallsignLookup,
} from "./handlers/callsign";
import { handleContestScp } from "./handlers/contest";
import { handleFiresHotspots } from "./handlers/fires";
import { handleLightningStrikes } from "./handlers/lightning";
import {
  handlePropagationDucting,
  handlePropagationSporadicE,
} from "./handlers/propagationPhysics";
import {
  handleSatellitesSatnogs,
  handleSatellitesStatus,
  handleSatellitesTransponders,
} from "./handlers/satellites";
import {
  handleSpotsDxcluster,
  handleSpotsPskreporter,
  handleSpotsRbn,
} from "./handlers/spots";
import { handleWeatherAlerts } from "./handlers/weather";
import { handleWsprSpots } from "./handlers/wspr";
// Not extracted (kept whole in its wrapper) but fully portable: Supabase TLE
// cache is optional with a direct Celestrak/AMSAT fallback.
import handleSatellitesTle from "../satellites/tle";

export type { EdgeHandler };

export const PORTABLE_ROUTES: Readonly<Record<string, EdgeHandler>> = {
  ...SOLAR_ROUTES,
  "/api/activation/pota": handleActivationPota,
  "/api/activation/sota": handleActivationSota,
  "/api/atmos/aprs": handleAtmosAprs,
  "/api/atmos/gauges": handleAtmosGauges,
  "/api/atmos/repeaters": handleAtmosRepeaters,
  "/api/atmos/sst": handleAtmosSst,
  "/api/atmos/tec": handleAtmosTec,
  "/api/atmos/tropical": handleAtmosTropical,
  "/api/atmos/winlink": handleAtmosWinlink,
  "/api/aurora": handleAuroraIndex,
  "/api/callsign/clublog-status": handleCallsignClublogStatus,
  "/api/callsign/lookup": handleCallsignLookup,
  "/api/contest/scp": handleContestScp,
  "/api/fires/hotspots": handleFiresHotspots,
  "/api/lightning/strikes": handleLightningStrikes,
  // Model-service proxies (/api/propagation/{path,surface,models,health,
  // capabilities}) are deliberately absent: they verifyAuth against Supabase
  // and spend the operator's paid inference token — cloud-only. The app
  // falls back to the local physics engine, same as during any outage.
  "/api/propagation/ducting": handlePropagationDucting,
  "/api/propagation/sporadic-e": handlePropagationSporadicE,
  "/api/satellites/satnogs": handleSatellitesSatnogs,
  "/api/satellites/status": handleSatellitesStatus,
  "/api/satellites/tle": handleSatellitesTle,
  "/api/satellites/transponders": handleSatellitesTransponders,
  "/api/spots/dxcluster": handleSpotsDxcluster,
  "/api/spots/pskreporter": handleSpotsPskreporter,
  "/api/spots/rbn": handleSpotsRbn,
  "/api/weather/alerts": handleWeatherAlerts,
  "/api/wspr/spots": handleWsprSpots,
};
