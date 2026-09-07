/** SP-06: pure path-motion scheduler. No React, I/O, or renderer clocks. */
import { createSpotPreferences } from "@/lib/views/defaults";
import type {
  PathAppearance,
  PathDescriptor,
  SpotPresentationPreferences,
} from "@/lib/views/spotContracts";

export type PathMotionPreferences = SpotPresentationPreferences["paths"];
export type MotionStyle = PathAppearance["style"];
export type AnimateScope = PathMotionPreferences["animate"];

export interface MotionPathInput {
  path: PathDescriptor;
  selected: boolean;
}

export interface MotionTickInput {
  nowMs: number;
  ready: boolean;
  visible: boolean;
  osReducedMotion: boolean;
  paths: readonly MotionPathInput[];
  preferences: PathMotionPreferences;
  /** Mapped report identities currently displayed. Motion drops never edit this list. */
  displayedReportIds: readonly string[];
  /** Every report identity observed in the feed, including filtered-out rows. */
  observedReportIds?: readonly string[];
}

export type MotionStaticReason =
  | "off"
  | "unknown-direction"
  | "reduced-motion"
  | "hidden"
  | "hydration"
  | "budget"
  | "unselected"
  | "not-new";

export interface MotionPresentation {
  pathId: string;
  reportIds: readonly string[];
  appearance: PathAppearance;
  selected: boolean;
  /** Null means draw the full static path; adapters must not invent a direction. */
  travelProgress: number | null;
  trailOpacity: number;
  dashOffset: number;
  pulseStrength: number;
  bobOffset: number;
  arrivalPulse: boolean;
  bounceGlow: boolean;
  repeating: boolean;
  /** Present only while this path is in the active motion set. */
  startedAtMs: number | null;
  staticReason?: MotionStaticReason;
}

export interface MotionSnapshot {
  presentations: MotionPresentation[];
  activePathIds: readonly string[];
  pendingPathIds: readonly string[];
  activeCount: number;
  pendingCount: number;
  droppedPendingCount: number;
  displayedReportIds: readonly string[];
  hydrated: boolean;
  motionSuppressed: boolean;
}

type MotionQueueKind = "arrival" | "continuous";

interface PendingItem {
  pathId: string;
  reportId: string;
  enqueuedAtMs: number;
  kind: MotionQueueKind;
}

interface ActiveItem {
  pathId: string;
  reportId: string;
  startedAtMs: number;
  appearance: PathAppearance;
  repeating: boolean;
  kind: MotionQueueKind;
}

export interface MotionRuntime {
  hydrated: boolean;
  seenReportIds: Set<string>;
  pending: PendingItem[];
  active: ActiveItem[];
  droppedPendingCount: number;
}

const DEFAULT_PREFERENCES = createSpotPreferences().paths;
const REPEATING_STYLES: ReadonlySet<MotionStyle> = new Set([
  "traveling-pulse",
  "flowing-dashes",
]);

export function defaultPathMotionPreferences(): PathMotionPreferences {
  return DEFAULT_PREFERENCES;
}

export function resolvePathAppearance(
  preferences: PathMotionPreferences,
  selected: boolean,
): PathAppearance {
  return selected && preferences.selected ? preferences.selected : preferences.background;
}

export function motionIsSuppressed(
  osReducedMotion: boolean,
  reduceMotion: boolean,
): boolean {
  return osReducedMotion || reduceMotion;
}

export function createMotionRuntime(): MotionRuntime {
  return {
    hydrated: false,
    seenReportIds: new Set(),
    pending: [],
    active: [],
    droppedPendingCount: 0,
  };
}

export function resetMotionRuntime(runtime: MotionRuntime): void {
  runtime.hydrated = false;
  runtime.seenReportIds = new Set();
  runtime.pending = [];
  runtime.active = [];
  runtime.droppedPendingCount = 0;
}

function repeatingFor(style: MotionStyle, animate: AnimateScope): boolean {
  return REPEATING_STYLES.has(style) && animate !== "new-spots";
}

export function repeatingCycleMs(appearance: PathAppearance): number {
  return Math.max(appearance.repeatSeconds * 1000, appearance.travelSeconds * 1000);
}

function cycleSeconds(appearance: PathAppearance): number {
  if (appearance.style === "flowing-dashes") return appearance.travelSeconds;
  return appearance.travelSeconds + appearance.trailSeconds + appearance.fadeSeconds;
}

