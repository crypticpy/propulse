/**
 * mDNS advertisement so shack devices can find the bridge without typing IPs.
 *
 * Publishes an HTTP service ("PropPulse") with host propulse.local on the
 * static/API port. Only started when the static server is actually bound to
 * a LAN-reachable address — advertising a localhost-only server would just
 * mislead devices. Clients then reach the app at http://propulse.local:<port>.
 */

import { Bonjour, type Service } from "bonjour-service";

export interface LanDiscoveryLogger {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

let bonjour: Bonjour | null = null;
let service: Service | null = null;

export function startLanDiscovery(
  port: number,
  logger: LanDiscoveryLogger,
): void {
  try {
    bonjour = new Bonjour();
    service = bonjour.publish({
      name: "PropPulse",
      type: "http",
      port,
      host: "propulse.local",
    });
    service.on("error", (error: unknown) => {
      logger.error("mDNS advertisement error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    logger.info("mDNS advertisement started", {
      host: "propulse.local",
      port,
    });
  } catch (error) {
    // Discovery is a convenience — never let it take the bridge down
    logger.error("Failed to start mDNS advertisement", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function stopLanDiscovery(): void {
  service?.stop?.();
  bonjour?.destroy();
  service = null;
  bonjour = null;
}
