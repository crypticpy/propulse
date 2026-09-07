import { describe, expect, it } from "vitest";
import { createNormalizedSpot } from "@/lib/views/fixtures";
import { createSpotPreferences } from "@/lib/views/defaults";
import { pathDescriptorSchema, type PathDescriptor } from "@/lib/views/spotContracts";
import {
  createMotionRuntime,
  defaultPathMotionPreferences,
  motionTraceSignature,
  repeatingCycleMs,
  resetMotionRuntime,
  resolvePathAppearance,
  sampleAppearance,
  tickMotion,
  type MotionPathInput,
  type MotionTickInput,
  type PathMotionPreferences,
} from "./scheduler";

function directedPath(reportId: string): PathDescriptor {
  const report = createNormalizedSpot(reportId);
  return pathDescriptorSchema.parse({
    id: `p${reportId}`,
    reportIds: [reportId],
    kind: "reported",
    from: report.dx,
    to: report.reporter,
    direction: "from-to",
    model: null,
  });
}

function unknownPath(reportId: string): PathDescriptor {
  const report = createNormalizedSpot(reportId);
  return pathDescriptorSchema.parse({
    id: `p${reportId}`,
    reportIds: [reportId],
    kind: "reported",
    from: report.dx,
    to: { ...report.reporter!, role: "posting-service" },
    direction: "unknown",
    model: null,
  });
}

function prefs(patch: Partial<PathMotionPreferences> = {}): PathMotionPreferences {
  return { ...defaultPathMotionPreferences(), ...patch };
}

function input(
  runtimePaths: MotionPathInput[],
  extra: Partial<MotionTickInput> = {},
): MotionTickInput {
  return {
    nowMs: 0,
    ready: true,
    visible: true,
    osReducedMotion: false,
    paths: runtimePaths,
    preferences: prefs(),
    displayedReportIds: runtimePaths.flatMap((entry) => [...entry.path.reportIds]),
    ...extra,
  };
}

function hydrate(runtime = createMotionRuntime(), paths: MotionPathInput[] = [{ path: directedPath("old"), selected: false }]) {
  tickMotion(runtime, input(paths, { nowMs: 0 }));
  return runtime;
}

describe("path appearance", () => {
  it("keeps shape independent of style and inherits selected null from background", () => {
    const background = createSpotPreferences().paths.background;
    const inherited = resolvePathAppearance(prefs({ selected: null }), true);
    expect(inherited).toEqual(background);
    expect(inherited.shape).toBe("simple-arc");
    expect(inherited.style).toBe("quick-sweep");
    const overridden = resolvePathAppearance(prefs(), true);
    expect(overridden.shape).toBe("ionospheric-hops");
    expect(overridden.style).toBe("traveling-pulse");
    expect(overridden.travelSeconds).toBe(1.5);
  });

  it("treats travel duration as presentation timing, not RF speed", () => {
    const appearance = prefs().background;
    expect(appearance.travelSeconds).toBe(0.6);
    const mid = sampleAppearance(appearance, 300, false);
    expect(mid.travelProgress).toBeCloseTo(0.5);
    expect(sampleAppearance({ ...appearance, style: "flowing-dashes", travelSeconds: 2.5 }, 2500, true).dashOffset)
      .toBeCloseTo(0);
    expect(sampleAppearance({ ...appearance, style: "off" }, 300, false).travelProgress).toBeNull();
    expect(sampleAppearance({ ...appearance, style: "traveling-pulse" }, 0, false).pulseStrength).toBe(1);
  });
});

