#[derive(Debug, Clone)]
pub struct FirFilter {
  taps: Vec<f32>,
  state: Vec<f32>,
}

impl FirFilter {
  pub fn new(taps: Vec<f32>) -> Self {
    let state = vec![0.0; taps.len().saturating_sub(1)];
    Self { taps, state }
  }

  pub fn set_taps(&mut self, taps: Vec<f32>) {
    self.taps = taps;
    self.state = vec![0.0; self.taps.len().saturating_sub(1)];
  }

  pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
    if self.taps.is_empty() {
      return input.to_vec();
    }

    // direct-form FIR with simple state carry-over (ok for modest tap counts).
    let mut x = Vec::with_capacity(self.state.len() + input.len());
    x.extend_from_slice(&self.state);
    x.extend_from_slice(input);

    let mut out = vec![0.0f32; input.len()];
    let m = self.taps.len();
    for n in 0..input.len() {
      let mut acc = 0.0f32;
      for k in 0..m {
        acc += self.taps[k] * x[n + (m - 1) - k];
      }
      out[n] = acc;
    }

    // update state with last m-1 samples
    let keep = m.saturating_sub(1);
    if keep > 0 {
      self.state.copy_from_slice(&x[x.len().saturating_sub(keep)..]);
    }

    out
  }
}

pub fn design_bandpass(
  sample_rate: f32,
  low_hz: f32,
  high_hz: f32,
  taps: usize,
) -> Vec<f32> {
  let n = taps.max(1);
  let m = (n - 1) as f32;
  let fl = (low_hz / sample_rate).clamp(0.0, 0.499);
  let fh = (high_hz / sample_rate).clamp(0.0, 0.499);

  // Windowed-sinc bandpass: h = lp(fh) - lp(fl)
  let mut h = Vec::with_capacity(n);
  for i in 0..n {
    let x = i as f32 - m / 2.0;
    let w = blackman_window(i as f32 / m.max(1.0));
    let val = (2.0 * fh * sinc(2.0 * fh * x)) - (2.0 * fl * sinc(2.0 * fl * x));
    h.push(val * w);
  }

  h
}

fn sinc(x: f32) -> f32 {
  if x.abs() < 1e-6 {
    1.0
  } else {
    (std::f32::consts::PI * x).sin() / (std::f32::consts::PI * x)
  }
}

fn blackman_window(t: f32) -> f32 {
  // t in [0,1]
  let a0 = 0.42f32;
  let a1 = 0.5f32;
  let a2 = 0.08f32;
  let x = std::f32::consts::TAU * t;
  a0 - a1 * x.cos() + a2 * (2.0 * x).cos()
}
