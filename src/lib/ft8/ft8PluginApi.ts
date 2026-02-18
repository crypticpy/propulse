// ---------------------------------------------------------------------------
// Ft8PluginApi -- Phase 4: Event-Based Plugin API
//
// Central event bus and extension point for third-party FT8/FT4 plugins.
// Plugins declare capabilities in a manifest; the manager enforces capability
// checks so that plugins can only subscribe to events they are authorised for.
// Each plugin receives a sandboxed Ft8PluginContext.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types -- Manifest & Capabilities
// ---------------------------------------------------------------------------

/** Plugin metadata */
export interface Ft8PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** Required API version (semver, e.g. "1.0.0") */
  apiVersion: string;
  /** Capabilities this plugin needs */
  capabilities: Ft8PluginCapability[];
}

/** Available plugin capabilities */
export type Ft8PluginCapability =
  | "read_decodes" // Access decoded messages
  | "read_state" // Access session state
  | "write_state" // Modify session state
  | "trigger_tx" // Initiate transmissions
  | "modify_ui" // Add custom UI panels
  | "access_log" // Read/write logbook
  | "network_access"; // Make network requests

// ---------------------------------------------------------------------------
// Public types -- Events & Payloads
// ---------------------------------------------------------------------------

/** Events that plugins can subscribe to */
export type Ft8PluginEvent =
  | "decode" // New decodes available
  | "tx_start" // Transmission started
  | "tx_end" // Transmission ended
  | "qso_start" // QSO sequence started
  | "qso_complete" // QSO completed
  | "band_change" // Band/frequency changed
  | "mode_change" // FT8/FT4 mode changed
  | "cycle_start" // New RX/TX cycle started
  | "state_change" // Session state changed
  | "alert_triggered"; // An alert rule matched

/** Event payloads */
export interface Ft8PluginEventPayloads {
  decode: {
    decodes: Array<{
      message: string;
      snr: number;
      deltaFrequency: number;
      callsign?: string;
      grid?: string;
      isCQ: boolean;
    }>;
  };
  tx_start: { message: string; freqHz: number; mode: "FT8" | "FT4" };
  tx_end: { message: string; success: boolean };
  qso_start: { callsign: string; mode: "cq" | "call" };
  qso_complete: {
    callsign: string;
    reportSent: string;
    reportReceived: string;
    grid?: string;
  };
  band_change: { band: string; dialFreqHz: number };
  mode_change: { mode: "FT8" | "FT4" };
  cycle_start: { cycleNumber: number; isEvenSlot: boolean };
  state_change: { key: string; value: unknown };
  alert_triggered: { ruleId: string; callsign: string; description: string };
}

// ---------------------------------------------------------------------------
// Public types -- Plugin Context
// ---------------------------------------------------------------------------

/** Plugin API interface exposed to plugins */
export interface Ft8PluginContext {
  /** Subscribe to an event */
  on<E extends Ft8PluginEvent>(
    event: E,
    cb: (payload: Ft8PluginEventPayloads[E]) => void,
  ): () => void;

  /** Get current session state */
  getState(): Record<string, unknown>;

  /** Log a message (routed to console with plugin prefix) */
  log(message: string, level?: "info" | "warn" | "error"): void;

  /** Show a notification to the user */
  notify(
    title: string,
    message: string,
    priority?: "info" | "warning" | "critical",
  ): void;
}

// ---------------------------------------------------------------------------
// Capability -> event mapping
// ---------------------------------------------------------------------------

/**
 * Map each event to the capability required to subscribe to it.
 * A plugin must hold the mapped capability to receive the event.
 */
const EVENT_CAPABILITY_MAP: Record<Ft8PluginEvent, Ft8PluginCapability> = {
  decode: "read_decodes",
  tx_start: "trigger_tx",
  tx_end: "trigger_tx",
  qso_start: "read_decodes",
  qso_complete: "read_decodes",
  band_change: "read_state",
  mode_change: "read_state",
  cycle_start: "read_state",
  state_change: "read_state",
  alert_triggered: "read_decodes",
};