describe("motion scheduler", () => {
  it("renders the initial hydration snapshot static", () => {
    const runtime = createMotionRuntime();
    const snapshot = tickMotion(runtime, input([{ path: directedPath("old"), selected: false }]));
    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.activeCount).toBe(0);
    expect(snapshot.presentations[0]?.travelProgress).toBeNull();
    expect(snapshot.presentations[0]?.staticReason).toBe("not-new");
  });

  it("waits until the feed is ready before hydrating", () => {
    const runtime = createMotionRuntime();
    const loading = tickMotion(runtime, input([], { ready: false }));
    expect(loading.hydrated).toBe(false);
    const hydrated = tickMotion(
      runtime,
      input([{ path: directedPath("existing"), selected: false }], { nowMs: 1, ready: true }),
    );
    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.activeCount).toBe(0);
  });

  it("marks filtered-out feed identities seen so a later filter include does not replay them", () => {
    const runtime = hydrate();
    const hidden = directedPath("hidden");
    tickMotion(
      runtime,
      input([{ path: directedPath("old"), selected: false }], {
        nowMs: 5,
        observedReportIds: ["old", "hidden"],
      }),
    );
    const included = tickMotion(
      runtime,
      input([{ path: directedPath("old"), selected: false }, { path: hidden, selected: false }], {
        nowMs: 15,
        observedReportIds: ["old", "hidden"],
      }),
    );
    expect(included.activePathIds).not.toContain("phidden");
  });

  it("animates a new report once and does not replay a filter toggle", () => {
    const runtime = hydrate();
    const arriving = directedPath("new");
    const old = directedPath("old");
    const started = tickMotion(
      runtime,
      input([{ path: old, selected: false }, { path: arriving, selected: false }], { nowMs: 10 }),
    );
    expect(started.activePathIds).toEqual(["pnew"]);
    tickMotion(runtime, input([{ path: old, selected: false }], { nowMs: 20 }));
    const restored = tickMotion(
      runtime,
      input([{ path: old, selected: false }, { path: arriving, selected: false }], { nowMs: 30 }),
    );
    expect(restored.activePathIds).toEqual([]);
    expect(restored.displayedReportIds).toEqual(["old", "new"]);
  });

  it("leaves unknown direction static instead of inventing transmitter-to-receiver travel", () => {
    const runtime = hydrate();
    const snapshot = tickMotion(
      runtime,
      input([{ path: directedPath("old"), selected: false }, { path: unknownPath("mystery"), selected: false }], {
        nowMs: 10,
      }),
    );
    const mystery = snapshot.presentations.find((item) => item.pathId === "pmystery");
    expect(mystery?.travelProgress).toBeNull();
    expect(mystery?.staticReason).toBe("unknown-direction");
    expect(snapshot.activePathIds).not.toContain("pmystery");
  });

  it("honors off, selected-only, and all-displayed scopes", () => {
    const runtime = hydrate();
    const a = directedPath("a");
    const b = directedPath("b");
    const off = tickMotion(
      runtime,
      input(
        [{ path: a, selected: false }, { path: b, selected: false }],
        {
          nowMs: 10,
          preferences: prefs({
            selected: null,
            background: { ...prefs().background, style: "off" },
          }),
        },
      ),
    );
    expect(off.activeCount).toBe(0);
    expect(off.presentations.every((item) => item.staticReason === "off")).toBe(true);

    const selectedRuntime = hydrate();
    const selected = tickMotion(
      selectedRuntime,
      input(
        [{ path: a, selected: true }, { path: b, selected: false }],
        {
          nowMs: 10,
          preferences: prefs({
            animate: "selected-only",
            background: { ...prefs().background, style: "flowing-dashes", travelSeconds: 2.5 },
          }),
        },
      ),
    );
    expect(selected.activePathIds).toEqual(["pa"]);
    expect(selected.presentations.find((item) => item.pathId === "pb")?.staticReason).toBe("unselected");

    const allRuntime = hydrate();
    const all = tickMotion(
      allRuntime,
      input(
        [{ path: a, selected: false }, { path: b, selected: false }],
        {
          nowMs: 10,
          preferences: prefs({
            animate: "all-displayed",
            background: { ...prefs().background, style: "flowing-dashes", travelSeconds: 2.5 },
          }),
        },
      ),
    );
    expect([...all.activePathIds].sort()).toEqual(["pa", "pb"]);
  });

  it("caps active animations at 12 and pending at 100, dropping oldest pending work only", () => {
    const runtime = hydrate();
    const paths = Array.from({ length: 130 }, (_, n) => ({
      path: directedPath(`n${n}`),
      selected: false,
    }));
    const snapshot = tickMotion(
      runtime,
      input(paths, {
        nowMs: 10,
        displayedReportIds: ["old", ...paths.map((entry) => entry.path.reportIds[0]!)],
        preferences: prefs({ maxActive: 12, maxPending: 100 }),
      }),
    );
    expect(snapshot.activeCount).toBe(12);
    expect(snapshot.pendingCount).toBe(100);
    expect(snapshot.droppedPendingCount).toBe(18);
    expect(snapshot.displayedReportIds).toHaveLength(131);
    expect(new Set(snapshot.displayedReportIds).size).toBe(131);
  });

  it("discards pending work when hidden and does not replay it on resume", () => {
    const runtime = hydrate();
    const arriving = Array.from({ length: 4 }, (_, n) => ({
      path: directedPath(`late${n}`),
      selected: false,
    }));
    tickMotion(
      runtime,
      input(arriving, { nowMs: 10, preferences: prefs({ maxActive: 1, maxPending: 10 }) }),
    );
    expect(runtime.pending.length).toBeGreaterThan(0);
    const hidden = tickMotion(runtime, input(arriving, { nowMs: 20, visible: false }));
    expect(hidden.activeCount).toBe(0);
    expect(hidden.pendingCount).toBe(0);
    const resumed = tickMotion(runtime, input(arriving, { nowMs: 30, visible: true }));
    expect(resumed.activeCount).toBe(0);
    expect(resumed.pendingCount).toBe(0);
  });

  it("stops travel, dashes, pulse and bob when reduced motion is set", () => {
    const runtime = hydrate();
    const os = tickMotion(
      runtime,
      input([{ path: directedPath("old"), selected: false }, { path: directedPath("fresh"), selected: false }], {
        nowMs: 10,
        osReducedMotion: true,
      }),
    );
    expect(os.activeCount).toBe(0);
    expect(os.motionSuppressed).toBe(true);
    expect(os.presentations.every((item) => item.travelProgress === null)).toBe(true);

    const viewRuntime = hydrate();
    const view = tickMotion(
      viewRuntime,
      input([{ path: directedPath("fresh2"), selected: false }], {
        nowMs: 10,
        preferences: prefs({ reduceMotion: true }),
      }),
    );
    expect(view.activeCount).toBe(0);
    expect(view.presentations[0]?.staticReason).toBe("reduced-motion");
  });

  it("clears a disposed runtime so a remount does not resume stale travel", () => {
    const runtime = hydrate();
    tickMotion(runtime, input([{ path: directedPath("fresh"), selected: false }], { nowMs: 10 }));
    expect(runtime.active.length).toBe(1);
    resetMotionRuntime(runtime);
    const again = tickMotion(runtime, input([{ path: directedPath("fresh"), selected: false }], { nowMs: 20 }));
    expect(again.activeCount).toBe(0);
    expect(again.hydrated).toBe(true);
  });

  it("keeps projection-agnostic timing after a settings update", () => {
    const runtime = hydrate();
    tickMotion(
      runtime,
      input([{ path: directedPath("fresh"), selected: true }], {
        nowMs: 10,
        preferences: prefs({ animate: "selected-only" }),
      }),
    );
    const updated = tickMotion(
      runtime,
      input([{ path: directedPath("fresh"), selected: true }], {
        nowMs: 20,
        preferences: prefs({
          animate: "selected-only",
          selected: {
            ...prefs().selected!,
            travelSeconds: 4,
            style: "traveling-pulse",
            repeatSeconds: 8,
          },
        }),
      }),
    );
    const pulse = updated.presentations[0];
    expect(pulse?.appearance.travelSeconds).toBe(4);
    expect(pulse?.repeating).toBe(true);
    expect(pulse?.appearance.style).toBe("traveling-pulse");
  });

  it("expires one-shot sweeps and repeats traveling pulse on the selected path", () => {
    const runtime = hydrate();
    tickMotion(
      runtime,
      input([{ path: directedPath("fresh"), selected: false }], {
        nowMs: 0,
        preferences: prefs({
          background: { ...prefs().background, travelSeconds: 0.5, trailSeconds: 0.2, fadeSeconds: 0.1 },
        }),
      }),
    );
    const done = tickMotion(
      runtime,
      input([{ path: directedPath("fresh"), selected: false }], {
        nowMs: 900,
        preferences: prefs({
          background: { ...prefs().background, travelSeconds: 0.5, trailSeconds: 0.2, fadeSeconds: 0.1 },
        }),
      }),
    );
    expect(done.activeCount).toBe(0);

    const pulseRuntime = hydrate();
    const pulse = tickMotion(
      pulseRuntime,
      input([{ path: directedPath("sel"), selected: true }], {
        nowMs: 0,
        preferences: prefs({
          animate: "selected-only",
          selected: { ...prefs().selected!, style: "traveling-pulse", travelSeconds: 1.5, repeatSeconds: 3 },
        }),
      }),
    );
    expect(pulse.activeCount).toBe(1);
    const later = tickMotion(
      pulseRuntime,
      input([{ path: directedPath("sel"), selected: true }], {
        nowMs: 10_000,
        preferences: prefs({
          animate: "selected-only",
          selected: { ...prefs().selected!, style: "traveling-pulse", travelSeconds: 1.5, repeatSeconds: 3 },
        }),
      }),
    );
    expect(later.activeCount).toBe(1);
    expect(later.presentations[0]?.repeating).toBe(true);
  });

  it("immediately clears active and pending motion when reduced motion is enabled", () => {
    const runtime = hydrate();
    const arriving = Array.from({ length: 4 }, (_, n) => ({
      path: directedPath(`live${n}`),
      selected: false,
    }));
    const moving = tickMotion(
      runtime,
      input(arriving, { nowMs: 10, preferences: prefs({ maxActive: 1, maxPending: 10 }) }),
    );
    expect(moving.activeCount).toBe(1);
    expect(moving.pendingCount).toBeGreaterThan(0);
    const saved = prefs({ reduceMotion: true, maxActive: 1, maxPending: 10 });
    const stopped = tickMotion(
      runtime,
      input(arriving, { nowMs: 20, preferences: saved }),
    );
    expect(stopped.activeCount).toBe(0);
    expect(stopped.pendingCount).toBe(0);
    expect(stopped.presentations.every((item) => item.travelProgress === null)).toBe(true);
    expect(stopped.presentations.every((item) => item.staticReason === "reduced-motion")).toBe(true);
    expect(stopped.displayedReportIds).toEqual(moving.displayedReportIds);
    expect(saved.reduceMotion).toBe(true);

    const osRuntime = hydrate();
    tickMotion(
      osRuntime,
      input([{ path: directedPath("fresh"), selected: false }], { nowMs: 10 }),
    );
    const osStopped = tickMotion(
      osRuntime,
      input([{ path: directedPath("old"), selected: false }, { path: directedPath("fresh"), selected: false }], {
        nowMs: 20,
        osReducedMotion: true,
        preferences: prefs({ reduceMotion: false }),
      }),
    );
    expect(osStopped.activeCount).toBe(0);
    expect(osStopped.presentations.every((item) => item.staticReason === "reduced-motion")).toBe(true);
    expect(osStopped.displayedReportIds).toEqual(["old", "fresh"]);
  });

  it("keeps completed, unknown-direction, and budget-wait paths in the snapshot as static", () => {
    const runtime = hydrate();
    const paths = Array.from({ length: 3 }, (_, n) => ({
      path: directedPath(`n${n}`),
      selected: false,
    }));
    const crowded = tickMotion(
      runtime,
      input([{ path: directedPath("old"), selected: false }, ...paths, { path: unknownPath("mystery"), selected: false }], {
        nowMs: 10,
        preferences: prefs({ maxActive: 1, maxPending: 1 }),
      }),
    );
    expect(crowded.activeCount).toBe(1);
    expect(crowded.pendingCount).toBe(1);
    expect(crowded.presentations).toHaveLength(5);
    expect(crowded.presentations.filter((item) => item.travelProgress === null).length).toBe(4);
    expect(crowded.presentations.find((item) => item.pathId === "pmystery")?.staticReason).toBe("unknown-direction");
    expect(crowded.displayedReportIds).toEqual(["old", "n0", "n1", "n2", "mystery"]);

    const finished = tickMotion(
      runtime,
      input([{ path: directedPath("old"), selected: false }, { path: directedPath("n0"), selected: false }], {
        nowMs: 10_000,
        preferences: prefs({
          maxActive: 1,
          background: { ...prefs().background, travelSeconds: 0.25, trailSeconds: 0, fadeSeconds: 0 },
        }),
      }),
    );
    expect(finished.activeCount).toBe(0);
    expect(finished.presentations.every((item) => item.travelProgress === null)).toBe(true);
    expect(finished.presentations).toHaveLength(2);
  });

  it("changes motionTraceSignature for appearance updates but not per-frame progress", () => {
    const runtime = hydrate();
    const path = directedPath("fresh");
    const first = tickMotion(runtime, input([{ path, selected: false }], { nowMs: 10 }));
    const mid = tickMotion(runtime, input([{ path, selected: false }], { nowMs: 26 }));
    expect(motionTraceSignature(first.presentations[0]!)).toBe(motionTraceSignature(mid.presentations[0]!));
    const updated = tickMotion(
      runtime,
      input([{ path, selected: false }], {
        nowMs: 42,
        preferences: prefs({
          background: { ...prefs().background, travelSeconds: 4, style: "traveling-pulse", repeatSeconds: 8 },
        }),
      }),
    );
    expect(motionTraceSignature(updated.presentations[0]!)).not.toBe(motionTraceSignature(mid.presentations[0]!));
  });

  it("resyncs a backwards clock and does not replay a discarded hide backlog", () => {
    const selectedPrefs = prefs({
      animate: "selected-only",
      background: { ...prefs().background, style: "flowing-dashes", travelSeconds: 2.5 },
    });
    const runtime = hydrate();
    const path = directedPath("sel");
    const started = tickMotion(
      runtime,
      input([{ path, selected: true }], { nowMs: 100, preferences: selectedPrefs }),
    );
    expect(started.activeCount).toBe(1);
    expect(started.presentations[0]?.startedAtMs).toBe(100);
    const hidden = tickMotion(
      runtime,
      input([{ path, selected: true }], { nowMs: 140, visible: false, preferences: selectedPrefs }),
    );
    expect(hidden.activeCount).toBe(0);
    expect(hidden.pendingCount).toBe(0);
    const resumed = tickMotion(
      runtime,
      input([{ path, selected: true }], { nowMs: 160, visible: true, preferences: selectedPrefs }),
    );
    expect(resumed.pendingCount).toBe(0);
    expect(resumed.activeCount).toBe(1);
    expect(resumed.presentations[0]?.startedAtMs).toBe(160);
    expect(resumed.presentations[0]?.travelProgress).toBeGreaterThanOrEqual(0);

    const jumped = tickMotion(
      runtime,
      input([{ path, selected: true }], { nowMs: 50, visible: true, preferences: selectedPrefs }),
    );
    expect(jumped.presentations[0]?.startedAtMs).toBeLessThanOrEqual(50);
    expect(Math.max(0, 50 - (jumped.presentations[0]?.startedAtMs ?? 0))).toBeGreaterThanOrEqual(0);

    const oneShot = hydrate();
    tickMotion(
      oneShot,
      input(
        [{ path: directedPath("late0"), selected: false }, { path: directedPath("late1"), selected: false }],
        { nowMs: 10, preferences: prefs({ maxActive: 1, maxPending: 10 }) },
      ),
    );
    tickMotion(
      oneShot,
      input(
        [{ path: directedPath("late0"), selected: false }, { path: directedPath("late1"), selected: false }],
        { nowMs: 20, visible: false },
      ),
    );
    const after = tickMotion(
      oneShot,
      input(
        [{ path: directedPath("late0"), selected: false }, { path: directedPath("late1"), selected: false }],
        { nowMs: 30, visible: true },
      ),
    );
    expect(after.activeCount).toBe(0);
    expect(after.pendingCount).toBe(0);
  });

  it("repeats traveling pulses on repeatSeconds, including mid-cycle timing changes", () => {
    const appearance = {
      ...prefs().selected!,
      style: "traveling-pulse" as const,
      travelSeconds: 1.5,
      repeatSeconds: 3,
    };
    expect(repeatingCycleMs(appearance)).toBe(3000);
    expect(sampleAppearance(appearance, 0, true).travelProgress).toBeCloseTo(0);
    expect(sampleAppearance(appearance, 1500, true).travelProgress).toBe(1);
    expect(sampleAppearance(appearance, 2999, true).travelProgress).toBe(1);
    expect(sampleAppearance(appearance, 3000, true).travelProgress).toBeCloseTo(0);
    expect(sampleAppearance(appearance, 3750, true).travelProgress).toBeCloseTo(0.5);
    const stretched = { ...appearance, repeatSeconds: 8 };
    expect(sampleAppearance(stretched, 2000, true).travelProgress).toBe(1);
    expect(sampleAppearance(stretched, 8000, true).travelProgress).toBeCloseTo(0);
    expect(sampleAppearance(appearance, -250, true).travelProgress).toBeCloseTo(0);
  });
});
