import alerts from "../solar/alerts";
import animation from "../solar/animation";
import cme from "../solar/cme";
import drap from "../solar/drap";
import dst from "../solar/dst";
import fluxForecast from "../solar/flux-forecast";
import flux from "../solar/flux";
import frame from "../solar/frame";
import imageMeta from "../solar/image-meta";
import image from "../solar/image";
import kIndex from "../solar/k-index";
import magnetometer from "../solar/magnetometer";
import probabilities from "../solar/probabilities";
import protons from "../solar/protons";
import scales from "../solar/scales";
import sunspots from "../solar/sunspots";
import windMag from "../solar/wind-mag";
import windPlasma from "../solar/wind-plasma";
import xrayLatest from "../solar/xray-latest";
import xray from "../solar/xray";

export type EdgeHandler = (request: Request) => Promise<Response>;

/** Exact path map shared by local development and endpoint contract tests. */
export const SOLAR_ROUTES: Readonly<Record<string, EdgeHandler>> = {
  "/api/solar/alerts": alerts,
  "/api/solar/animation": animation,
  "/api/solar/cme": cme,
  "/api/solar/drap": drap,
  "/api/solar/dst": dst,
  "/api/solar/flux-forecast": fluxForecast,
  "/api/solar/flux": flux,
  "/api/solar/frame": frame,
  "/api/solar/image-meta": imageMeta,
  "/api/solar/image": image,
  "/api/solar/k-index": kIndex,
  "/api/solar/magnetometer": magnetometer,
  "/api/solar/probabilities": probabilities,
  "/api/solar/protons": protons,
  "/api/solar/scales": scales,
  "/api/solar/sunspots": sunspots,
  "/api/solar/wind-mag": windMag,
  "/api/solar/wind-plasma": windPlasma,
  "/api/solar/xray-latest": xrayLatest,
  "/api/solar/xray": xray,
};