/** Identity for adapter React state: excludes per-frame sampled progress. */
export function motionTraceSignature(presentation: MotionPresentation): string {
  const a = presentation.appearance;
  return [
    presentation.pathId,
    presentation.travelProgress === null ? "static" : "motion",
    a.shape,
    a.style,
    a.travelSeconds,
    a.trailSeconds,
    a.fadeSeconds,
    a.repeatSeconds,
    a.arrivalPulse ? "1" : "0",
    a.bounceGlow ? "1" : "0",
    presentation.repeating ? "1" : "0",
    presentation.startedAtMs ?? "",
  ].join(":");
}

export function sampleAppearance(
  appearance: PathAppearance,
  rawElapsedMs: number,
  repeating: boolean,
): Pick<
  MotionPresentation,
  | "travelProgress"
  | "trailOpacity"
  | "dashOffset"
  | "pulseStrength"
  | "bobOffset"
  | "arrivalPulse"
  | "bounceGlow"
> {
  const elapsedMs = Math.max(0, rawElapsedMs);
  const travelMs = appearance.travelSeconds * 1000;
  const trailMs = appearance.trailSeconds * 1000;
  const fadeMs = appearance.fadeSeconds * 1000;
  const bounceGlow = appearance.bounceGlow;
  if (appearance.style === "off") {
    return {
      travelProgress: null,
      trailOpacity: 1,
      dashOffset: 0,
      pulseStrength: 0,
      bobOffset: 0,
      arrivalPulse: false,
      bounceGlow: false,
    };
  }
  if (appearance.style === "flowing-dashes") {
    const t = travelMs <= 0 ? 0 : ((elapsedMs % travelMs) + travelMs) % travelMs;
    const progress = travelMs <= 0 ? 0 : t / travelMs;
    return {
      travelProgress: progress,
      trailOpacity: 1,
      dashOffset: progress,
      pulseStrength: 0,
      bobOffset: bounceGlow ? 0.02 * Math.sin((elapsedMs / 1000) * Math.PI * 2) : 0,
      arrivalPulse: false,
      bounceGlow,
    };
  }
  if (repeating) {
    const cycleMs = repeatingCycleMs(appearance);
    const t = cycleMs <= 0 ? 0 : elapsedMs % cycleMs;
    if (t < travelMs) {
      const progress = travelMs <= 0 ? 1 : t / travelMs;
      return {
        travelProgress: progress,
        trailOpacity: 1,
        dashOffset: 0,
        pulseStrength: appearance.style === "traveling-pulse" ? 1 : 0,
        bobOffset: bounceGlow ? 0.02 * Math.sin(progress * Math.PI) : 0,
        arrivalPulse: appearance.arrivalPulse && progress >= 0.85,
        bounceGlow,
      };
    }
    return {
      travelProgress: 1,
      trailOpacity: 1,
      dashOffset: 0,
      pulseStrength: 0,
      bobOffset: 0,
      arrivalPulse: false,
      bounceGlow,
    };
  }
  const t = elapsedMs;
  if (t < travelMs) {
    const progress = travelMs <= 0 ? 1 : t / travelMs;
    return {
      travelProgress: progress,
      trailOpacity: 1,
      dashOffset: 0,
      pulseStrength: appearance.style === "traveling-pulse" ? 1 : 0,
      bobOffset: bounceGlow ? 0.02 * Math.sin(progress * Math.PI) : 0,
      arrivalPulse: appearance.arrivalPulse && progress >= 0.85,
      bounceGlow,
    };
  }
  if (t < travelMs + trailMs) {
    return {
      travelProgress: 1,
      trailOpacity: 1,
      dashOffset: 0,
      pulseStrength: 0,
      bobOffset: 0,
      arrivalPulse: false,
      bounceGlow,
    };
  }
  const fadeT = fadeMs <= 0 ? 1 : Math.min(1, (t - travelMs - trailMs) / fadeMs);
  return {
    travelProgress: 1,
    trailOpacity: 1 - fadeT,
    dashOffset: 0,
    pulseStrength: 0,
    bobOffset: 0,
    arrivalPulse: false,
    bounceGlow: false,
  };
}

interface MotionPolicyArgs {
  path: PathDescriptor;
  selected: boolean;
  appearance: PathAppearance;
  animate: AnimateScope;
  suppressed: boolean;
  visible: boolean;
  hydrated: boolean;
}

function policyAllowsMotion(args: MotionPolicyArgs): boolean {
  if (!args.visible || !args.hydrated || args.suppressed) return false;
  if (args.path.direction !== "from-to") return false;
  if (args.appearance.style === "off") return false;
  if (args.animate === "selected-only" && !args.selected) return false;
  return true;
}

