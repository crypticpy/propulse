import { handleSatellitesStatus } from "../_lib/handlers/satellites";

export const config = {
  runtime: "edge",
};

export default handleSatellitesStatus;
