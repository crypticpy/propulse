/**
 * SyncManager — Core orchestrator for the 3-tier sync engine.
 *
 * Singleton class that manages:
 * - Module registration and lifecycle (start/stop)
 * - Write queue flushing at tier-appropriate cadences
 * - Online/offline detection and recovery
 * - Page visibility handling (flush on hide, pull on show)
 * - Retry with exponential backoff for failed entries
 *
 * Lifecycle:
 * 1. App startup (authenticated) → start(userId)
 * 2. Online transition → flush queue + retry failed
 * 3. Offline transition → pause network ops, continue local writes
 * 4. Page hidden → best-effort flush
 * 5. Sign-out → flush + clear + stop
 */

import { isSupabaseConfigured } from "@/lib/supabase";
import type {
  SyncModule,
  SyncableTable,
  SyncStatus,
  SyncTier,
  WriteQueueEntry,
} from "./types";
import { WriteQueue } from "./writeQueue";
import { syncMeta } from "./syncMeta";
import { useSyncStore } from "./syncStore";

/** Retry delays in ms: 1s, 5s, 30s, 5min, 30min */
const RETRY_DELAYS = [1_000, 5_000, 30_000, 300_000, 1_800_000];
const MAX_RETRIES = 10;

/** Tier 1 eager debounce: 5 seconds */
const EAGER_DEBOUNCE_MS = 5_000;

/** Tier 2 incremental flush interval: 30 seconds */
const INCREMENTAL_FLUSH_MS = 30_000;

export class SyncManager {
  private static instance: SyncManager | null = null;

  private modules = new Map<string, SyncModule>();
  private writeQueue: WriteQueue;
  private userId: string | null = null;
  private running = false;
  private flushing = false;
  private flushingTables = new Set<SyncableTable>();

