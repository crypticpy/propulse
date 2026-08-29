import { handleWeatherAlerts } from "../_lib/handlers/weather";

export const config = {
  runtime: "edge",
};

export default handleWeatherAlerts;