// ---------------------------------------------------------------------------
// Internal per-plugin state
// ---------------------------------------------------------------------------

interface PluginSlot {
  manifest: Ft8PluginManifest;
  /** Cleanup function returned by the plugin's initFn (if any) */
  cleanup: (() => void) | undefined;
  /** Per-event listener sets for this plugin */
  listeners: Map<Ft8PluginEvent, Set<(payload: unknown) => void>>;
}

// ---------------------------------------------------------------------------
// Semver helpers (minimal, major.minor.patch only)
// ---------------------------------------------------------------------------

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Check if `required` is compatible with `current` using semver rules:
 * - Major versions must match.
 * - Required minor must be <= current minor.
 */
function isApiVersionCompatible(required: string, current: string): boolean {
  const req = parseSemver(required);
  const cur = parseSemver(current);
  if (!req || !cur) return false;
  if (req[0] !== cur[0]) return false; // major mismatch
  if (req[1] > cur[1]) return false; // requires newer minor
  return true;
}

// ---------------------------------------------------------------------------
// Ft8PluginManager
// ---------------------------------------------------------------------------

/**
 * FT8 Plugin Manager -- Central event bus and extension point for
 * third-party plugins.
 */
export class Ft8PluginManager {
  /** Current API version */
  static readonly API_VERSION = "1.0.0";

  private plugins: Map<string, PluginSlot> = new Map();

  /** Shared session state -- plugins with read_state/write_state can access */
  private state: Record<string, unknown> = {};

  /** Notification handler -- set externally to route plugin notifications */
  private notificationHandler:
    | ((
        pluginId: string,
        title: string,
        message: string,
        priority: "info" | "warning" | "critical",
      ) => void)
    | null = null;

  // -------------------------------------------------------------------------
  // Plugin registration
  // -------------------------------------------------------------------------

