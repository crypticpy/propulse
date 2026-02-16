/**
 * Zustand store for Net Control Manager — nets, sessions, check-ins, subscriptions.
 *
 * NOT persisted — all data is Supabase-backed. When Supabase is not configured,
 * every action is a graceful no-op that returns empty state.
 */

import { create } from "zustand";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useProfileStore } from "@/stores/profileStore";
import { getNextSessionTime } from "@/lib/utils/netSchedule";
import type {
  Net,
  NetType,
  NetSchedule,
  NetVisibility,
  RepeaterInfo,
  NetManager,
  NetManagerRole,
  NetSubscription,
  NetRsvp,
  NetSession,
  SessionStatus,
  NetCheckin,
  CheckinStatus,
  NetFilters,
  CreateNetInput,
  CheckinOpts,
} from "@/types/net";

// ── Row-to-Model Mappers ─────────────────────────────────────────────

function rowToNet(row: Record<string, unknown>): Net {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as NetType,
    summary: (row.summary as string) ?? undefined,
    description: (row.description as string) ?? "",
    frequency: row.frequency as string,
    altFrequency: (row.alt_frequency as string) ?? undefined,
    mode: row.mode as string,
    band: row.band as string,
    schedule: (row.schedule as NetSchedule) ?? undefined,
    durationMinutes: (row.duration_minutes as number) ?? undefined,
    country: (row.country as string) ?? undefined,
    stateOrProvince: (row.state_or_province as string) ?? undefined,
    region: (row.region as string) ?? undefined,
    repeaterInfo: (row.repeater_info as RepeaterInfo) ?? undefined,
    preambleTemplate: (row.preamble_template as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    visibility: row.visibility as NetVisibility,
    websiteUrl: (row.website_url as string) ?? undefined,
    formalityLevel: (row.formality_level as number) ?? undefined,
    protocolNotes: (row.protocol_notes as string) ?? undefined,
    newcomerFriendly: (row.newcomer_friendly as boolean) ?? true,
    echolinkNode: (row.echolink_node as string) ?? undefined,
    allstarNode: (row.allstar_node as string) ?? undefined,
    irlpNode: (row.irlp_node as string) ?? undefined,
    subscriberCount: (row.subscriber_count as number) ?? 0,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToManager(row: Record<string, unknown>): NetManager {
  return {
    netId: row.net_id as string,
    userId: row.user_id as string,
    role: row.role as NetManagerRole,
    callsign: (row.callsign as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function rowToSubscription(row: Record<string, unknown>): NetSubscription {
  return {
    userId: row.user_id as string,
    netId: row.net_id as string,
    alert10min: (row.alert_10min as boolean) ?? true,
    alert5min: (row.alert_5min as boolean) ?? false,
    alert3min: (row.alert_3min as boolean) ?? false,
    showOnProfile: (row.show_on_profile as boolean) ?? true,
    createdAt: row.created_at as string,
  };
}

function rowToSession(row: Record<string, unknown>): NetSession {
  return {
    id: row.id as string,
    netId: row.net_id as string,
    ncsUserId: row.ncs_user_id as string,
    ncsCallsign: row.ncs_callsign as string,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) ?? undefined,
    status: row.status as SessionStatus,
    checkinCount: (row.checkin_count as number) ?? 0,
    notes: (row.notes as string) ?? undefined,
    summary: (row.summary as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToCheckin(row: Record<string, unknown>): NetCheckin {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    callsign: row.callsign as string,
    userId: (row.user_id as string) ?? undefined,
    checkedInAt: row.checked_in_at as string,
    status: row.status as CheckinStatus,
    isRelay: (row.is_relay as boolean) ?? false,
    relayVia: (row.relay_via as string) ?? undefined,
    trafficNotes: (row.traffic_notes as string) ?? undefined,
    queuePosition: row.queue_position as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToRsvp(row: Record<string, unknown>): NetRsvp {
  return {
    id: row.id as string,
    netId: row.net_id as string,
    userId: row.user_id as string,
    sessionDate: row.session_date as string,
    createdAt: row.created_at as string,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNetManagerRoleValue(value: unknown): value is NetManagerRole {
  return value === "owner" || value === "manager" || value === "ncs";
}

interface NetStoreQueryResult {
  data: unknown;
  count?: number | null;
  error: { message: string } | null;
}

type NetStoreQueryBuilder = PromiseLike<NetStoreQueryResult> & {
  [method: string]: (...args: unknown[]) => NetStoreQueryBuilder;
};

interface NetStoreQueryClient {
  from: (table: string) => NetStoreQueryBuilder;
}

// ── Store ────────────────────────────────────────────────────────────

interface NetStore {
  // State
  nets: Net[];
  currentNet: Net | null;
  managers: NetManager[];
  subscriptions: NetSubscription[];
  sessions: NetSession[];
  checkins: NetCheckin[];
  currentSession: NetSession | null;
  isLoading: boolean;
  isLoadingSession: boolean;
  calendarToken: string | null;
  isLoadingCalendarToken: boolean;
  totalCount: number;
  currentPage: number;
  pageSize: number;

  // Net CRUD
  fetchNets: (filters?: Partial<NetFilters>) => Promise<void>;
  fetchNet: (netId: string) => Promise<Net | null>;
  createNet: (data: CreateNetInput) => Promise<string | null>;
  updateNet: (netId: string, data: Partial<CreateNetInput>) => Promise<void>;
  deleteNet: (netId: string) => Promise<void>;

  // Pagination
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // Subscriptions
  fetchMySubscriptions: () => Promise<void>;
  subscribe: (netId: string) => Promise<void>;
  unsubscribe: (netId: string) => Promise<void>;
  updateSubscription: (
    netId: string,
    prefs: Partial<
      Pick<
        NetSubscription,
        "alert10min" | "alert5min" | "alert3min" | "showOnProfile"
      >
    >,
  ) => Promise<void>;
  isSubscribed: (netId: string) => boolean;

  // Managers
  fetchManagers: (netId: string) => Promise<void>;
  addManager: (
    netId: string,
    userId: string,
    role: NetManagerRole,
  ) => Promise<void>;
  removeManager: (netId: string, userId: string) => Promise<void>;
  isManager: (netId: string) => boolean;

  // Sessions
  fetchSessions: (netId: string) => Promise<void>;
  startSession: (netId: string) => Promise<string | null>;
  updateSession: (
    sessionId: string,
    updates: { notes?: string },
  ) => Promise<void>;
  endSession: (sessionId: string, notes?: string) => Promise<void>;

  // Check-ins
  fetchCheckins: (sessionId: string) => Promise<void>;
  addCheckin: (
    sessionId: string,
    callsign: string,
    opts?: CheckinOpts,
  ) => Promise<void>;
  updateCheckin: (
    checkinId: string,
    data: Partial<{
      status: CheckinStatus;
      trafficNotes: string;
      isRelay: boolean;
      relayVia: string;
    }>,
  ) => Promise<void>;
  removeCheckin: (checkinId: string) => Promise<void>;
  reorderQueue: (
    sessionId: string,
    checkinId: string,
    newPosition: number,
  ) => Promise<void>;

  // Calendar tokens
  fetchCalendarToken: () => Promise<void>;
  generateCalendarToken: () => Promise<string | null>;
  revokeCalendarToken: () => Promise<void>;

  // Callsign history (auto-complete)
  callsignHistory: string[];
  fetchCallsignHistory: (netId: string) => Promise<void>;

  // RSVP
  rsvps: NetRsvp[];
  fetchRsvps: (netId: string, date: string) => Promise<void>;
  addRsvp: (netId: string, date: string) => Promise<void>;
  removeRsvp: (netId: string, date: string) => Promise<void>;
  getRsvpCount: (netId: string, date: string) => number;
  hasRsvpd: (netId: string, date: string) => boolean;

  // Managed nets (Net Controller)
  managedNets: Array<{
    net: Net;
    role: NetManagerRole;
    hasLiveSession: boolean;
  }>;
  isLoadingManagedNets: boolean;
  fetchMyManagedNets: () => Promise<void>;

  // Reset
  reset: () => void;
}

const initialState = {
  nets: [] as Net[],
  currentNet: null as Net | null,
  managers: [] as NetManager[],
  subscriptions: [] as NetSubscription[],
  sessions: [] as NetSession[],
  checkins: [] as NetCheckin[],
  currentSession: null as NetSession | null,
  isLoading: false,
  isLoadingSession: false,
  calendarToken: null as string | null,
  isLoadingCalendarToken: false,
  totalCount: 0,
  currentPage: 0,
  pageSize: 24,
  callsignHistory: [] as string[],
  rsvps: [] as NetRsvp[],
  managedNets: [] as Array<{
    net: Net;
    role: NetManagerRole;
    hasLiveSession: boolean;
  }>,
  isLoadingManagedNets: false,
};

export const useNetStore = create<NetStore>()((set, get) => ({
  ...initialState,

  // ── Fetch Nets (directory listing with optional filters + pagination) ──

  fetchNets: async (filters?: Partial<NetFilters>) => {
    if (!isSupabaseConfigured) return;

    set({ isLoading: true });

    try {
      const supabase = getSupabase();
      const { currentPage, pageSize } = get();

      const sortBy = filters?.sortBy ?? "popularity";
      const hasDayOfWeekFilter =
        filters?.dayOfWeek !== undefined && filters.dayOfWeek !== null;
      const needsClientSidePagination =
        sortBy === "upcoming" || hasDayOfWeekFilter;

      let query = (supabase as unknown as NetStoreQueryClient)
        .from("nets")
        .select("*", { count: "exact" })
        .in("visibility", ["public", "unlisted"]);

      // ── Server-side filters ──
      if (filters?.search) {
        const escaped = filters.search.replace(/[%_\\]/g, "\\$&");
        query = query.ilike("name", `%${escaped}%`);
      }
      if (filters?.type) {
        query = query.eq("type", filters.type);
      }
      if (filters?.band) {
        query = query.eq("band", filters.band);
      }
      if (filters?.mode) {
        query = query.eq("mode", filters.mode);
      }
      if (filters?.region) {
        query = query.eq("region", filters.region);
      }
      if (filters?.newcomerFriendly) {
        query = query.eq("newcomer_friendly", true);
      }
      if (
        filters?.formalityLevel !== undefined &&
        filters.formalityLevel !== null
      ) {
        query = query.eq("formality_level", filters.formalityLevel);
      }
      if (filters?.country) {
        query = query.eq("country", filters.country);
      }
      if (filters?.stateOrProvince) {
        query = query.eq("state_or_province", filters.stateOrProvince);
      }

      // ── Sort order ──
      if (sortBy === "popularity") {
        query = query.order("subscriber_count", { ascending: false });
      } else if (sortBy === "recent") {
        query = query.order("created_at", { ascending: false });
      } else {
        // "upcoming" — fetch with default order, sort client-side below
        query = query.order("subscriber_count", { ascending: false });
      }

      // ── Pagination ──
      if (needsClientSidePagination) {
        // Fetch a larger window for client-side filtering/sorting
        const fetchLimit = hasDayOfWeekFilter ? 500 : 200;
        query = query.range(0, fetchLimit - 1);
      } else {
        // True server-side pagination
        const from = currentPage * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;

      if (error || !data) {
        console.error("[netStore] fetchNets error:", error?.message);
        set({ isLoading: false });
        return;
      }

      let rows = data as Record<string, unknown>[];

      // ── Client-side dayOfWeek filter (JSONB schedule column) ──
      if (hasDayOfWeekFilter) {
        rows = rows.filter((row) => {
          const schedule = row.schedule as NetSchedule | null;
          if (!schedule) return false;
          return schedule.dayOfWeek === filters!.dayOfWeek;
        });
      }

      // ── Client-side sort for "upcoming" ──
      if (sortBy === "upcoming") {
        rows.sort((a, b) => {
          const netA = rowToNet(a);
          const netB = rowToNet(b);
          const timeA = netA.schedule
            ? (getNextSessionTime(netA.schedule)?.getTime() ?? Infinity)
            : Infinity;
          const timeB = netB.schedule
            ? (getNextSessionTime(netB.schedule)?.getTime() ?? Infinity)
            : Infinity;
          return timeA - timeB;
        });
      }

      // ── Client-side pagination for upcoming / dayOfWeek ──
      if (needsClientSidePagination) {
        const totalFiltered = rows.length;
        const from = currentPage * pageSize;
        const to = from + pageSize;
        rows = rows.slice(from, to);

        set({
          nets: rows.map(rowToNet),
          totalCount: totalFiltered,
          isLoading: false,
        });
      } else {
        set({
          nets: rows.map(rowToNet),
          totalCount: (count as number) ?? 0,
          isLoading: false,
        });
      }
    } catch (err) {
      console.error("[netStore] fetchNets exception:", err);
      set({ isLoading: false });
    }
  },

  // ── Pagination ──────────────────────────────────────────────────

  setPage: (page: number) => set({ currentPage: page }),
  setPageSize: (size: number) => set({ pageSize: size, currentPage: 0 }),

  // ── Fetch Single Net ─────────────────────────────────────────────

  fetchNet: async (netId: string) => {
    if (!isSupabaseConfigured) return null;

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("nets")
        .select("*")
        .eq("id", netId)
        .single();

      if (error || !data) {
        console.error("[netStore] fetchNet error:", error?.message);
        return null;
      }

      const net = rowToNet(data as Record<string, unknown>);
      set({ currentNet: net });
      return net;
    } catch (err) {
      console.error("[netStore] fetchNet exception:", err);
      return null;
    }
  },

  // ── Create Net ───────────────────────────────────────────────────

  createNet: async (data: CreateNetInput) => {
    if (!isSupabaseConfigured) return null;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return null;

    try {
      const supabase = getSupabase();

      const { data: inserted, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("nets")
        .insert({
          name: data.name,
          type: data.type,
          summary: data.summary ?? null,
          description: data.description ?? "",
          frequency: data.frequency,
          alt_frequency: data.altFrequency ?? null,
          mode: data.mode,
          band: data.band,
          schedule: data.schedule ?? null,
          duration_minutes: data.durationMinutes ?? null,
          country: data.country ?? null,
          state_or_province: data.stateOrProvince ?? null,
          region: data.region ?? null,
          repeater_info: data.repeaterInfo ?? null,
          preamble_template: data.preambleTemplate ?? null,
          tags: data.tags ?? [],
          visibility: data.visibility ?? "public",
          website_url: data.websiteUrl ?? null,
          formality_level: data.formalityLevel ?? null,
          protocol_notes: data.protocolNotes ?? null,
          newcomer_friendly: data.newcomerFriendly ?? true,
          echolink_node: data.echolinkNode ?? null,
          allstar_node: data.allstarNode ?? null,
          irlp_node: data.irlpNode ?? null,
          subscriber_count: 0,
          created_by: userId,
        })
        .select()
        .single();

      if (error || !inserted) {
        console.error("[netStore] createNet error:", error?.message);
        return null;
      }

      const netId = (inserted as Record<string, unknown>).id as string;

      // Insert creator as owner in net_managers
      const { error: managerError } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_managers")
        .insert({
          net_id: netId,
          user_id: userId,
          role: "owner",
        });

      if (managerError) {
        console.error(
          "[netStore] createNet manager insert error:",
          managerError.message,
        );
      }

      return netId;
    } catch (err) {
      console.error("[netStore] createNet exception:", err);
      return null;
    }
  },

  // ── Update Net ───────────────────────────────────────────────────

  updateNet: async (netId: string, data: Partial<CreateNetInput>) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.type !== undefined) updates.type = data.type;
      if (data.summary !== undefined) updates.summary = data.summary;
      if (data.description !== undefined)
        updates.description = data.description;
      if (data.frequency !== undefined) updates.frequency = data.frequency;
      if (data.altFrequency !== undefined)
        updates.alt_frequency = data.altFrequency;
      if (data.mode !== undefined) updates.mode = data.mode;
      if (data.band !== undefined) updates.band = data.band;
      if (data.schedule !== undefined) updates.schedule = data.schedule;
      if (data.durationMinutes !== undefined)
        updates.duration_minutes = data.durationMinutes;
      if (data.country !== undefined) updates.country = data.country;
      if (data.stateOrProvince !== undefined)
        updates.state_or_province = data.stateOrProvince;
      if (data.region !== undefined) updates.region = data.region;
      if (data.repeaterInfo !== undefined)
        updates.repeater_info = data.repeaterInfo;
      if (data.preambleTemplate !== undefined)
        updates.preamble_template = data.preambleTemplate;
      if (data.tags !== undefined) updates.tags = data.tags;
      if (data.visibility !== undefined) updates.visibility = data.visibility;
      if (data.websiteUrl !== undefined) updates.website_url = data.websiteUrl;
      if (data.formalityLevel !== undefined)
        updates.formality_level = data.formalityLevel;
      if (data.protocolNotes !== undefined)
        updates.protocol_notes = data.protocolNotes;
      if (data.newcomerFriendly !== undefined)
        updates.newcomer_friendly = data.newcomerFriendly;
      if (data.echolinkNode !== undefined)
        updates.echolink_node = data.echolinkNode;
      if (data.allstarNode !== undefined)
        updates.allstar_node = data.allstarNode;
      if (data.irlpNode !== undefined) updates.irlp_node = data.irlpNode;

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("nets")
        .update(updates)
        .eq("id", netId);

      if (error) {
        console.error("[netStore] updateNet error:", error.message);
        return;
      }

      // Refresh current net if it matches
      if (get().currentNet?.id === netId) {
        await get().fetchNet(netId);
      }
    } catch (err) {
      console.error("[netStore] updateNet exception:", err);
    }
  },

  // ── Delete Net ───────────────────────────────────────────────────

  deleteNet: async (netId: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("nets")
        .delete()
        .eq("id", netId)
        .eq("created_by", userId);

      if (error) {
        console.error("[netStore] deleteNet error:", error.message);
        return;
      }

      // Remove from local state
      set((state) => ({
        nets: state.nets.filter((n) => n.id !== netId),
        currentNet: state.currentNet?.id === netId ? null : state.currentNet,
      }));
    } catch (err) {
      console.error("[netStore] deleteNet exception:", err);
    }
  },

  // ── Fetch My Subscriptions ───────────────────────────────────────

  fetchMySubscriptions: async () => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_subscriptions")
        .select("*")
        .eq("user_id", userId);

      if (error || !data) {
        console.error("[netStore] fetchMySubscriptions error:", error?.message);
        return;
      }

      set({
        subscriptions: (data as Record<string, unknown>[]).map(
          rowToSubscription,
        ),
      });
    } catch (err) {
      console.error("[netStore] fetchMySubscriptions exception:", err);
    }
  },

  // ── Subscribe to Net ─────────────────────────────────────────────

  subscribe: async (netId: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_subscriptions")
        .insert({
          user_id: userId,
          net_id: netId,
          alert_10min: true,
          alert_5min: false,
          alert_3min: false,
          show_on_profile: true,
        });

      if (error) {
        console.error("[netStore] subscribe error:", error.message);
        return;
      }

      await get().fetchMySubscriptions();
    } catch (err) {
      console.error("[netStore] subscribe exception:", err);
    }
  },

  // ── Unsubscribe from Net ─────────────────────────────────────────

  unsubscribe: async (netId: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("net_id", netId);

      if (error) {
        console.error("[netStore] unsubscribe error:", error.message);
        return;
      }

      // Optimistically remove from local state
      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.netId !== netId),
      }));
    } catch (err) {
      console.error("[netStore] unsubscribe exception:", err);
    }
  },

  // ── Update Subscription Preferences ──────────────────────────────

  updateSubscription: async (
    netId: string,
    prefs: Partial<
      Pick<
        NetSubscription,
        "alert10min" | "alert5min" | "alert3min" | "showOnProfile"
      >
    >,
  ) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const updates: Record<string, unknown> = {};
      if (prefs.alert10min !== undefined)
        updates.alert_10min = prefs.alert10min;
      if (prefs.alert5min !== undefined) updates.alert_5min = prefs.alert5min;
      if (prefs.alert3min !== undefined) updates.alert_3min = prefs.alert3min;
      if (prefs.showOnProfile !== undefined)
        updates.show_on_profile = prefs.showOnProfile;

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_subscriptions")
        .update(updates)
        .eq("user_id", userId)
        .eq("net_id", netId);

      if (error) {
        console.error("[netStore] updateSubscription error:", error.message);
        return;
      }

      await get().fetchMySubscriptions();
    } catch (err) {
      console.error("[netStore] updateSubscription exception:", err);
    }
  },

  // ── Is Subscribed (synchronous check) ────────────────────────────

  isSubscribed: (netId: string) => {
    return get().subscriptions.some((s) => s.netId === netId);
  },

  // ── Fetch Managers ───────────────────────────────────────────────

  fetchManagers: async (netId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_managers")
        .select("*")
        .eq("net_id", netId);

      if (error || !data) {
        console.error("[netStore] fetchManagers error:", error?.message);
        return;
      }

      set({
        managers: (data as Record<string, unknown>[]).map(rowToManager),
      });
    } catch (err) {
      console.error("[netStore] fetchManagers exception:", err);
    }
  },

  // ── Add Manager ──────────────────────────────────────────────────

  addManager: async (netId: string, userId: string, role: NetManagerRole) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const { error } = await (supabase as unknown as NetStoreQueryClient).from("net_managers").insert({
        net_id: netId,
        user_id: userId,
        role,
      });

      if (error) {
        console.error("[netStore] addManager error:", error.message);
        return;
      }

      await get().fetchManagers(netId);
    } catch (err) {
      console.error("[netStore] addManager exception:", err);
    }
  },

  // ── Remove Manager ───────────────────────────────────────────────

  removeManager: async (netId: string, userId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_managers")
        .delete()
        .eq("net_id", netId)
        .eq("user_id", userId);

      if (error) {
        console.error("[netStore] removeManager error:", error.message);
        return;
      }

      // Optimistically remove from local state
      set((state) => ({
        managers: state.managers.filter(
          (m) => !(m.netId === netId && m.userId === userId),
        ),
      }));
    } catch (err) {
      console.error("[netStore] removeManager exception:", err);
    }
  },

  // ── Is Manager (synchronous check) ──────────────────────────────

  isManager: (netId: string) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return false;
    return get().managers.some((m) => m.netId === netId && m.userId === userId);
  },

  // ── Fetch Sessions ───────────────────────────────────────────────

  fetchSessions: async (netId: string) => {
    if (!isSupabaseConfigured) return;

    set({ isLoadingSession: true });

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_sessions")
        .select("*")
        .eq("net_id", netId)
        .order("started_at", { ascending: false });

      if (error || !data) {
        console.error("[netStore] fetchSessions error:", error?.message);
        set({ isLoadingSession: false });
        return;
      }

      const sessions = (data as Record<string, unknown>[]).map(rowToSession);

      // Set currentSession to the first live session if one exists
      const liveSession = sessions.find((s) => s.status === "live") ?? null;

      set({
        sessions,
        currentSession: liveSession,
        isLoadingSession: false,
      });
    } catch (err) {
      console.error("[netStore] fetchSessions exception:", err);
      set({ isLoadingSession: false });
    }
  },

  // ── Start Session ────────────────────────────────────────────────

  startSession: async (netId: string) => {
    if (!isSupabaseConfigured) return null;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return null;

    const callsign = useProfileStore.getState().station?.callsign ?? "UNKNOWN";

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_sessions")
        .insert({
          net_id: netId,
          ncs_user_id: userId,
          ncs_callsign: callsign,
          started_at: new Date().toISOString(),
          status: "live",
          checkin_count: 0,
        })
        .select()
        .single();

      if (error || !data) {
        console.error("[netStore] startSession error:", error?.message);
        return null;
      }

      const session = rowToSession(data as Record<string, unknown>);
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
      }));

      return session.id;
    } catch (err) {
      console.error("[netStore] startSession exception:", err);
      return null;
    }
  },

  // ── Update Session (lightweight partial update) ──────────────────

  updateSession: async (sessionId: string, updates: { notes?: string }) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const dbUpdates: Record<string, unknown> = {};
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

      if (Object.keys(dbUpdates).length === 0) return;

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_sessions")
        .update(dbUpdates)
        .eq("id", sessionId);

      if (error) {
        console.error("[netStore] updateSession error:", error.message);
        return;
      }

      // Optimistically update local state
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, notes: updates.notes ?? s.notes } : s,
        ),
        currentSession:
          state.currentSession?.id === sessionId
            ? {
                ...state.currentSession,
                notes: updates.notes ?? state.currentSession.notes,
              }
            : state.currentSession,
      }));
    } catch (err) {
      console.error("[netStore] updateSession exception:", err);
    }
  },

  // ── End Session ──────────────────────────────────────────────────

  endSession: async (sessionId: string, notes?: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const endedAt = new Date().toISOString();
      const checkins = get().checkins.filter((c) => c.sessionId === sessionId);

      // Find the session start time to compute duration
      const session = get().sessions.find((s) => s.id === sessionId);
      const startedAt = session?.startedAt
        ? new Date(session.startedAt).getTime()
        : Date.now();
      const durationMinutes = Math.round(
        (Date.now() - startedAt) / (1000 * 60),
      );

      // Compute rich summary data
      const uniqueCallsigns = new Set(checkins.map((c) => c.callsign)).size;
      const relayCount = checkins.filter((c) => c.isRelay).length;
      const peakQueueDepth =
        checkins.length > 0
          ? Math.max(...checkins.map((c) => c.queuePosition))
          : 0;

      const statusBreakdown = {
        completed: checkins.filter((c) => c.status === "completed").length,
        skipped: checkins.filter((c) => c.status === "skipped").length,
        checked_in: checkins.filter((c) => c.status === "checked_in").length,
        had_turn: checkins.filter((c) => c.status === "had_turn").length,
      };

      const summaryData = {
        totalCheckins: checkins.length,
        uniqueCallsigns,
        durationMinutes,
        relayCount,
        peakQueueDepth,
        statusBreakdown,
      };

      const summary = JSON.stringify(summaryData);

      const updates: Record<string, unknown> = {
        status: "completed" as SessionStatus,
        ended_at: endedAt,
        summary,
      };
      if (notes !== undefined) {
        updates.notes = notes;
      }

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_sessions")
        .update(updates)
        .eq("id", sessionId);

      if (error) {
        console.error("[netStore] endSession error:", error.message);
        return;
      }

      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                status: "completed" as SessionStatus,
                endedAt,
                notes: notes ?? s.notes,
                summary,
              }
            : s,
        ),
        currentSession:
          state.currentSession?.id === sessionId ? null : state.currentSession,
      }));
    } catch (err) {
      console.error("[netStore] endSession exception:", err);
    }
  },

  // ── Fetch Check-ins ──────────────────────────────────────────────

  fetchCheckins: async (sessionId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_checkins")
        .select("*")
        .eq("session_id", sessionId)
        .order("queue_position", { ascending: true });

      if (error || !data) {
        console.error("[netStore] fetchCheckins error:", error?.message);
        return;
      }

      set({
        checkins: (data as Record<string, unknown>[]).map(rowToCheckin),
      });
    } catch (err) {
      console.error("[netStore] fetchCheckins exception:", err);
    }
  },

  // ── Add Check-in ─────────────────────────────────────────────────

  addCheckin: async (
    sessionId: string,
    callsign: string,
    opts?: CheckinOpts,
  ) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      // Determine next queue position
      const currentCheckins = get().checkins.filter(
        (c) => c.sessionId === sessionId,
      );
      const maxPosition =
        currentCheckins.length > 0
          ? Math.max(...currentCheckins.map((c) => c.queuePosition))
          : 0;
      const nextPosition = maxPosition + 1;

      const { error } = await (supabase as unknown as NetStoreQueryClient).from("net_checkins").insert({
        session_id: sessionId,
        callsign,
        checked_in_at: new Date().toISOString(),
        status: "checked_in",
        is_relay: opts?.isRelay ?? false,
        relay_via: opts?.relayVia ?? null,
        traffic_notes: opts?.trafficNotes ?? null,
        queue_position: nextPosition,
      });

      if (error) {
        console.error("[netStore] addCheckin error:", error.message);
        return;
      }

      await get().fetchCheckins(sessionId);
    } catch (err) {
      console.error("[netStore] addCheckin exception:", err);
    }
  },

  // ── Update Check-in ──────────────────────────────────────────────

  updateCheckin: async (
    checkinId: string,
    data: Partial<{
      status: CheckinStatus;
      trafficNotes: string;
      isRelay: boolean;
      relayVia: string;
    }>,
  ) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const updates: Record<string, unknown> = {};
      if (data.status !== undefined) updates.status = data.status;
      if (data.trafficNotes !== undefined)
        updates.traffic_notes = data.trafficNotes;
      if (data.isRelay !== undefined) updates.is_relay = data.isRelay;
      if (data.relayVia !== undefined) updates.relay_via = data.relayVia;

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_checkins")
        .update(updates)
        .eq("id", checkinId);

      if (error) {
        console.error("[netStore] updateCheckin error:", error.message);
        return;
      }

      // Optimistically update local state
      set((state) => ({
        checkins: state.checkins.map((c) =>
          c.id === checkinId
            ? {
                ...c,
                status: data.status ?? c.status,
                trafficNotes: data.trafficNotes ?? c.trafficNotes,
                isRelay: data.isRelay ?? c.isRelay,
                relayVia: data.relayVia ?? c.relayVia,
              }
            : c,
        ),
      }));
    } catch (err) {
      console.error("[netStore] updateCheckin exception:", err);
    }
  },

  // ── Remove Check-in ──────────────────────────────────────────────

  removeCheckin: async (checkinId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_checkins")
        .delete()
        .eq("id", checkinId);

      if (error) {
        console.error("[netStore] removeCheckin error:", error.message);
        return;
      }

      // Optimistically remove from local state
      set((state) => ({
        checkins: state.checkins.filter((c) => c.id !== checkinId),
      }));
    } catch (err) {
      console.error("[netStore] removeCheckin exception:", err);
    }
  },

  // ── Reorder Queue ────────────────────────────────────────────────

  reorderQueue: async (
    sessionId: string,
    checkinId: string,
    newPosition: number,
  ) => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    const queryClient = supabase as unknown as NetStoreQueryClient;

    // Get current checkins for this session, sorted by position
    const currentCheckins = get()
      .checkins.filter((c) => c.sessionId === sessionId)
      .sort((a, b) => a.queuePosition - b.queuePosition);

    // Find the item being moved
    const movedIndex = currentCheckins.findIndex((c) => c.id === checkinId);
    if (movedIndex === -1) return;

    // Remove from old position and insert at new position
    const [moved] = currentCheckins.splice(movedIndex, 1);
    // Clamp newPosition to valid range (1-based)
    const clampedPos = Math.max(
      1,
      Math.min(newPosition, currentCheckins.length + 1),
    );
    currentCheckins.splice(clampedPos - 1, 0, moved);

    // Re-number all positions
    const updates: PromiseLike<unknown>[] = [];
    for (let i = 0; i < currentCheckins.length; i++) {
      const newPos = i + 1;
      if (currentCheckins[i].queuePosition !== newPos) {
        updates.push(
          queryClient
            .from("net_checkins")
            .update({ queue_position: newPos })
            .eq("id", currentCheckins[i].id)
            .then(() => {}),
        );
      }
    }

    try {
      await Promise.all(updates);
      // Optimistically update local state
      const updatedCheckins = get().checkins.map((c) => {
        if (c.sessionId !== sessionId) return c;
        const idx = currentCheckins.findIndex((cc) => cc.id === c.id);
        return idx !== -1 ? { ...c, queuePosition: idx + 1 } : c;
      });
      set({ checkins: updatedCheckins });
    } catch (err) {
      console.error("reorderQueue failed:", err);
      // Refetch to restore consistent state
      const { fetchCheckins } = get();
      await fetchCheckins(sessionId);
    }
  },

  // ── Fetch Calendar Token ────────────────────────────────────────

  fetchCalendarToken: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId || !isSupabaseConfigured) return;

    set({ isLoadingCalendarToken: true });
    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("calendar_tokens")
        .select("token")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        set({
          calendarToken: (data as Record<string, unknown>).token as string,
        });
      }
    } finally {
      set({ isLoadingCalendarToken: false });
    }
  },

  // ── Generate Calendar Token ───────────────────────────────────

  generateCalendarToken: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId || !isSupabaseConfigured) return null;

    // Generate 32 random bytes → 64 hex chars
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    const supabase = getSupabase();

    // Delete any existing token for this user first (one token per user)
    await (supabase as unknown as NetStoreQueryClient)
      .from("calendar_tokens")
      .delete()
      .eq("user_id", userId);

    // Insert new token
    const { error } = await (supabase as unknown as NetStoreQueryClient).from("calendar_tokens").insert({
      user_id: userId,
      token,
    });

    if (error) {
      console.error(
        "[netStore] Failed to generate calendar token:",
        error.message,
      );
      return null;
    }

    set({ calendarToken: token });
    return token;
  },

  // ── Revoke Calendar Token ─────────────────────────────────────

  revokeCalendarToken: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId || !isSupabaseConfigured) return;

    const supabase = getSupabase();

    await (supabase as unknown as NetStoreQueryClient)
      .from("calendar_tokens")
      .delete()
      .eq("user_id", userId);

    set({ calendarToken: null });
  },

  // ── Fetch Callsign History (auto-complete) ─────────────────────

  fetchCallsignHistory: async (netId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const sessionIdRowsResult = await (supabase as unknown as NetStoreQueryClient)
        .from("net_sessions")
        .select("id")
        .eq("net_id", netId);
      const sessionIdRows = Array.isArray(sessionIdRowsResult.data)
        ? sessionIdRowsResult.data
        : [];
      const sessionIds = sessionIdRows
        .filter(isObjectRecord)
        .map((row) => (typeof row.id === "string" ? row.id : ""))
        .filter((id) => id.length > 0);

      // Fetch distinct callsigns from all sessions belonging to this net
      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_checkins")
        .select("callsign, session_id")
        .in("session_id", sessionIds)
        .order("callsign", { ascending: true });

      if (error || !data) {
        console.error("[netStore] fetchCallsignHistory error:", error?.message);
        set({ callsignHistory: [] });
        return;
      }

      // Extract unique callsigns
      const unique = [
        ...new Set(
          (data as Record<string, unknown>[]).map((r) => r.callsign as string),
        ),
      ].sort();

      set({ callsignHistory: unique });
    } catch (err) {
      console.error("[netStore] fetchCallsignHistory exception:", err);
      set({ callsignHistory: [] });
    }
  },

  // ── Fetch RSVPs ─────────────────────────────────────────────────

  fetchRsvps: async (netId: string, date: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_rsvps")
        .select("*")
        .eq("net_id", netId)
        .eq("session_date", date);

      if (error || !data) {
        console.error("[netStore] fetchRsvps error:", error?.message);
        return;
      }

      set({
        rsvps: (data as Record<string, unknown>[]).map(rowToRsvp),
      });
    } catch (err) {
      console.error("[netStore] fetchRsvps exception:", err);
    }
  },

  // ── Add RSVP ──────────────────────────────────────────────────────

  addRsvp: async (netId: string, date: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const { data, error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_rsvps")
        .insert({
          net_id: netId,
          user_id: userId,
          session_date: date,
        })
        .select()
        .single();

      if (error || !data) {
        console.error("[netStore] addRsvp error:", error?.message);
        return;
      }

      const rsvp = rowToRsvp(data as Record<string, unknown>);
      set((state) => ({
        rsvps: [...state.rsvps, rsvp],
      }));
    } catch (err) {
      console.error("[netStore] addRsvp exception:", err);
    }
  },

  // ── Remove RSVP ───────────────────────────────────────────────────

  removeRsvp: async (netId: string, date: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const { error } = await (supabase as unknown as NetStoreQueryClient)
        .from("net_rsvps")
        .delete()
        .eq("net_id", netId)
        .eq("user_id", userId)
        .eq("session_date", date);

      if (error) {
        console.error("[netStore] removeRsvp error:", error.message);
        return;
      }

      set((state) => ({
        rsvps: state.rsvps.filter(
          (r) =>
            !(
              r.netId === netId &&
              r.userId === userId &&
              r.sessionDate === date
            ),
        ),
      }));
    } catch (err) {
      console.error("[netStore] removeRsvp exception:", err);
    }
  },

  // ── Get RSVP Count (synchronous) ──────────────────────────────────

  getRsvpCount: (netId: string, date: string) => {
    return get().rsvps.filter(
      (r) => r.netId === netId && r.sessionDate === date,
    ).length;
  },

  // ── Has RSVPd (synchronous) ───────────────────────────────────────

  hasRsvpd: (netId: string, date: string) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return false;
    return get().rsvps.some(
      (r) => r.netId === netId && r.userId === userId && r.sessionDate === date,
    );
  },

  // ── Managed Nets (Net Controller) ────────────────────────────────

  fetchMyManagedNets: async () => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    set({ isLoadingManagedNets: true });

    try {
      const supabase = getSupabase();
      const queryClient = supabase as unknown as NetStoreQueryClient;

      // 1. Fetch manager records for current user
      const { data: managerRowsRaw, error: mgrErr } = await queryClient
        .from("net_managers")
        .select("*")
        .eq("user_id", userId);

      if (mgrErr) {
        console.error("[netStore] fetchMyManagedNets manager query:", mgrErr);
        set({ managedNets: [], isLoadingManagedNets: false });
        return;
      }

      const managerRows = Array.isArray(managerRowsRaw)
        ? managerRowsRaw.filter(isObjectRecord)
        : [];

      const managerEntries = managerRows.flatMap((row) => {
        const netId = typeof row.net_id === "string" ? row.net_id : "";
        if (!netId) return [];
        return [
          {
            netId,
            role: isNetManagerRoleValue(row.role) ? row.role : ("ncs" as const),
          },
        ];
      });

      if (managerEntries.length === 0) {
        set({ managedNets: [], isLoadingManagedNets: false });
        return;
      }

      const netIds = managerEntries.map((entry) => entry.netId);
      const roleMap = new Map<string, NetManagerRole>(
        managerEntries.map((entry) => [entry.netId, entry.role]),
      );

      // 2. Fetch net details
      const { data: netRowsRaw, error: netErr } = await queryClient
        .from("nets")
        .select("*")
        .in("id", netIds);
      if (netErr) {
        console.error("[netStore] fetchMyManagedNets nets query:", netErr);
        set({ managedNets: [], isLoadingManagedNets: false });
        return;
      }

      const netRows = Array.isArray(netRowsRaw)
        ? netRowsRaw.filter(isObjectRecord)
        : [];

      // 3. Check for live sessions
      const { data: liveRowsRaw, error: liveErr } = await queryClient
        .from("net_sessions")
        .select("net_id")
        .in("net_id", netIds)
        .eq("status", "live");
      if (liveErr) {
        console.error("[netStore] fetchMyManagedNets live sessions query:", liveErr);
        set({ managedNets: [], isLoadingManagedNets: false });
        return;
      }

      const liveNetIds = new Set(
        (Array.isArray(liveRowsRaw) ? liveRowsRaw : [])
          .filter(isObjectRecord)
          .map((row) => (typeof row.net_id === "string" ? row.net_id : ""))
          .filter((netId) => netId.length > 0),
      );

      const managedNets = netRows.flatMap((row) => {
        const netId = typeof row.id === "string" ? row.id : "";
        if (!netId) return [];
        return [
          {
            net: rowToNet(row),
            role: roleMap.get(netId) ?? ("ncs" as NetManagerRole),
            hasLiveSession: liveNetIds.has(netId),
          },
        ];
      });

      set({ managedNets, isLoadingManagedNets: false });
    } catch (err) {
      console.error("[netStore] fetchMyManagedNets:", err);
      set({ isLoadingManagedNets: false });
    }
  },

  // ── Reset ────────────────────────────────────────────────────────

  reset: () => set(initialState),
}));
