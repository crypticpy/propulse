use std::sync::Arc;

use rustfft::{Fft, FftPlanner};

use crate::Complex32;

#[derive(Debug, Clone, Copy)]
pub enum WindowKind {
  BlackmanHarris,
}

#[derive(Debug, Clone, Copy)]
pub struct FftConfig {
  pub size: usize,
  pub window: WindowKind,
  /// Simple moving average window (1 = no averaging)
  pub averaging: usize,
}

impl Default for FftConfig {
  fn default() -> Self {
    Self {
      size: 4096,
      window: WindowKind::BlackmanHarris,
      averaging: 1,
    }
  }
}

pub struct FftProcessor {
  cfg: FftConfig,
  fft: Arc<dyn Fft<f32>>,
  window: Vec<f32>,
  buf: Vec<Complex32>,
  avg: Vec<f32>,
  avg_count: usize,
}

impl FftProcessor {
  pub fn new(cfg: FftConfig) -> Self {
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(cfg.size);
    let window = build_window(cfg.size, cfg.window);
    Self {
      cfg,
      fft,
      window,
      buf: vec![Complex32::new(0.0, 0.0); cfg.size],
      avg: vec![0.0; cfg.size],
      avg_count: 0,
    }
  }

  pub fn config(&self) -> FftConfig {
    self.cfg
  }

  pub fn set_config(&mut self, cfg: FftConfig) {
    if cfg.size != self.cfg.size || cfg.window as u8 != self.cfg.window as u8 {
      let mut planner = FftPlanner::<f32>::new();
      self.fft = planner.plan_fft_forward(cfg.size);
      self.window = build_window(cfg.size, cfg.window);
      self.buf = vec![Complex32::new(0.0, 0.0); cfg.size];
      self.avg = vec![0.0; cfg.size];
      self.avg_count = 0;
    }
    self.cfg = cfg;
  }

  /// Compute a power spectrum in dB (fft-shifted so DC is centered).
  pub fn process_db(&mut self, iq: &[Complex32]) -> anyhow::Result<Vec<f32>> {
    if iq.len() != self.cfg.size {
      return Err(anyhow::anyhow!(
        "FFT input size mismatch: expected {}, got {}",
        self.cfg.size,
        iq.len()
      ));
    }

    for (i, s) in iq.iter().enumerate() {
      let w = self.window[i];
      self.buf[i] = Complex32::new(s.re * w, s.im * w);
    }

    self.fft.process(&mut self.buf);

    // Convert to power (mag^2) and normalize by N for a stable-ish dB scale.
    let n = self.cfg.size as f32;
    let inv_n = 1.0 / n.max(1.0);
    let mut power = vec![0.0f32; self.cfg.size];
    for (i, c) in self.buf.iter().enumerate() {
      power[i] = (c.re * c.re + c.im * c.im) * inv_n;
    }

    // fftshift
    let half = self.cfg.size / 2;
    let mut shifted = vec![0.0f32; self.cfg.size];
    shifted[..self.cfg.size - half].copy_from_slice(&power[half..]);
    shifted[self.cfg.size - half..].copy_from_slice(&power[..half]);

    let eps = 1e-20f32;
    let mut db = shifted
      .into_iter()
      .map(|p| 10.0 * (p.max(eps)).log10())
      .collect::<Vec<_>>();

    // Averaging (simple boxcar across frames)
    let avg_n = self.cfg.averaging.max(1);
    if avg_n == 1 {
      return Ok(db);
    }

    if self.avg.len() != db.len() {
      self.avg = vec![0.0; db.len()];
      self.avg_count = 0;
    }

    if self.avg_count == 0 {
      self.avg.copy_from_slice(&db);
      self.avg_count = 1;
      return Ok(db);
    }

    // incremental average up to avg_n samples
    let next_count = (self.avg_count + 1).min(avg_n);
    let a = (self.avg_count as f32) / (next_count as f32);
    let b = 1.0 / (next_count as f32);
    for i in 0..db.len() {
      self.avg[i] = self.avg[i] * a + db[i] * b;
      db[i] = self.avg[i];
    }
    self.avg_count = next_count;

    Ok(db)
  }
}

fn build_window(n: usize, kind: WindowKind) -> Vec<f32> {
  match kind {
    WindowKind::BlackmanHarris => blackman_harris(n),
  }
}

fn blackman_harris(n: usize) -> Vec<f32> {
  // 4-term Blackman-Harris
  // https://en.wikipedia.org/wiki/Window_function#Blackman%E2%80%93Harris_window
  let a0 = 0.35875f32;
  let a1 = 0.48829f32;
  let a2 = 0.14128f32;
  let a3 = 0.01168f32;
  let m = (n.saturating_sub(1)) as f32;
  (0..n)
    .map(|i| {
      if n <= 1 {
        return 1.0;
      }
      let x = (i as f32) / m;
      let t = std::f32::consts::TAU * x;
      a0 - a1 * t.cos() + a2 * (2.0 * t).cos() - a3 * (3.0 * t).cos()
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::Complex32;

  #[test]
  fn fft_peak_bin_for_tone() {
    let cfg = FftConfig {
      size: 1024,
      window: WindowKind::BlackmanHarris,
      averaging: 1,
    };
    let mut proc = FftProcessor::new(cfg);

    // Generate a complex tone at +0.1 cycles/sample relative to DC.
    let f = 0.1f32;
    let mut iq = Vec::with_capacity(cfg.size);
    for n in 0..cfg.size {
      let ph = std::f32::consts::TAU * f * (n as f32);
      iq.push(Complex32::new(ph.cos(), ph.sin()));
    }

    let bins = proc.process_db(&iq).unwrap();

    // With fftshift, DC is at center. Positive frequencies occupy upper half.
    let peak_idx = bins
      .iter()
      .enumerate()
      .max_by(|a, b| a.1.total_cmp(b.1))
      .map(|(i, _)| i)
      .unwrap();

    // Expected bin: center + f*N
    let expected = (cfg.size / 2) as i32 + (f * cfg.size as f32).round() as i32;
    let err = (peak_idx as i32 - expected).abs();
    assert!(err <= 2, "peak_idx={peak_idx} expected~{expected} err={err}");
  }
}

