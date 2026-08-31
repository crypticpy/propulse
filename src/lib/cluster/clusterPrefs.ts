/**
 * DX cluster connection preferences.
 *
 * Extracted from `ClusterSettings.tsx` so the settings page and the map-side
 * cluster popover configure the same connection from one source of truth.
 *
 * The password is deliberately NOT persisted — see `savePrefs`.
 */

// =============================================================================
// NODES
// =============================================================================

export interface ClusterNode {
  host: string;
  port: number;
  label: string;
  region: string;
}

/** Well-known public cluster nodes offered in the picker. */
export const WELL_KNOWN_NODES: readonly ClusterNode[] = [
  { host: "dxc.ve7cc.net", port: 7300, label: "VE7CC", region: "North America" },
  { host: "dxc.nc7j.com", port: 7373, label: "NC7J", region: "North America" },
  {
    host: "spider.ham-radio.ch",
    port: 7300,
    label: "HB9DRV",
    region: "Europe",
  },
  { host: "dx.k3lr.com", port: 7300, label: "K3LR", region: "North America" },
  {
    host: "dxc.k3lr.com",
    port: 7300,
    label: "K3LR Alt",
    region: "North America",
  },
];

/** Bands offered as cluster-side spot filters. */
export const FILTER_BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
] as const;

/** Modes offered as cluster-side spot filters. */
export const FILTER_MODES = ["CW", "SSB", "FT8", "FT4", "RTTY", "DATA"] as const;

// =============================================================================
// PREFERENCES
// =============================================================================

export interface ClusterPrefs {
  /** Index into `WELL_KNOWN_NODES`, or -1 for a custom host/port. */
  selectedNodeIndex: number;
  customHost: string;
  customPort: number;
  callsign: string;
  /** Session-only — never written to storage. */
  password: string;
  filterBands: string[];
  filterModes: string[];
}

export const DEFAULT_CLUSTER_PORT = 7300;

export const DEFAULT_PREFS: ClusterPrefs = {
  selectedNodeIndex: 0,
  customHost: "",
  customPort: DEFAULT_CLUSTER_PORT,
  callsign: "",
  password: "",
  filterBands: [],
  filterModes: [],
};

const LS_KEY = "propulse-cluster-settings";

/**
 * Read stored preferences, merged over the defaults.
 *
 * Any `password` left in storage by an older build is dropped rather than
 * loaded, so upgrading clears the plaintext value instead of resurrecting it.
 */
export function loadPrefs(): ClusterPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClusterPrefs>;
      return { ...DEFAULT_PREFS, ...parsed, password: "" };
    }
  } catch {
    // Malformed or unavailable storage — fall through to defaults.
  }
  return DEFAULT_PREFS;
}

/**
 * Persist preferences, minus the password.
 *
 * Cluster logins are optional and this app keeps credentials in the encrypted
 * IndexedDB `credentialStore`, never in localStorage. Rather than write a
 * plaintext password to a key any script on the origin can read, the password
 * lives only in component state for the current session.
 */
export function savePrefs(prefs: ClusterPrefs): void {
  try {
    const { password: _password, ...persisted } = prefs;
    localStorage.setItem(LS_KEY, JSON.stringify(persisted));
  } catch {
    // Storage full or blocked — preferences are a convenience, not critical.
  }
}

/**
 * Resolve the host/port/label the given preferences point at, whether that is
 * a well-known node or a custom entry.
 */
export function resolveNode(prefs: ClusterPrefs): {
  host: string;
  port: number;
  label: string;
} {
  const known =
    prefs.selectedNodeIndex >= 0
      ? WELL_KNOWN_NODES[prefs.selectedNodeIndex]
      : undefined;

  if (known) {
    return { host: known.host, port: known.port, label: known.label };
  }

  const host = prefs.customHost.trim();
  return {
    host,
    port: prefs.customPort,
    label: host || "Custom node",
  };
}

/** Whether these preferences describe a connection we can actually attempt. */
export function canConnect(prefs: ClusterPrefs): boolean {
  return prefs.callsign.trim().length > 0 && resolveNode(prefs).host.length > 0;
}

/**
 * Build the `cluster.connect` payload for the bridge.
 *
 * Band filters are sent as wavelength integers (`"20m"` → `20`), which is the
 * form the bridge's cluster client expects.
 */
export function buildConnectPayload(prefs: ClusterPrefs) {
  const node = resolveNode(prefs);
  const bands = prefs.filterBands
    .map((band) => parseInt(band, 10))
    .filter((band) => Number.isFinite(band));

  return {
    nodes: [{ host: node.host, port: node.port, name: node.label }],
    callsign: prefs.callsign.trim().toUpperCase(),
    password: prefs.password || undefined,
    filters: {
      bands: bands.length > 0 ? bands : undefined,
      modes: prefs.filterModes.length > 0 ? prefs.filterModes : undefined,
    },
  };
}

/** Toggle a value in one of the filter arrays. */
export function toggleFilter(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}
