/**
 * Hook that enriches raw FT8/FT4 decodes with DXCC, country, distance,
 * and operational flags (CQ, dupe, needed, calling-me).
 *
 * Subscribes to the ft8DecoderStore decode buffer and produces an
 * enriched array updated each cycle.
 */

import { useMemo } from "react";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { useDXCCStore } from "@/stores/dxccStore";
import { extractCallInfo } from "@/lib/ft8/ft8MessageParser";
import {
  gridToLatLon,
  gridDistance,
  gridBearing,
  isValidGrid,
} from "@/lib/utils/grid";
import { lookupEntity } from "@/lib/data/dxccEntities";
import type { WsjtxDecode } from "@/lib/radio/protocol";
import {
  type Ft8EnrichedDecode,
  DXCC_TO_COUNTRY_CODE,
} from "@/lib/ft8/ft8EnrichedDecode";

/** Maximum number of enriched decodes to produce (matches display buffer cap) */
const MAX_ENRICHED = 500;

interface UseFt8DecodeEnricherOptions {
  /** Operator's callsign for isCallingMe detection */
  myCallsign?: string;
  /** Operator's Maidenhead grid for distance/bearing calculation */
  myGrid?: string;
  /** Set of needed DXCC entity IDs */
  neededDxcc?: Set<number>;
  /** Set of needed Maidenhead grids (2-char field) */
  neededGrids?: Set<string>;
}

export function useFt8DecodeEnricher(
  options: UseFt8DecodeEnricherOptions = {},
): Ft8EnrichedDecode[] {
  const decodes = useFt8DecoderStore((s) => s.decodes);
  const isWorked = useDXCCStore((s) => s.isWorked);
  const { myCallsign, myGrid, neededDxcc, neededGrids } = options;

  return useMemo(() => {
    const myCallUpper = myCallsign?.toUpperCase();

    return decodes
      .slice(0, MAX_ENRICHED)
      .map((d: WsjtxDecode): Ft8EnrichedDecode => {
        const info = extractCallInfo(d.message);
        const callsign = d.callsign || info.callsign;
        const grid = d.grid || info.grid;
        const isCQ = info.isCQ ?? d.message.startsWith("CQ ");

        // DXCC lookup
        let country: string | undefined;
        let countryCode: string | undefined;
        let dxcc: number | undefined;
        let cqZone: number | undefined;
        let ituZone: number | undefined;
        let continent: string | undefined;
        let entityLat: number | undefined;
        let entityLon: number | undefined;

        if (callsign) {
          const lookup = lookupEntity(callsign);
          if (lookup) {
            country = lookup.entity.name;
            dxcc = lookup.entity.id;
            cqZone = lookup.entity.cqZone;
            ituZone = lookup.entity.ituZone;
            continent = lookup.entity.continent;
            entityLat = lookup.entity.lat;
            entityLon = lookup.entity.lon;
            countryCode = DXCC_TO_COUNTRY_CODE[lookup.entity.id];
          }
        }

        // Position from grid (preferred) or DXCC entity center
        let lat: number | undefined;
        let lon: number | undefined;
        if (grid && isValidGrid(grid)) {
          try {
            const pos = gridToLatLon(grid);
            lat = pos.lat;
            lon = pos.lon;
          } catch {
            // Invalid grid — fall through to entity position
          }
        }
        if (lat == null && entityLat != null) {
          lat = entityLat;
          lon = entityLon;
        }

        // Distance and bearing from operator
        let distanceKm: number | undefined;
        let bearingDeg: number | undefined;
        if (myGrid && grid && isValidGrid(myGrid) && isValidGrid(grid)) {
          try {
            distanceKm = gridDistance(myGrid, grid);
            bearingDeg = gridBearing(myGrid, grid);
          } catch {
            // Grid conversion failure — skip
          }
        }

        // Operational flags
        const isDupe = dxcc != null ? isWorked(dxcc) : false;
        const isNew = dxcc != null ? !isWorked(dxcc) : false;

        const isNeeded =
          (dxcc != null && neededDxcc != null && neededDxcc.has(dxcc)) ||
          (grid != null &&
            neededGrids != null &&
            neededGrids.has(grid.substring(0, 2).toUpperCase()));

        const isCallingMe =
          myCallUpper != null &&
          callsign != null &&
          d.message.toUpperCase().includes(myCallUpper) &&
          !isCQ;

        return {
          ...d,
          callsign,
          grid,
          country,
          countryCode,
          dxcc,
          cqZone,
          ituZone,
          continent,
          lat,
          lon,
          distanceKm,
          bearingDeg,
          isCQ,
          isNew,
          isDupe,
          isNeeded,
          isCallingMe,
          source: d.instanceId ? "bridge" : "native",
        };
      });
  }, [decodes, myCallsign, myGrid, neededDxcc, neededGrids, isWorked]);
}
