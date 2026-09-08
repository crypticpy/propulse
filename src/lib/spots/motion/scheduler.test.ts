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

  it("does not promote ineligible pending paths after a selected-only policy change", () => {
    const runtime = createMotionRuntime();
    const hydrated = tickMotion(
      runtime,
      input([], { nowMs: 0, preferences: prefs({ animate: "new-spots", maxActive: 1 }) }),
    );
    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.activeCount).toBe(0);

    const paths = [
      { path: directedPath("0"), selected: false },
      { path: directedPath("1"), selected: false },
      { path: directedPath("2"), selected: false },
    ];
    const started = tickMotion(
      runtime,
      input(paths, { nowMs: 10, preferences: prefs({ animate: "new-spots", maxActive: 1 }) }),
    );
    expect(started.activePathIds).toEqual(["p0"]);
    expect(started.pendingPathIds).toEqual(["p1", "p2"]);

    const switched = tickMotion(
      runtime,
      input(paths, { nowMs: 20, preferences: prefs({ animate: "selected-only", maxActive: 1 }) }),
    );
    expect(switched.activeCount).toBe(0);
    expect(switched.pendingCount).toBe(0);
    expect(switched.activePathIds).not.toContain("p1");
    expect(switched.presentations.every((item) => item.travelProgress === null)).toBe(true);
    expect(switched.presentations.every((item) => item.staticReason === "unselected")).toBe(true);

    const queuedRuntime = createMotionRuntime();
    tickMotion(queuedRuntime, input([], { nowMs: 0 }));
    tickMotion(
      queuedRuntime,
      input(paths, { nowMs: 10, preferences: prefs({ animate: "new-spots", maxActive: 1 }) }),
    );
    const off = tickMotion(
      queuedRuntime,
      input(paths, {
        nowMs: 20,
        preferences: prefs({
          animate: "new-spots",
          maxActive: 1,
          selected: null,
          background: { ...prefs().background, style: "off" },
        }),
      }),
    );
    expect(off.activeCount).toBe(0);
    expect(off.pendingCount).toBe(0);
    expect(off.presentations.every((item) => item.staticReason === "off")).toBe(true);

    const activeRuntime = createMotionRuntime();
    tickMotion(activeRuntime, input([], { nowMs: 0 }));
    tickMotion(
      activeRuntime,
      input(paths, { nowMs: 10, preferences: prefs({ animate: "new-spots", maxActive: 1 }) }),
    );
    const unknownQueued = tickMotion(
      activeRuntime,
      input(
        [
          { path: directedPath("0"), selected: false },
          { path: unknownPath("1"), selected: false },
          { path: directedPath("2"), selected: false },
        ],
        { nowMs: 20, preferences: prefs({ animate: "new-spots", maxActive: 1 }) },
      ),
    );
    expect(unknownQueued.activePathIds).toEqual(["p0"]);
    expect(unknownQueued.pendingPathIds).toEqual(["p2"]);
    expect(unknownQueued.presentations.find((item) => item.pathId === "p1")?.staticReason).toBe(
      "unknown-direction",
    );

    const unknownActive = tickMotion(
      activeRuntime,
      input(
        [
          { path: unknownPath("0"), selected: false },
          { path: unknownPath("1"), selected: false },
          { path: directedPath("2"), selected: false },
        ],
        { nowMs: 30, preferences: prefs({ animate: "new-spots", maxActive: 1 }) },
      ),
    );
    expect(unknownActive.activePathIds).toEqual(["p2"]);
    expect(unknownActive.pendingCount).toBe(0);
    expect(unknownActive.presentations.find((item) => item.pathId === "p0")?.staticReason).toBe(
      "unknown-direction",
    );
  });

  it("applies lowered active and pending caps immediately without a restore replay burst", () => {
    const repeatingPrefs = (maxActive: number, maxPending = 100): PathMotionPreferences =>
      prefs({
        animate: "all-displayed",
        maxActive,
        maxPending,
        background: { ...prefs().background, style: "traveling-pulse", travelSeconds: 1.5, repeatSeconds: 3 },
      });
    const runtime = createMotionRuntime();
    const paths = [
      { path: directedPath("0"), selected: false },
      { path: directedPath("1"), selected: false },
      { path: directedPath("2"), selected: false },
    ];
    const hydrated = tickMotion(runtime, input(paths, { nowMs: 0, preferences: repeatingPrefs(12) }));
    expect(hydrated.activeCount).toBe(0);
    const running = tickMotion(runtime, input(paths, { nowMs: 16, preferences: repeatingPrefs(12) }));
    expect(running.activeCount).toBe(3);
    const lowered = tickMotion(runtime, input(paths, { nowMs: 32, preferences: repeatingPrefs(1) }));
    expect(lowered.activeCount).toBe(1);
    expect(lowered.pendingCount).toBe(2);
    expect(lowered.presentations).toHaveLength(3);
    expect(lowered.presentations.filter((item) => item.travelProgress === null)).toHaveLength(2);
    expect(lowered.displayedReportIds).toEqual(["0", "1", "2"]);
    const restored = tickMotion(runtime, input(paths, { nowMs: 48, preferences: repeatingPrefs(3) }));
    expect(restored.activeCount).toBe(3);
    expect(restored.pendingCount).toBe(0);
    expect(restored.droppedPendingCount).toBe(0);

    const pendingRuntime = createMotionRuntime();
    const many = Array.from({ length: 8 }, (_, n) => ({
      path: directedPath(`n${n}`),
      selected: false,
    }));
    tickMotion(pendingRuntime, input([], { nowMs: 0 }));
    const queued = tickMotion(
      pendingRuntime,
      input(many, { nowMs: 10, preferences: prefs({ animate: "new-spots", maxActive: 1, maxPending: 6 }) }),
    );
    expect(queued.activeCount).toBe(1);
    expect(queued.pendingCount).toBe(6);
    expect(queued.droppedPendingCount).toBe(1);
    const pendingLowered = tickMotion(
      pendingRuntime,
      input(many, { nowMs: 20, preferences: prefs({ animate: "new-spots", maxActive: 1, maxPending: 2 }) }),
    );
    expect(pendingLowered.activeCount).toBe(1);
    expect(pendingLowered.pendingCount).toBe(2);
    expect(pendingLowered.droppedPendingCount).toBe(5);
    expect(pendingLowered.presentations).toHaveLength(8);
    const pendingRestored = tickMotion(
      pendingRuntime,
      input(many, { nowMs: 30, preferences: prefs({ animate: "new-spots", maxActive: 1, maxPending: 6 }) }),
    );
    expect(pendingRestored.activeCount).toBe(1);
    expect(pendingRestored.pendingCount).toBe(2);
    expect(pendingRestored.droppedPendingCount).toBe(5);
  });

  it("keeps the initial hydration tick static for new-spots, selected-only, and all-displayed", () => {
    const policies: PathMotionPreferences[] = [
      prefs({ animate: "new-spots" }),
      prefs({ animate: "selected-only" }),
      prefs({
        animate: "all-displayed",
        background: { ...prefs().background, style: "traveling-pulse", travelSeconds: 1.5, repeatSeconds: 3 },
      }),
    ];
    const paths = [
      { path: directedPath("0"), selected: true },
      { path: directedPath("1"), selected: false },
      { path: directedPath("2"), selected: false },
    ];
    for (const preferences of policies) {
      const runtime = createMotionRuntime();
      const first = tickMotion(runtime, input(paths, { nowMs: 0, ready: true, preferences }));
      expect(first.hydrated).toBe(true);
      expect(first.activeCount).toBe(0);
      expect(first.pendingCount).toBe(0);
      expect(first.presentations).toHaveLength(3);
      expect(first.presentations.every((item) => item.travelProgress === null)).toBe(true);
    }

    const newSpots = createMotionRuntime();
    tickMotion(newSpots, input(paths, { nowMs: 0, preferences: policies[0] }));
    const laterNew = tickMotion(newSpots, input(paths, { nowMs: 16, preferences: policies[0] }));
    expect(laterNew.activeCount).toBe(0);

    const selectedOnly = createMotionRuntime();
    tickMotion(selectedOnly, input(paths, { nowMs: 0, preferences: policies[1] }));
    const laterSelected = tickMotion(selectedOnly, input(paths, { nowMs: 16, preferences: policies[1] }));
    expect(laterSelected.activePathIds).toEqual(["p0"]);
    expect(laterSelected.presentations.find((item) => item.pathId === "p1")?.staticReason).toBe("unselected");

    const allDisplayed = createMotionRuntime();
    tickMotion(allDisplayed, input(paths, { nowMs: 0, preferences: policies[2] }));
    const laterAll = tickMotion(allDisplayed, input(paths, { nowMs: 16, preferences: policies[2] }));
    expect([...laterAll.activePathIds].sort()).toEqual(["p0", "p1", "p2"]);
  });

  it("keeps static presentations through a hydrate, activate, policy, budget, hide, and reduced-motion sequence", () => {
    const runtime = createMotionRuntime();
    const pulse = prefs({
      animate: "all-displayed",
      maxActive: 12,
      maxPending: 100,
      background: {
        ...prefs().background,
        style: "traveling-pulse",
        travelSeconds: 1.5,
        repeatSeconds: 3,
      },
    });
    const base = [
      { path: directedPath("0"), selected: true },
      { path: directedPath("1"), selected: false },
      { path: directedPath("2"), selected: false },
    ];

    const hydrated = tickMotion(runtime, input(base, { nowMs: 0, preferences: pulse }));
    expect(hydrated.activeCount).toBe(0);
    expect(hydrated.pendingCount).toBe(0);
    expect(hydrated.presentations).toHaveLength(3);
    expect(hydrated.presentations.every((item) => item.travelProgress === null)).toBe(true);

    const activated = tickMotion(runtime, input(base, { nowMs: 16, preferences: pulse }));
    expect(activated.activeCount).toBe(3);

    const selectedOnlyNone = tickMotion(
      runtime,
      input(
        base.map((entry) => ({ ...entry, selected: false })),
        { nowMs: 32, preferences: { ...pulse, animate: "selected-only" } },
      ),
    );
    expect(selectedOnlyNone.activeCount).toBe(0);
    expect(selectedOnlyNone.pendingCount).toBe(0);
    expect(selectedOnlyNone.presentations).toHaveLength(3);
    expect(selectedOnlyNone.presentations.every((item) => item.staticReason === "unselected")).toBe(true);

    const selectedP1 = tickMotion(
      runtime,
      input(
        [
          { path: directedPath("0"), selected: false },
          { path: directedPath("1"), selected: true },
          { path: directedPath("2"), selected: false },
        ],
        { nowMs: 48, preferences: { ...pulse, animate: "selected-only" } },
      ),
    );
    expect(selectedP1.activePathIds).toEqual(["p1"]);
    expect(selectedP1.presentations).toHaveLength(3);

    const unknownActive = tickMotion(
      runtime,
      input(
        [
          { path: directedPath("0"), selected: false },
          { path: unknownPath("1"), selected: true },
          { path: directedPath("2"), selected: false },
        ],
        { nowMs: 64, preferences: { ...pulse, animate: "selected-only" } },
      ),
    );
    expect(unknownActive.activeCount).toBe(0);
    expect(unknownActive.presentations.find((item) => item.pathId === "p1")?.staticReason).toBe(
      "unknown-direction",
    );
    expect(unknownActive.presentations).toHaveLength(3);

    const off = tickMotion(
      runtime,
      input(base, {
        nowMs: 80,
        preferences: {
          ...pulse,
          selected: null,
          background: { ...pulse.background, style: "off" },
        },
      }),
    );
    expect(off.activeCount).toBe(0);
    expect(off.pendingCount).toBe(0);
    expect(off.presentations.every((item) => item.staticReason === "off")).toBe(true);

    const running = tickMotion(runtime, input(base, { nowMs: 96, preferences: pulse }));
    expect(running.activeCount).toBe(3);

    const hidden = tickMotion(
      runtime,
      input(base, { nowMs: 112, visible: false, preferences: pulse }),
    );
    expect(hidden.activeCount).toBe(0);
    expect(hidden.pendingCount).toBe(0);
    expect(hidden.presentations.every((item) => item.travelProgress === null)).toBe(true);

    const resumed = tickMotion(
      runtime,
      input(base, { nowMs: 128, visible: true, preferences: pulse }),
    );
    expect(resumed.activeCount).toBe(3);
    expect(resumed.presentations).toHaveLength(3);

    const lowered = tickMotion(
      runtime,
      input(base, { nowMs: 144, preferences: { ...pulse, maxActive: 1, maxPending: 2 } }),
    );
    expect(lowered.activeCount).toBe(1);
    expect(lowered.pendingCount).toBe(2);
    expect(lowered.presentations).toHaveLength(3);
    expect(lowered.presentations.filter((item) => item.travelProgress === null)).toHaveLength(2);

    const extras = Array.from({ length: 5 }, (_, n) => ({
      path: directedPath(`n${n}`),
      selected: false,
    }));
    const crowded = tickMotion(
      runtime,
      input([...base, ...extras], {
        nowMs: 160,
        preferences: { ...pulse, maxActive: 1, maxPending: 2 },
      }),
    );
    expect(crowded.activeCount).toBe(1);
    expect(crowded.pendingCount).toBe(2);
    expect(crowded.droppedPendingCount).toBeGreaterThan(0);
    expect(crowded.presentations).toHaveLength(8);
    const dropped = crowded.droppedPendingCount;

    const restoredCaps = tickMotion(
      runtime,
      input([...base, ...extras], {
        nowMs: 176,
        preferences: { ...pulse, maxActive: 3, maxPending: 2 },
      }),
    );
    expect(restoredCaps.activeCount).toBe(3);
    expect(restoredCaps.pendingCount).toBe(2);
    expect(restoredCaps.presentations).toHaveLength(8);
    expect(restoredCaps.droppedPendingCount).toBeGreaterThanOrEqual(dropped);

    tickMotion(
      runtime,
      input([...base, ...extras], {
        nowMs: 192,
        visible: false,
        preferences: { ...pulse, maxActive: 3, maxPending: 2 },
      }),
    );
    const noReplay = tickMotion(
      runtime,
      input([...base, ...extras], {
        nowMs: 208,
        visible: true,
        preferences: prefs({ animate: "new-spots", maxActive: 3, maxPending: 2 }),
      }),
    );
    expect(noReplay.activeCount).toBe(0);
    expect(noReplay.pendingCount).toBe(0);
    expect(noReplay.presentations).toHaveLength(8);
    expect(noReplay.presentations.every((item) => item.travelProgress === null)).toBe(true);

    const lateArrival = tickMotion(
      runtime,
      input([...base, ...extras, { path: directedPath("fresh"), selected: false }], {
        nowMs: 224,
        preferences: prefs({ animate: "new-spots", maxActive: 1, maxPending: 10 }),
      }),
    );
    expect(lateArrival.activePathIds).toEqual(["pfresh"]);
    expect(lateArrival.presentations).toHaveLength(9);

    const reduced = tickMotion(
      runtime,
      input([...base, ...extras, { path: directedPath("fresh"), selected: false }], {
        nowMs: 240,
        osReducedMotion: true,
        preferences: prefs({ animate: "new-spots", reduceMotion: false, maxActive: 1 }),
      }),
    );
    expect(reduced.activeCount).toBe(0);
    expect(reduced.pendingCount).toBe(0);
    expect(reduced.presentations).toHaveLength(9);
    expect(reduced.presentations.every((item) => item.travelProgress === null)).toBe(true);
    expect(reduced.presentations.every((item) => item.staticReason === "reduced-motion")).toBe(true);
    expect(reduced.displayedReportIds).toEqual(lateArrival.displayedReportIds);
  });

  it("releases a new-spots flowing-dashes slot after one traversal", () => {
    const runtime = hydrate(createMotionRuntime(), []);
    const paths = [
      { path: directedPath("first"), selected: false },
      { path: directedPath("second"), selected: false },
    ];
    const preferences = prefs({
      animate: "new-spots",
      maxActive: 1,
      background: { ...prefs().background, style: "flowing-dashes", travelSeconds: 2.5 },
    });
    const started = tickMotion(runtime, input(paths, { nowMs: 100, preferences }));
    expect(started.activePathIds).toEqual(["pfirst"]);
    expect(started.pendingPathIds).toEqual(["psecond"]);
    expect(started.presentations).toHaveLength(2);

    const afterFirst = tickMotion(runtime, input(paths, { nowMs: 2_600, preferences }));
    expect(afterFirst.activePathIds).toEqual(["psecond"]);
    expect(afterFirst.pendingCount).toBe(0);
    expect(afterFirst.presentations).toHaveLength(2);
    expect(afterFirst.presentations.find((item) => item.pathId === "pfirst")?.travelProgress).toBeNull();
    expect(afterFirst.displayedReportIds).toEqual(["first", "second"]);

    const later = tickMotion(runtime, input(paths, { nowMs: 60_100, preferences }));
    expect(later.activePathIds).not.toContain("pfirst");
    expect(later.activeCount).toBe(0);
    expect(later.pendingCount).toBe(0);
    expect(later.presentations).toHaveLength(2);
    expect(later.presentations.every((item) => item.travelProgress === null)).toBe(true);
    expect(later.displayedReportIds).toEqual(["first", "second"]);
  });
});
