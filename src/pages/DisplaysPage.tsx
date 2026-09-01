import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useKioskStore } from "@/stores/kioskStore";
import type { DisplaySceneConfig } from "@/stores/displayStore";
import type { DisplayFit } from "@/stores/mapStore";
import type { TextScale } from "@/types/user";
import type { Json, Tables } from "@/types/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  buildDisplaySceneConfig,
  mergeDisplaySceneOptions,
} from "./displayAssignment";

const LIVE_THRESHOLD_MS = 60_000;
const REFRESH_INTERVAL_MS = 20_000;
const MAX_NAME_LENGTH = 60;

type DisplayRow = Pick<
  Tables<"displays">,
  "id" | "name" | "last_seen_at" | "created_at" | "updated_at"
> & {
  scene_config: DisplaySceneConfig | null;
};

function displaysTable() {
  return getSupabase().from("displays");
}

async function fetchDisplays(): Promise<DisplayRow[]> {
  const { data, error } = await displaysTable()
    .select("id, name, scene_config, last_seen_at, created_at, updated_at")
    .order("created_at", { ascending: true })
    // Supabase correctly generates jsonb as Json. This page owns the richer
    // DisplaySceneConfig contract, so narrow only that selected field while
    // retaining generated types for the table, filters, and writes.
    .overrideTypes<DisplayRow[], { merge: false }>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** DisplaySceneConfig contains JSON-only data, but imported interfaces do not
 * carry Json's string index signature. Keep the assertion at this single
 * serialization boundary instead of weakening the Supabase client to any. */
function sceneConfigJson(config: DisplaySceneConfig): Json {
  return config as unknown as Json;
}

async function pushRefreshNudge(displayId: string): Promise<void> {
  try {
    const supabase = getSupabase();
    const channel = supabase.channel(`display:${displayId}`);
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      // Don't hang forever if the realtime socket never confirms.
      setTimeout(resolve, 2000);
    });
    await channel.send({ type: "broadcast", event: "refresh", payload: {} });
    await supabase.removeChannel(channel);
  } catch {
    // Best-effort fast path — the device's 20s poll will pick up the change
    // regardless.
  }
}

/**
 * DisplaysPage — /displays
 *
 * Owner-side management for paired Display Wall devices: rename, see
 * online status, assign a scene config, and unpair. All writes go straight
 * through supabase-js under RLS (owner-only); a Realtime broadcast on save
 * is a fast-path nudge only — the device's own poll is the source of truth.
 */
