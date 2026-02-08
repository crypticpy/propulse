#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgcMode {
  Off,
  Fast,
  Medium,
  Slow,
}

#[derive(Debug, Clone)]
pub struct Agc {
  mode: AgcMode,
  gain: f32,
  target: f32,
  attack: f32,
  decay: f32,
}

impl Agc {
  pub fn new(mode: AgcMode, sample_rate: u32) -> Self {
    let (attack_ms, decay_ms) = match mode {
      AgcMode::Off => (0.0, 0.0),
      AgcMode::Fast => (100.0, 500.0),
      AgcMode::Medium => (300.0, 2000.0),
      AgcMode::Slow => (1000.0, 5000.0),
    };

    let sr = sample_rate.max(1) as f32;
    let attack = if attack_ms <= 0.0 {
      1.0
    } else {
      (-1.0 / (sr * (attack_ms / 1000.0))).exp()
    };
    let decay = if decay_ms <= 0.0 {
      1.0
    } else {
      (-1.0 / (sr * (decay_ms / 1000.0))).exp()
    };

    // Target output level: -12 dBFS ≈ 0.251
    let target = 10.0f32.powf(-12.0 / 20.0);

    Self {
      mode,
      gain: 1.0,
      target,
      attack,
      decay,
    }
  }

  pub fn set_mode(&mut self, mode: AgcMode, sample_rate: u32) {
    *self = Self::new(mode, sample_rate);
  }

  pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
    if self.mode == AgcMode::Off {
      return input.to_vec();
    }

    let mut out = Vec::with_capacity(input.len());
    for &s in input {
      let level = s.abs().max(1e-6);
      let desired = self.target / level;
      if desired < self.gain {
        // attack (reduce gain quickly)
        self.gain = self.gain * self.attack + desired * (1.0 - self.attack);
      } else {
        // decay (increase gain slowly)
        self.gain = self.gain * self.decay + desired * (1.0 - self.decay);
      }
      out.push((s * self.gain).clamp(-1.0, 1.0));
    }
    out
  }
}

