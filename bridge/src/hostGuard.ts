/**
 * Host-header guard for the static/API server — DNS-rebinding defense.
 *
 * A malicious web page can rebind its own domain's DNS to the bridge's IP;
 * the victim's browser then sends same-origin requests to the bridge with the
 * attacker's hostname in Host. Rejecting any Host we don't recognize confines
 * requests to names that genuinely mean this machine: loopback, the bound
 * address, propulse.local, and the machine's own interface IPs.
 */

import os from "os";

const STATIC_ALLOWED = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "propulse.local",
]);

let interfaceCache: { hosts: Set<string>; at: number } | null = null;
const INTERFACE_CACHE_MS = 30_000;

function interfaceHosts(): Set<string> {
  const now = Date.now();
  if (interfaceCache && now - interfaceCache.at < INTERFACE_CACHE_MS) {
    return interfaceCache.hosts;
  }
  const hosts = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      hosts.add(addr.address.toLowerCase());
    }
  }
  interfaceCache = { hosts, at: now };
  return hosts;
}

/**
 * True when the request's Host header names this machine.
 * `boundHost` is the address the server was told to bind (allowed verbatim
 * when it is a concrete address rather than a wildcard).
 */
export function isAllowedHost(
  hostHeader: string | undefined,
  boundHost: string,
): boolean {
  if (!hostHeader) return false;

  let hostname: string;
  try {
    // URL parsing strips the port and IPv6 brackets uniformly
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  // URL keeps brackets on IPv6 hostnames — normalize them away
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  if (STATIC_ALLOWED.has(hostname)) return true;
  const bound = boundHost.toLowerCase();
  if (bound !== "0.0.0.0" && bound !== "::" && hostname === bound) return true;
  return interfaceHosts().has(hostname);
}