function wantsAnimation(args: MotionPolicyArgs & { unseen: boolean }): boolean {
  if (!policyAllowsMotion(args)) return false;
  if (args.animate === "selected-only") return true;
  if (args.animate === "all-displayed") {
    return repeatingFor(args.appearance.style, args.animate) || args.unseen;
  }
  return args.unseen;
}

function queueStillEligible(
  kind: MotionQueueKind,
  args: MotionPolicyArgs,
): boolean {
  if (!policyAllowsMotion(args)) return false;
  if (kind === "continuous") return wantsAnimation({ ...args, unseen: false });
  return true;
}

function staticReason(args: {
  path: PathDescriptor;
  selected: boolean;
  unseen: boolean;
  appearance: PathAppearance;
  animate: AnimateScope;
  suppressed: boolean;
  visible: boolean;
  hydrated: boolean;
  budgetedOut: boolean;
}): MotionStaticReason | undefined {
  if (!args.visible) return "hidden";
  if (args.suppressed) return "reduced-motion";
  if (!args.hydrated) return "hydration";
  if (args.path.direction !== "from-to") return "unknown-direction";
  if (args.appearance.style === "off") return "off";
  if (args.animate === "selected-only" && !args.selected) return "unselected";
  if (args.budgetedOut) return "budget";
  if (args.animate === "new-spots" && !args.unseen) return "not-new";
  if (args.animate === "all-displayed" && !repeatingFor(args.appearance.style, args.animate) && !args.unseen) {
    return "not-new";
  }
  return "hydration";
}