  /**
   * Register a plugin.
   *
   * @param manifest  Plugin metadata & requested capabilities.
   * @param initFn    Initialisation function called with the plugin's
   *                  sandboxed context.  May return a cleanup function.
   * @throws          If the API version is incompatible or plugin ID is taken.
   */
  registerPlugin(
    manifest: Ft8PluginManifest,
    initFn: (ctx: Ft8PluginContext) => void | (() => void),
  ): void {
    // Validate API version
    if (
      !isApiVersionCompatible(manifest.apiVersion, Ft8PluginManager.API_VERSION)
    ) {
      throw new Error(
        `Plugin "${manifest.id}" requires API v${manifest.apiVersion} but ` +
          `manager provides v${Ft8PluginManager.API_VERSION}`,
      );
    }

    // Reject duplicate registrations
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already registered`);
    }

    const slot: PluginSlot = {
      manifest: { ...manifest },
      cleanup: undefined,
      listeners: new Map(),
    };

    this.plugins.set(manifest.id, slot);

    // Build the sandboxed context for this plugin
    const ctx = this.createPluginContext(manifest.id, manifest.capabilities);

    // Call the plugin's init function
    try {
      const result = initFn(ctx);
      if (typeof result === "function") {
        slot.cleanup = result;
      }
    } catch (err) {
      // Plugin init failed -- unregister and rethrow
      this.plugins.delete(manifest.id);
      throw new Error(
        `Plugin "${manifest.id}" init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Unregister a plugin and call its cleanup function if present. */
  unregisterPlugin(pluginId: string): void {
    const slot = this.plugins.get(pluginId);
    if (!slot) return;

    // Call cleanup
    if (slot.cleanup) {
      try {
        slot.cleanup();
      } catch {
        /* swallow cleanup errors */
      }
    }

    // Remove all listeners
    slot.listeners.clear();
    this.plugins.delete(pluginId);
  }

  /** Get all registered plugins. */
  getPlugins(): Ft8PluginManifest[] {
    return Array.from(this.plugins.values()).map((s) => ({ ...s.manifest }));
  }

  /** Check if a plugin is registered. */
  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  // -------------------------------------------------------------------------
  // Event emission
  // -------------------------------------------------------------------------

  /**
   * Emit an event to all registered plugins that hold the required capability.
   * Listener errors are caught per-plugin so one misbehaving plugin cannot
   * disrupt others.
   */
  emit<E extends Ft8PluginEvent>(
    event: E,
    payload: Ft8PluginEventPayloads[E],
  ): void {
    for (const [pluginId, slot] of this.plugins) {
      const listeners = slot.listeners.get(event);
      if (!listeners || listeners.size === 0) continue;

      // Freeze payload to prevent mutations across plugins
      const frozenPayload = Object.freeze({ ...payload });

      for (const cb of listeners) {
        try {
          cb(frozenPayload);
        } catch (err) {
          console.error(
            `[ft8-plugin] Error in plugin "${pluginId}" handler for "${event}":`,
            err,
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Dispose all plugins and clean up. */
  dispose(): void {
    // Call cleanup on all plugins in reverse registration order
    const pluginIds = Array.from(this.plugins.keys());
    for (const id of pluginIds.reverse()) {
      this.unregisterPlugin(id);
    }
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Set external notification handler for plugin notifications. */
  setNotificationHandler(
    handler: (
      pluginId: string,
      title: string,
      message: string,
      priority: "info" | "warning" | "critical",
    ) => void,
  ): void {
    this.notificationHandler = handler;
  }

  /** Update session state (triggers state_change event). */
  setState(key: string, value: unknown): void {
    this.state[key] = value;
    this.emit("state_change", { key, value });
  }

  // -------------------------------------------------------------------------
  // Private -- context factory
  // -------------------------------------------------------------------------

  /**
   * Build a sandboxed Ft8PluginContext that enforces the plugin's
   * declared capabilities.
   */
  private createPluginContext(
    pluginId: string,
    capabilities: Ft8PluginCapability[],
  ): Ft8PluginContext {
    const capSet = new Set(capabilities);
    const slot = this.plugins.get(pluginId)!;

    const ctx: Ft8PluginContext = {
      on: <E extends Ft8PluginEvent>(
        event: E,
        cb: (payload: Ft8PluginEventPayloads[E]) => void,
      ): (() => void) => {
        // Enforce capability check
        const requiredCap = EVENT_CAPABILITY_MAP[event];
        if (!capSet.has(requiredCap)) {
          console.warn(
            `[ft8-plugin] Plugin "${pluginId}" lacks capability "${requiredCap}" ` +
              `for event "${event}" -- subscription ignored`,
          );
          return () => {};
        }

        if (!slot.listeners.has(event)) {
          slot.listeners.set(event, new Set());
        }
        const listenerSet = slot.listeners.get(event)!;
        const wrappedCb = cb as (payload: unknown) => void;
        listenerSet.add(wrappedCb);

        return () => {
          listenerSet.delete(wrappedCb);
        };
      },

      getState: (): Record<string, unknown> => {
        if (!capSet.has("read_state")) {
          console.warn(
            `[ft8-plugin] Plugin "${pluginId}" lacks "read_state" capability`,
          );
          return {};
        }
        // Return a shallow copy to prevent direct mutation
        return { ...this.state };
      },

      log: (message: string, level: "info" | "warn" | "error" = "info") => {
        const prefix = `[plugin:${pluginId}]`;
        switch (level) {
          case "warn":
            console.warn(prefix, message);
            break;
          case "error":
            console.error(prefix, message);
            break;
          default:
            console.log(prefix, message);
        }
      },

      notify: (
        title: string,
        message: string,
        priority: "info" | "warning" | "critical" = "info",
      ) => {
        if (this.notificationHandler) {
          try {
            this.notificationHandler(pluginId, title, message, priority);
          } catch {
            /* swallow notification handler errors */
          }
        } else {
          // Fallback: log to console
          console.log(
            `[plugin:${pluginId}] NOTIFY [${priority}] ${title}: ${message}`,
          );
        }
      },
    };

    return ctx;
  }
}
