// ---------------------------------------------------------------------------
// sweetener — Small "sound sweetening" EQ preset for RX audio.
// ---------------------------------------------------------------------------

export interface SweetenerParams {
  /** 0..1 intensity */
  amount: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Create a small fixed EQ chain that improves speech intelligibility:
 * - High-pass to remove rumble
 * - Gentle "mud" cut around 350 Hz
 * - Presence boost around 2.5 kHz
 * - Mild high-shelf for clarity
 */
export function createSweetenerNodes(
  ctx: AudioContext,
  params: SweetenerParams,
): BiquadFilterNode[] {
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.Q.value = 0.707;

  const mud = ctx.createBiquadFilter();
  mud.type = "peaking";
  mud.frequency.value = 350;
  mud.Q.value = 1.0;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2500;
  presence.Q.value = 0.9;

  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 3200;
  air.Q.value = 0.707;

  updateSweetenerNodes([hp, mud, presence, air], params);
  return [hp, mud, presence, air];
}

export function updateSweetenerNodes(
  nodes: BiquadFilterNode[],
  params: SweetenerParams,
): void {
  const amount = clamp01(params.amount);

  const hp = nodes[0];
  const mud = nodes[1];
  const presence = nodes[2];
  const air = nodes[3];

  if (!hp || !mud || !presence || !air) return;

  // Tighten low end + add presence; keep changes conservative.
  hp.frequency.value = lerp(80, 200, amount);
  mud.gain.value = lerp(0, -4.5, amount);
  presence.gain.value = lerp(0, 6.0, amount);
  air.gain.value = lerp(0, 2.5, amount);
}

