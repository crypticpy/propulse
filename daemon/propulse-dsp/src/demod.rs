use crate::Complex32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DemodMode {
  Usb,
  Lsb,
  Cw,
  Am,
  Fm,
}

/// Very small demodulation helpers for v1.
///
/// Notes:
/// - The daemon's higher-level pipeline is responsible for filtering,
///   resampling, and gain control.
/// - This keeps the demod algorithms intentionally simple and pure-Rust.
pub fn demodulate(iq: &[Complex32], mode: DemodMode) -> Vec<f32> {
  match mode {
    DemodMode::Usb => iq.iter().map(|s| s.re).collect(),
    DemodMode::Lsb => iq.iter().map(|s| -s.re).collect(),
    DemodMode::Cw => iq.iter().map(|s| s.re).collect(),
    DemodMode::Am => am_envelope(iq),
    DemodMode::Fm => fm_discriminator(iq),
  }
}

fn am_envelope(iq: &[Complex32]) -> Vec<f32> {
  let mut out = Vec::with_capacity(iq.len());
  // magnitude - DC removal via running mean
  let mut mean = 0.0f32;
  let alpha = 0.001f32;
  for s in iq {
    let mag = (s.re * s.re + s.im * s.im).sqrt();
    mean = mean * (1.0 - alpha) + mag * alpha;
    out.push(mag - mean);
  }
  out
}

fn fm_discriminator(iq: &[Complex32]) -> Vec<f32> {
  let mut out = Vec::with_capacity(iq.len());
  let mut prev = Complex32::new(1.0, 0.0);
  for s in iq {
    let x = s * prev.conj();
    // Approximate angle via atan2
    out.push(x.im.atan2(x.re));
    prev = *s;
  }
  out
}

