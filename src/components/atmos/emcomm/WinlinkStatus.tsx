/**
 * WinlinkStatus -- Shows Winlink RMS gateway status near station
 */

import { useQuery } from "@tanstack/react-query";

interface WinlinkGateway {
  callsign: string;
  frequency: string;
  mode: string;
  lat: number;
  lon: number;
  lastSeen: string;
}

async function fetchWinlinkGateways(): Promise<WinlinkGateway[]> {
  try {
    const res = await fetch("/api/atmos/winlink");
    if (!res.ok) return [];
    const data = await res.json();
    // Parse the Winlink response - it returns channel listings
    // Each channel has: Callsign, Frequency, Mode, Latitude, Longitude, LastSeen
    if (!data || (!Array.isArray(data.gateways) && !Array.isArray(data)))
      return [];
    const items = Array.isArray(data) ? data : (data.gateways ?? []);
    return items
      .slice(0, 50)
      .map((g: Record<string, unknown>) => ({
        callsign: String(g.Callsign ?? g.callsign ?? ""),
        frequency: String(g.Frequency ?? g.frequency ?? ""),
        mode: String(g.Mode ?? g.mode ?? ""),
        lat: Number(g.Latitude ?? g.lat ?? 0),
        lon: Number(g.Longitude ?? g.lon ?? 0),
        lastSeen: String(g.LastSeen ?? g.lastSeen ?? ""),
      }))
      .filter((g: WinlinkGateway) => g.callsign);
  } catch {
    return [];
  }
}

// Haversine distance
function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function WinlinkStatus({
  stationLat,
  stationLon,
}: {
  stationLat: number;
  stationLon: number;
}) {
  const { data: gateways = [] } = useQuery({
    queryKey: ["winlink-gateways"],
    queryFn: fetchWinlinkGateways,
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: 60 * 60 * 1000,
  });

  // Sort by distance, take nearest 5
  const nearby = gateways
    .map((g) => ({
      ...g,
      dist: distanceKm(stationLat, stationLon, g.lat, g.lon),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 5);

  if (nearby.length === 0) {
    return (
      <div className="text-[10px] text-gray-700 text-center py-1">
        No Winlink gateways found
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="text-[9px] font-mono uppercase text-gray-600">
        Winlink Gateways
      </h3>
      {nearby.map((g) => (
        <div
          key={g.callsign + g.frequency}
          className="flex items-center justify-between text-[10px]"
        >
          <div className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full bg-signal-green" />
            <span className="text-gray-400 font-mono">{g.callsign}</span>
          </div>
          <span className="text-gray-600">{Math.round(g.dist)} km</span>
        </div>
      ))}
    </div>
  );
}