export function tickMotion(runtime: MotionRuntime, input: MotionTickInput): MotionSnapshot {
  const preferences = input.preferences;
  const maxActive = Math.min(12, Math.max(1, preferences.maxActive));
  const maxPending = Math.min(100, Math.max(0, preferences.maxPending));
  const suppressed = motionIsSuppressed(input.osReducedMotion, preferences.reduceMotion);
  const displayedReportIds = [...input.displayedReportIds];
  const observedReportIds = [...(input.observedReportIds ?? displayedReportIds)];
  const pathById = new Map(input.paths.map((entry) => [entry.path.id, entry]));
  const displayedPathIds = new Set(input.paths.map((entry) => entry.path.id));
  const becomingHydrated = !runtime.hydrated && input.ready;

  if (!input.visible || suppressed) {
    runtime.pending = [];
    runtime.active = [];
  }

  if (!runtime.hydrated) {
    if (input.ready) {
      for (const reportId of observedReportIds) runtime.seenReportIds.add(reportId);
      runtime.hydrated = true;
    }
  } else {
    for (const reportId of observedReportIds) {
      if (runtime.seenReportIds.has(reportId)) continue;
      runtime.seenReportIds.add(reportId);
      const path = input.paths.find((entry) => entry.path.reportIds.includes(reportId));
      if (!path) continue;
      const appearance = resolvePathAppearance(preferences, path.selected);
      if (
        wantsAnimation({
          path: path.path,
          selected: path.selected,
          unseen: true,
          appearance,
          animate: preferences.animate,
          suppressed,
          visible: input.visible,
          hydrated: true,
        })
      ) {
        runtime.pending.push({
          pathId: path.path.id,
          reportId,
          enqueuedAtMs: input.nowMs,
          kind: "arrival",
        });
      }
    }
  }

  if (
    !becomingHydrated &&
    preferences.animate !== "new-spots" &&
    input.visible &&
    runtime.hydrated &&
    !suppressed
  ) {
    for (const entry of input.paths) {
      const appearance = resolvePathAppearance(preferences, entry.selected);
      if (
        !wantsAnimation({
          path: entry.path,
          selected: entry.selected,
          unseen: false,
          appearance,
          animate: preferences.animate,
          suppressed,
          visible: input.visible,
          hydrated: true,
        })
      ) {
        continue;
      }
      const already =
        runtime.active.some((item) => item.pathId === entry.path.id) ||
        runtime.pending.some((item) => item.pathId === entry.path.id);
      if (!already) {
        runtime.pending.push({
          pathId: entry.path.id,
          reportId: entry.path.reportIds[0] ?? entry.path.id,
          enqueuedAtMs: input.nowMs,
          kind: "continuous",
        });
      }
    }
  }

  const policyArgs = (entry: MotionPathInput): MotionPolicyArgs => ({
    path: entry.path,
    selected: entry.selected,
    appearance: resolvePathAppearance(preferences, entry.selected),
    animate: preferences.animate,
    suppressed,
    visible: input.visible,
    hydrated: runtime.hydrated,
  });

  runtime.pending = runtime.pending.filter((item) => {
    const entry = pathById.get(item.pathId);
    if (!entry || !displayedPathIds.has(item.pathId)) return false;
    return queueStillEligible(item.kind, policyArgs(entry));
  });

  runtime.active = runtime.active.filter((item) => {
    const entry = pathById.get(item.pathId);
    if (!entry || !displayedPathIds.has(item.pathId)) return false;
    const args = policyArgs(entry);
    item.appearance = args.appearance;
    item.repeating = repeatingFor(args.appearance.style, preferences.animate);
    if (input.nowMs < item.startedAtMs) item.startedAtMs = input.nowMs;
    if (!queueStillEligible(item.kind, args)) return false;
    if (item.repeating) return true;
    return Math.max(0, input.nowMs - item.startedAtMs) < cycleSeconds(args.appearance) * 1000;
  });

  if (runtime.active.length > maxActive) {
    const excess = runtime.active.splice(maxActive);
    for (let i = excess.length - 1; i >= 0; i -= 1) {
      const item = excess[i]!;
      if (runtime.pending.some((pending) => pending.pathId === item.pathId)) continue;
      runtime.pending.unshift({
        pathId: item.pathId,
        reportId: item.reportId,
        enqueuedAtMs: item.startedAtMs,
        kind: item.kind,
      });
    }
  }

  if (input.visible && !suppressed) {
    const activeIds = new Set(runtime.active.map((item) => item.pathId));
    const remaining: PendingItem[] = [];
    for (const item of runtime.pending) {
      if (runtime.active.length >= maxActive || activeIds.has(item.pathId)) {
        remaining.push(item);
        continue;
      }
      const entry = pathById.get(item.pathId);
      if (!entry) continue;
      const args = policyArgs(entry);
      if (!queueStillEligible(item.kind, args)) continue;
      runtime.active.push({
        pathId: item.pathId,
        reportId: item.reportId,
        startedAtMs: input.nowMs,
        appearance: args.appearance,
        repeating: repeatingFor(args.appearance.style, preferences.animate),
        kind: item.kind,
      });
      activeIds.add(item.pathId);
    }
    runtime.pending = remaining;
    while (runtime.pending.length > maxPending) {
      runtime.pending.shift();
      runtime.droppedPendingCount += 1;
    }
  }

  const pendingIds = new Set(runtime.pending.map((item) => item.pathId));
  const presentations: MotionPresentation[] = input.paths.map((entry) => {
    const appearance = resolvePathAppearance(preferences, entry.selected);
    const active = runtime.active.find((item) => item.pathId === entry.path.id);
    if (active) {
      const sampled = sampleAppearance(
        active.appearance,
        input.nowMs - active.startedAtMs,
        active.repeating,
      );
      return {
        pathId: entry.path.id,
        reportIds: entry.path.reportIds,
        appearance: active.appearance,
        selected: entry.selected,
        repeating: active.repeating,
        startedAtMs: active.startedAtMs,
        ...sampled,
      };
    }
    const wouldAnimate = wantsAnimation({
      path: entry.path,
      selected: entry.selected,
      unseen: false,
      appearance,
      animate: preferences.animate,
      suppressed,
      visible: input.visible,
      hydrated: runtime.hydrated,
    });
    return {
      pathId: entry.path.id,
      reportIds: entry.path.reportIds,
      appearance,
      selected: entry.selected,
      travelProgress: null,
      trailOpacity: 1,
      dashOffset: 0,
      pulseStrength: 0,
      bobOffset: 0,
      arrivalPulse: false,
      bounceGlow: false,
      repeating: false,
      startedAtMs: null,
      staticReason: staticReason({
        path: entry.path,
        selected: entry.selected,
        unseen: false,
        appearance,
        animate: preferences.animate,
        suppressed,
        visible: input.visible,
        hydrated: runtime.hydrated,
        budgetedOut: pendingIds.has(entry.path.id) || wouldAnimate,
      }),
    };
  });

  return {
    presentations,
    activePathIds: runtime.active.map((item) => item.pathId),
    pendingPathIds: runtime.pending.map((item) => item.pathId),
    activeCount: runtime.active.length,
    pendingCount: runtime.pending.length,
    droppedPendingCount: runtime.droppedPendingCount,
    displayedReportIds,
    hydrated: runtime.hydrated,
    motionSuppressed: suppressed || !input.visible,
  };
}
