#[derive(Debug, Clone)]
pub struct NoiseReduction {
  pub level: u8,
  prev: f32,
}

impl NoiseReduction {
  pub fn new() -> Self {
    Self { level: 0, prev: 0.0 }
  }

  pub fn enabled(&self) -> bool {
    self.level > 0
  }

  pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
    if self.level == 0 {
      if let Some(last) = input.last() {
        self.prev = *last;
      }
      return input.to_vec();
    }

    // Simple single-pole smoothing. Higher level = more smoothing.
    let alpha = (self.level as f32 / 5.0).clamp(0.0, 1.0);
    let a = 0.02 * alpha;
    let mut out = Vec::with_capacity(input.len());
    let mut y = self.prev;
    for &x in input {
      y = y + a * (x - y);
      out.push(y);
    }
    self.prev = y;
    out
  }
}

