#[derive(Debug, Clone)]
pub struct NoiseBlanker {
  pub enabled: bool,
  pub threshold: f32,
  last: f32,
}

impl NoiseBlanker {
  pub fn new() -> Self {
    Self {
      enabled: false,
      threshold: 0.9,
      last: 0.0,
    }
  }

  pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
    if !self.enabled {
      if let Some(last) = input.last() {
        self.last = *last;
      }
      return input.to_vec();
    }

    let mut out = Vec::with_capacity(input.len());
    for &s in input {
      let v = if s.abs() > self.threshold { self.last } else { s };
      out.push(v);
      self.last = v;
    }
    out
  }
}

