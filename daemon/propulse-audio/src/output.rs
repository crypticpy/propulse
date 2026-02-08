use std::{
  collections::VecDeque,
  sync::{Arc, Mutex},
};

use cpal::{
  traits::{DeviceTrait, HostTrait, StreamTrait},
  SampleFormat, Stream,
};

pub struct AudioOutput {
  queue: Arc<Mutex<VecDeque<i16>>>,
  _stream: Stream,
  sample_rate: u32,
}

#[derive(Clone)]
pub struct ThreadedAudioOutput {
  tx: crossbeam_channel::Sender<Vec<i16>>,
  sample_rate: u32,
}

impl ThreadedAudioOutput {
  pub fn start(output_device: &str, sample_rate: u32) -> anyhow::Result<Self> {
    let (tx, rx) = crossbeam_channel::bounded::<Vec<i16>>(32);
    let device = output_device.to_string();

    std::thread::Builder::new()
      .name("propulse-audio-output".to_string())
      .spawn(move || {
        let out = match AudioOutput::start(&device, sample_rate) {
          Ok(o) => o,
          Err(err) => {
            tracing::warn!(error = %err, "Audio output thread failed to start");
            return;
          }
        };

        while let Ok(chunk) = rx.recv() {
          out.push_pcm_i16(&chunk);
        }
      })?;

    Ok(Self { tx, sample_rate })
  }

  pub fn sample_rate(&self) -> u32 {
    self.sample_rate
  }

  pub fn push_pcm_i16(&self, samples: &[i16]) {
    if samples.is_empty() {
      return;
    }
    let _ = self.tx.try_send(samples.to_vec());
  }
}

impl AudioOutput {
  pub fn start(output_device: &str, sample_rate: u32) -> anyhow::Result<Self> {
    let host = cpal::default_host();
    let device = if output_device == "default" {
      host
        .default_output_device()
        .ok_or_else(|| anyhow::anyhow!("No default output device"))?
    } else {
      host
        .output_devices()?
        .find(|d| d.name().ok().as_deref() == Some(output_device))
        .ok_or_else(|| anyhow::anyhow!("Output device not found: {output_device}"))?
    };

    let mut cfg = device.default_output_config()?.config();
    cfg.channels = 1;
    cfg.sample_rate.0 = sample_rate;

    let queue: Arc<Mutex<VecDeque<i16>>> = Arc::new(Mutex::new(VecDeque::with_capacity(
      (sample_rate as usize).saturating_mul(2),
    )));
    let queue2 = Arc::clone(&queue);

    let sample_format = device.default_output_config()?.sample_format();
    let stream = match sample_format {
      SampleFormat::I16 => device.build_output_stream(
        &cfg,
        move |data: &mut [i16], _| fill_i16(data, &queue2),
        err_fn,
        None,
      )?,
      SampleFormat::U16 => device.build_output_stream(
        &cfg,
        move |data: &mut [u16], _| fill_u16(data, &queue2),
        err_fn,
        None,
      )?,
      SampleFormat::F32 => device.build_output_stream(
        &cfg,
        move |data: &mut [f32], _| fill_f32(data, &queue2),
        err_fn,
        None,
      )?,
      _ => return Err(anyhow::anyhow!("Unsupported sample format")),
    };

    stream.play()?;

    Ok(Self {
      queue,
      _stream: stream,
      sample_rate,
    })
  }

  pub fn sample_rate(&self) -> u32 {
    self.sample_rate
  }

  pub fn push_pcm_i16(&self, samples: &[i16]) {
    if samples.is_empty() {
      return;
    }
    if let Ok(mut q) = self.queue.lock() {
      q.extend(samples);
      // bound queue
      let max = (self.sample_rate as usize).saturating_mul(4);
      while q.len() > max {
        q.pop_front();
      }
    }
  }
}

fn err_fn(err: cpal::StreamError) {
  tracing::warn!(error = %err, "Audio output error");
}

fn fill_i16(out: &mut [i16], q: &Arc<Mutex<VecDeque<i16>>>) {
  let mut guard = q.lock().ok();
  for s in out {
    *s = guard
      .as_mut()
      .and_then(|g| g.pop_front())
      .unwrap_or(0);
  }
}

fn fill_u16(out: &mut [u16], q: &Arc<Mutex<VecDeque<i16>>>) {
  let mut guard = q.lock().ok();
  for s in out {
    let v = guard
      .as_mut()
      .and_then(|g| g.pop_front())
      .unwrap_or(0);
    *s = (v as i32 + 32_768).clamp(0, 65_535) as u16;
  }
}

fn fill_f32(out: &mut [f32], q: &Arc<Mutex<VecDeque<i16>>>) {
  let mut guard = q.lock().ok();
  for s in out {
    let v = guard
      .as_mut()
      .and_then(|g| g.pop_front())
      .unwrap_or(0);
    *s = (v as f32) / (i16::MAX as f32);
  }
}