export function DisplaysPage() {
  const [displays, setDisplays] = useState<DisplayRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DisplayRow | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchDisplays();
      setDisplays(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load displays");
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      const { error } = await displaysTable().delete().eq("id", id);
      if (error) throw new Error(error.message);
      setDisplays((prev) => prev?.filter((d) => d.id !== id) ?? prev);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete display");
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <p className="text-gray-400 text-sm text-center max-w-sm">
          Display Wall needs a PropPulse account (cloud feature) — connect
          Supabase to pair and manage wall displays.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-orbitron text-2xl text-white mb-1">
          Display Wall
        </h1>
        <p className="text-sm text-gray-400 max-w-xl">
          Manage paired wall devices: rename, check status, and push a scene
          config.
        </p>
      </div>

      {loadError && (
        <div className="p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
          <p className="text-sm text-alert-red">{loadError}</p>
        </div>
      )}

      {displays === null && !loadError && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {displays !== null && displays.length === 0 && (
        <div className="bg-deep-space/60 border border-white/10 rounded-xl p-6 text-center space-y-3">
          <p className="text-gray-300">No displays paired yet.</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Open{" "}
            <Link to="/display/pair" className="text-plasma-orange underline">
              /display/pair
            </Link>{" "}
            on the wall device to show a pairing code, then claim it here
            from your phone at /pair.
          </p>
        </div>
      )}

      {displays !== null &&
        displays.length > 0 &&
        displays.map((display) => (
          <DisplayCard
            key={display.id}
            display={display}
            onChanged={load}
            onRequestDelete={() => setPendingDelete(display)}
          />
        ))}

      {pendingDelete && (
        <DeleteConfirmModal
          name={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

// ─── Display card ────────────────────────────────────────────────────────

interface DisplayCardProps {
  display: DisplayRow;
  onChanged: () => void;
  onRequestDelete: () => void;
}

type ConfigDraftField =
  | "scenes"
  | "rotationEnabled"
  | "intervalSec"
  | "layoutFit"
  | "wallTextScale";

function DisplayCard({ display, onChanged, onRequestDelete }: DisplayCardProps) {
  const kioskScenes = useKioskStore((s) => s.scenes);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(display.name);
  const [savingName, setSavingName] = useState(false);

  const localSceneIds = useMemo(
    () => new Set(kioskScenes.map((scene) => scene.id)),
    [kioskScenes],
  );
  const assignmentScenes = useMemo(
    () => mergeDisplaySceneOptions(kioskScenes, display.scene_config),
    [display.scene_config, kioskScenes],
  );
  const enabledSceneIds = useMemo(
    () =>
      new Set(
        assignmentScenes
          .filter((scene) => scene.enabled !== false)
          .map((scene) => scene.id),
      ),
    [assignmentScenes],
  );
  const assignedIds = useMemo(
    () =>
      new Set(
        (display.scene_config?.scenes ?? [])
          .map((scene) => scene.id)
          .filter((id) => enabledSceneIds.has(id)),
      ),
    [display.scene_config?.scenes, enabledSceneIds],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(assignedIds);
  const [rotationEnabled, setRotationEnabled] = useState(
    display.scene_config?.rotation?.enabled ?? true,
  );
  const [intervalSec, setIntervalSec] = useState(
    display.scene_config?.rotation?.intervalSec ?? 120,
  );
  const [layoutFit, setLayoutFit] = useState<DisplayFit>(
    display.scene_config?.layout?.fit ?? "auto",
  );
  // "" = don't override the device's own text-scale setting
  const [wallTextScale, setWallTextScale] = useState<TextScale | "">(
    display.scene_config?.layout?.textScale ?? "",
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirtyConfigFields = useRef<Set<ConfigDraftField>>(new Set());

  const markConfigDirty = (field: ConfigDraftField) => {
    dirtyConfigFields.current.add(field);
  };

  // Server refreshes update every clean draft field. Fields the operator is
  // actively changing are intentionally preserved, so a background poll does
  // not erase their work; the next save combines those edits with the latest
  // server values for all untouched fields.
  useEffect(() => {
    if (!editingName) setNameDraft(display.name);
    const dirty = dirtyConfigFields.current;
    if (!dirty.has("scenes")) setSelectedIds(new Set(assignedIds));
    if (!dirty.has("rotationEnabled")) {
      setRotationEnabled(display.scene_config?.rotation?.enabled ?? true);
    }
    if (!dirty.has("intervalSec")) {
      setIntervalSec(display.scene_config?.rotation?.intervalSec ?? 120);
    }
    if (!dirty.has("layoutFit")) {
      setLayoutFit(display.scene_config?.layout?.fit ?? "auto");
    }
    if (!dirty.has("wallTextScale")) {
      setWallTextScale(display.scene_config?.layout?.textScale ?? "");
    }
  }, [
    assignedIds,
    display.name,
    display.scene_config,
    display.updated_at,
    editingName,
  ]);

  const isLive =
    display.last_seen_at !== null &&
    Date.now() - new Date(display.last_seen_at).getTime() < LIVE_THRESHOLD_MS;

  const lastSeenLabel = display.last_seen_at
    ? `Last seen ${formatDistanceToNow(new Date(display.last_seen_at), { addSuffix: true })}`
    : "Never connected";

  const saveName = async () => {
    const trimmed = nameDraft.trim().slice(0, MAX_NAME_LENGTH);
    if (!trimmed || trimmed === display.name) {
      setEditingName(false);
      setNameDraft(display.name);
      return;
    }
    setSavingName(true);
    try {
      const { error } = await displaysTable()
        .update({ name: trimmed })
        .eq("id", display.id);
      if (error) throw new Error(error.message);
      setEditingName(false);
      onChanged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSavingName(false);
    }
  };

  const toggleScene = (id: string) => {
    if (!enabledSceneIds.has(id)) return;
    markConfigDirty("scenes");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    setSaveError(null);
    try {
      const sceneConfig = buildDisplaySceneConfig(
        display.scene_config,
        assignmentScenes,
        {
          selectedIds,
          scenesChanged: dirtyConfigFields.current.has("scenes"),
          rotationEnabled,
          intervalSec,
          layoutFit,
          wallTextScale,
        },
      );
      const { error } = await displaysTable()
        .update({ scene_config: sceneConfigJson(sceneConfig) })
        .eq("id", display.id);
      if (error) throw new Error(error.message);
      await pushRefreshNudge(display.id);
      dirtyConfigFields.current.clear();
      onChanged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="bg-deep-space/60 border border-white/10 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isLive ? "bg-signal-green" : "bg-white/20"
            }`}
            title={isLive ? "Online" : lastSeenLabel}
            aria-hidden="true"
          />
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") {
                  setNameDraft(display.name);
                  setEditingName(false);
                }
              }}
              maxLength={MAX_NAME_LENGTH}
              disabled={savingName}
              className="bg-void-black border border-white/15 rounded-lg px-2 py-1 text-white text-sm min-w-0"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-white font-medium truncate hover:text-plasma-orange transition-colors text-left"
              title="Rename"
            >
              {display.name}
            </button>
          )}
        </div>
        <button
          onClick={onRequestDelete}
          className="text-gray-500 hover:text-alert-red text-sm px-2 shrink-0"
          aria-label={`Delete ${display.name}`}
        >
          Delete
        </button>
      </div>

      <p className="text-xs text-gray-500 font-mono">
        {isLive ? "Online now" : lastSeenLabel}
      </p>

      <div className="border-t border-white/10 pt-3 space-y-3">
        <p className="text-xs uppercase tracking-wider text-gray-500">
          Scenes
        </p>
        {assignmentScenes.length === 0 ? (
          <p className="text-sm text-gray-500">
            No local scenes configured — set some up on the{" "}
            <Link to="/kiosk" className="text-plasma-orange underline">
              Kiosk page
            </Link>{" "}
            first.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {assignmentScenes.map((scene) => {
              const isEnabled = scene.enabled !== false;
              const isRemoteSnapshot = !localSceneIds.has(scene.id);
              return (
                <li key={scene.id}>
                  <label
                    className={`flex items-center gap-2 text-sm ${
                      isEnabled ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled && selectedIds.has(scene.id)}
                      onChange={() => toggleScene(scene.id)}
                      disabled={!isEnabled}
                      className="accent-plasma-orange disabled:cursor-not-allowed"
                    />
                    {scene.name}
                    {isRemoteSnapshot && (
                      <span className="text-[10px] uppercase tracking-wider text-sky-400/70">
                        Paired-display snapshot
                      </span>
                    )}
                    {!isEnabled && (
                      <span className="text-[10px] uppercase tracking-wider text-gray-600">
                        Disabled · not assignable
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {selectedIds.size === 0 && (
          <p className="text-xs text-gray-500">
            No scenes selected — saving clears the remote assignment and the
            device returns to its local defaults.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={rotationEnabled}
              onChange={(e) => {
                markConfigDirty("rotationEnabled");
                setRotationEnabled(e.target.checked);
              }}
              className="accent-plasma-orange"
            />
            Rotate every
            <input
              type="number"
              min={15}
              max={3600}
              value={intervalSec}
              onChange={(e) => {
                markConfigDirty("intervalSec");
                setIntervalSec(Number(e.target.value));
              }}
              className="w-20 bg-void-black border border-white/15 rounded-lg px-2 py-1 text-white text-sm text-center"
              aria-label="Rotation interval in seconds"
            />
            seconds
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Layout
            <select
              value={layoutFit}
              onChange={(e) => {
                markConfigDirty("layoutFit");
                setLayoutFit(e.target.value as DisplayFit);
              }}
              className="bg-void-black border border-white/15 rounded-lg px-2 py-1 text-white text-sm"
            >
              <option value="auto">Auto (fit to screen)</option>
              <option value="compact">Compact</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Text size
            <select
              value={wallTextScale}
              onChange={(e) => {
                markConfigDirty("wallTextScale");
                setWallTextScale(e.target.value as TextScale | "");
              }}
              className="bg-void-black border border-white/15 rounded-lg px-2 py-1 text-white text-sm"
            >
              <option value="">Leave unchanged</option>
              <option value="sm">Small</option>
              <option value="md">Normal</option>
              <option value="lg">Large</option>
              <option value="xl">Wall</option>
            </select>
          </label>
        </div>

        {saveError && <p className="text-sm text-alert-red">{saveError}</p>}

        <button
          onClick={() => void saveConfig()}
          disabled={savingConfig}
          className="px-4 py-2 rounded-lg bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingConfig ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Delete confirm modal (centered — no flyout panels) ─────────────────

interface DeleteConfirmModalProps {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ name, onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm bg-deep-space border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-orbitron text-lg text-white">Delete display?</h2>
        <p className="text-sm text-gray-400">
          &ldquo;{name}&rdquo; will be unpaired. The device will show a fresh
          pairing code the next time it polls.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-sm text-white hover:bg-white/20"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-alert-red/20 border border-alert-red/40 text-alert-red hover:bg-alert-red/30 text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