  // Timers
  private eagerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private incrementalFlushInterval: ReturnType<typeof setInterval> | null =
    null;
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Event listener refs for cleanup
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  private constructor() {
    this.writeQueue = new WriteQueue();
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  static hasInstance(): boolean {
    return SyncManager.instance !== null;
  }

  /** Register a sync module. Call before start(). */
  registerModule(module: SyncModule): void {
    this.modules.set(module.name, module);
  }

  /** Get a registered module by name */
  getModule(name: string): SyncModule | undefined {
    return this.modules.get(name);
  }

  /** Whether the sync engine is currently running */
  get isRunning(): boolean {
    return this.running;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /** Start sync engine for authenticated user */
  async start(userId: string): Promise<void> {
    if (this.running) {
      if (this.userId === userId) return;
      await this.stop();
    }

    if (!isSupabaseConfigured) {
      console.warn("[SyncManager] Supabase not configured, sync disabled");
      return;
    }

    this.userId = userId;
    this.running = true;
    this.updateStatus({ state: "syncing", error: null });

    try {
      // Phase 1: Initial pull (Tier 1 + Tier 3 in parallel, then Tier 2)
      await this.initialPull();

      // Phase 2: Flush any pending write queue entries from previous session
      await this.flushWriteQueue();

      // Phase 3: Start periodic Tier 2 flush
      this.startPeriodicFlush();

      // Phase 4: Set up event listeners
      this.setupEventListeners();

      this.updateStatus({
        state: this.isOnline() ? "idle" : "offline",
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sync initialization failed";
      console.error("[SyncManager] Start failed:", message);
      this.updateStatus({ state: "error", error: message });
    }
  }

  /** Stop sync engine (on sign out or cleanup) */
  async stop(): Promise<void> {
    if (!this.running) return;

    // Best-effort flush before stopping
    try {
      if (this.isOnline()) {
        await this.flushWriteQueue();
      }
    } catch {
      // Non-fatal — queue persists in localStorage
    }

    this.teardownEventListeners();
    this.stopPeriodicFlush();
    this.clearEagerDebounce();
    this.clearRetryTimers();

    this.userId = null;
    this.running = false;
    syncMeta.clear();
    // Don't clear the write queue — unsynced entries survive for next session.
    // The queue persists in localStorage and will be flushed on next start().
    useSyncStore.getState().reset();
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /** Check if we're online */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Enqueue a write for eventual push to Supabase.
   * The write queue is flushed at the tier-appropriate cadence:
   * - Tier 1 (eager): triggers 5s debounce → pushAll()
   * - Tier 2 (incremental): handled by 30s periodic interval
   * - Tier 3 (lazy): flushed immediately
   */
  enqueue(
    table: SyncableTable,
    operation: "upsert" | "delete",
    data: Record<string, unknown>,
  ): void {
    if (!this.running) return;

    const tier = this.getTierForTable(table);

    // Tier 1 modules use full blob push (markDirty), not write queue
    if (tier === "eager") {
      this.scheduleEagerFlush();
      return;
    }

    this.writeQueue.enqueue(table, operation, data);
    this.updateStatus({ pendingCount: this.writeQueue.pendingCount });

    if (tier === "lazy") {
      void this.flushForTables([table]);
    }
    // Tier 2 (incremental) — handled by periodic interval
  }

  /**
   * Mark a tier as dirty (triggers tier-appropriate flush).
   * Use this when a store changes but you don't have a specific write queue entry.
   * Primarily for Tier 1 where we push the entire blob on change.
   */
  markDirty(tier: SyncTier): void {
    if (!this.running || !this.userId) return;

    if (tier === "eager") {
      this.scheduleEagerFlush();
    }
  }

  /** Manual "Sync Now" — pull + push everything */
  async syncNow(): Promise<void> {
    if (!this.running || !this.userId) return;

    this.updateStatus({ state: "syncing" });
    try {
      await this.pushEager();
      await this.flushWriteQueue();
      await this.pullAll();
      this.updateStatus({
        state: this.isOnline() ? "idle" : "offline",
        lastSyncAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      this.updateStatus({ state: "error", error: message });
    }
  }

  /** Get current write queue size */
  getPendingCount(): number {
    return this.writeQueue.pendingCount;
  }

  /** Get failed entries for UI display */
  getFailedEntries(): WriteQueueEntry[] {
    return this.writeQueue.getFailed();
  }

  /** Retry all failed entries */
  retryFailed(): void {
    this.writeQueue.retryAll();
    this.updateStatus({ pendingCount: this.writeQueue.pendingCount });
    if (this.isOnline()) {
      void this.flushWriteQueue();
    }
  }

  // ─── Internal: Pull ─────────────────────────────────────────────────

  private async initialPull(): Promise<void> {
    if (!this.userId) return;

    // Pull Tier 1 and Tier 3 in parallel (small data, fast)
    const eagerModules = this.getModulesForTier("eager");
    const lazyModules = this.getModulesForTier("lazy");

    await Promise.all([
      ...eagerModules.map((m) => this.pullModule(m)),
      ...lazyModules.map((m) => this.pullModule(m)),
    ]);

    // Pull Tier 2 after (potentially large, depends on Tier 1 for user context)
    const incrementalModules = this.getModulesForTier("incremental");
    for (const m of incrementalModules) {
      await this.pullModule(m);
    }
  }

  private async pullAll(): Promise<void> {
    if (!this.userId) return;
    const pullPromises = Array.from(this.modules.values()).map((m) =>
      this.pullModule(m),
    );
    await Promise.all(pullPromises);
  }

  private async pullModule(module: SyncModule): Promise<void> {
    if (!this.userId || !this.isOnline()) return;

    try {
      const since = syncMeta.getTimestamp(module.name);
      const newTimestamp = await module.pull(this.userId, since);
      if (newTimestamp) {
        syncMeta.setTimestamp(module.name, newTimestamp);
      }
    } catch (error) {
      console.error(`[SyncManager] Pull failed for ${module.name}:`, error);
      // Non-fatal — continue with other modules
    }
  }

  // ─── Internal: Push ─────────────────────────────────────────────────

  /** Push all Tier 1 modules (full blob push) */
  private async pushEager(): Promise<void> {
    if (!this.userId || !this.isOnline()) return;

    const modules = this.getModulesForTier("eager");
    await Promise.all(
      modules.map(async (m) => {
        try {
          await m.push(this.userId!);
        } catch (error) {
          console.error(
            `[SyncManager] Eager push failed for ${m.name}:`,
            error,
          );
        }
      }),
    );
  }

  /** Flush write queue — process pending entries through their modules */
  private async flushWriteQueue(): Promise<void> {
    if (!this.userId || !this.isOnline()) return;
    if (this.flushing) return; // Prevent concurrent flushes
    this.flushing = true;

    try {
      await this.flushWriteQueueInner();
    } finally {
      this.flushing = false;
    }
  }

  private async flushWriteQueueInner(): Promise<void> {
    const pending = this.writeQueue.getPending();
    if (pending.length === 0) return;

    // Group entries by module
    const byModule = new Map<SyncModule, WriteQueueEntry[]>();
    for (const entry of pending) {
      const module = this.getModuleForTable(entry.table);
      if (!module?.processQueue) continue;
      const list = byModule.get(module) ?? [];
      list.push(entry);
      byModule.set(module, list);
    }

    for (const [module, entries] of byModule) {
      try {
        const processedIds = await module.processQueue!(this.userId!, entries);
        this.writeQueue.dequeue(processedIds);
      } catch (error) {
        console.error(
          `[SyncManager] Queue flush failed for ${module.name}:`,
          error,
        );
        for (const entry of entries) {
          if (entry.retryCount < MAX_RETRIES) {
            this.writeQueue.markFailed(entry.queueId);
            this.scheduleRetry(entry);
          }
        }
      }
    }

    this.updateStatus({ pendingCount: this.writeQueue.pendingCount });
  }

  /** Flush write queue entries for specific tables only */
  private async flushForTables(tables: SyncableTable[]): Promise<void> {
    if (!this.userId || !this.isOnline()) return;

    // Per-table concurrency guard — skip tables already being flushed
    const remaining = tables.filter((t) => !this.flushingTables.has(t));
    if (remaining.length === 0) return;
    for (const t of remaining) this.flushingTables.add(t);

    try {
      const entries = this.writeQueue.getPendingForTables(remaining);
      if (entries.length === 0) return;

      const byModule = new Map<SyncModule, WriteQueueEntry[]>();
      for (const entry of entries) {
        const module = this.getModuleForTable(entry.table);
        if (!module?.processQueue) continue;
        const list = byModule.get(module) ?? [];
        list.push(entry);
        byModule.set(module, list);
      }

      for (const [module, moduleEntries] of byModule) {
        try {
          const processedIds = await module.processQueue!(
            this.userId!,
            moduleEntries,
          );
          this.writeQueue.dequeue(processedIds);
        } catch (error) {
          console.error(
            `[SyncManager] Table flush failed for ${module.name}:`,
            error,
          );
          for (const entry of moduleEntries) {
            if (entry.retryCount < MAX_RETRIES) {
              this.writeQueue.markFailed(entry.queueId);
              this.scheduleRetry(entry);
            }
          }
        }
      }

      this.updateStatus({ pendingCount: this.writeQueue.pendingCount });
    } finally {
      for (const t of remaining) this.flushingTables.delete(t);
    }
  }

  // ─── Internal: Scheduling ───────────────────────────────────────────

  private scheduleEagerFlush(): void {
    this.clearEagerDebounce();
    this.eagerDebounceTimer = setTimeout(() => {
      this.eagerDebounceTimer = null;
      if (!this.running) return;
      void this.pushEager();
    }, EAGER_DEBOUNCE_MS);
  }

  private clearEagerDebounce(): void {
    if (this.eagerDebounceTimer) {
      clearTimeout(this.eagerDebounceTimer);
      this.eagerDebounceTimer = null;
    }
  }

  private startPeriodicFlush(): void {
    this.stopPeriodicFlush();
    this.incrementalFlushInterval = setInterval(() => {
      void this.flushWriteQueue();
    }, INCREMENTAL_FLUSH_MS);
  }

  private stopPeriodicFlush(): void {
    if (this.incrementalFlushInterval) {
      clearInterval(this.incrementalFlushInterval);
      this.incrementalFlushInterval = null;
    }
  }

  private scheduleRetry(entry: WriteQueueEntry): void {
    const delayIndex = Math.min(entry.retryCount, RETRY_DELAYS.length - 1);
    const delay = RETRY_DELAYS[delayIndex];

    const timer = setTimeout(() => {
      this.retryTimers.delete(entry.queueId);
      this.writeQueue.retry(entry.queueId);
      void this.flushForTables([entry.table]);
    }, delay);

    this.retryTimers.set(entry.queueId, timer);
  }

  private clearRetryTimers(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  // ─── Internal: Event Listeners ──────────────────────────────────────

  private setupEventListeners(): void {
    this.onlineHandler = () => {
      this.updateStatus({ state: "idle" });
      this.writeQueue.retryAll();
      this.startPeriodicFlush();
      void this.flushWriteQueue();
    };

    this.offlineHandler = () => {
      this.updateStatus({ state: "offline" });
      this.stopPeriodicFlush();
    };

    this.visibilityHandler = () => {
      if (document.hidden) {
        // Page going hidden — best-effort flush
        void this.flushWriteQueue();
      } else {
        // Page becoming visible — pull latest + resume periodic
        void this.pullAll();
        if (this.isOnline()) {
          this.startPeriodicFlush();
        }
      }
    };

    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private teardownEventListeners(): void {
    if (this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.offlineHandler) {
      window.removeEventListener("offline", this.offlineHandler);
      this.offlineHandler = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  // ─── Internal: Helpers ──────────────────────────────────────────────

  private getModulesForTier(tier: SyncTier): SyncModule[] {
    return Array.from(this.modules.values()).filter((m) => m.tier === tier);
  }

  private getModuleForTable(table: SyncableTable): SyncModule | undefined {
    for (const module of this.modules.values()) {
      if (module.tables.includes(table)) return module;
    }
    return undefined;
  }

  private getTierForTable(table: SyncableTable): SyncTier | null {
    const module = this.getModuleForTable(table);
    return module?.tier ?? null;
  }

  private updateStatus(update: Partial<SyncStatus>): void {
    useSyncStore.getState().setStatus(update);
  }
}
