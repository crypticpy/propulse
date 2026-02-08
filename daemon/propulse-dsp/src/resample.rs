#[derive(Debug, Clone)]
pub struct LinearResampler {
  step: f64,
  pos: f64,
  last: f32,
  has_last: bool,
}

impl LinearResampler {
  pub fn new(input_rate: u32, output_rate: u32) -> Self {
    let step = (input_rate as f64) / (output_rate as f64);
    Self {
      step,
      pos: 0.0,
      last: 0.0,
      has_last: false,
    }
  }

  pub fn set_rates(&mut self, input_rate: u32, output_rate: u32) {
    self.step = (input_rate as f64) / (output_rate as f64);
    self.pos = 0.0;
    self.has_last = false;
    self.last = 0.0;
  }

  pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
    if input.is_empty() || self.step <= 0.0 {
      return Vec::new();
    }

    let mut x: Vec<f32> = Vec::with_capacity(input.len() + 1);
    if self.has_last {
      x.push(self.last);
    }
    x.extend_from_slice(input);

    let mut out = Vec::new();
    while self.pos + 1.0 < (x.len() as f64) {
      let i0 = self.pos.floor() as usize;
      let frac = (self.pos - (i0 as f64)) as f32;
      let s0 = x[i0];
      let s1 = x[i0 + 1];
      out.push(s0 + (s1 - s0) * frac);
      self.pos += self.step;
    }

    // Keep the last sample for continuity.
    self.last = *x.last().unwrap_or(&0.0);
    self.has_last = true;

    // Renormalize pos to be relative to next buffer start (keep within a few samples)
    let consumed = (self.pos.floor() as usize).saturating_sub(x.len().saturating_sub(2));
    if consumed > 0 {
      self.pos -= consumed as f64;
    }

    out
  }
}

