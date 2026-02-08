use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, warn};

use crate::config::{SdrconnectIqFormat, SdrconnectRadioInstanceConfig};
use propulse_dsp::Complex32;

pub(crate) struct SdrconnectRuntime {
  cfg: SdrconnectRadioInstanceConfig,
  buffer: Arc<StdMutex<VecDeque<Complex32>>>,
  stop: Arc<AtomicBool>,
  started: Arc<AtomicBool>,
  tx: mpsc::UnboundedSender<Message>,
  reader: tokio::task::JoinHandle<()>,
  writer: tokio::task::JoinHandle<()>,
}

impl SdrconnectRuntime {
  pub(crate) fn sample_rate(&self) -> u32 {
    self.cfg.sample_rate
  }

  pub(crate) fn buffer(&self) -> Arc<StdMutex<VecDeque<Complex32>>> {
    Arc::clone(&self.buffer)
  }

  pub(crate) async fn connect(
    cfg: SdrconnectRadioInstanceConfig,
    initial_freq: u64,
    initial_gain: Option<f32>,
  ) -> anyhow::Result<Self> {
    let (ws, _resp) = connect_async(cfg.url.clone()).await?;
    let (mut sink, mut stream) = ws.split();

    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let stop = Arc::new(AtomicBool::new(false));
    let started = Arc::new(AtomicBool::new(false));
    let buffer = Arc::new(StdMutex::new(VecDeque::new()));

    let stop_writer = Arc::clone(&stop);
    let writer = tokio::spawn(async move {
      while let Some(msg) = rx.recv().await {
        if stop_writer.load(Ordering::Relaxed) {
          break;
        }
        if let Err(err) = sink.send(msg).await {
          warn!(error = %err, "SDRconnect ws send failed");
          break;
        }
      }
      let _ = sink.send(Message::Close(None)).await;
    });

    let cfg_reader = cfg.clone();
    let stop_reader = Arc::clone(&stop);
    let buf_reader = Arc::clone(&buffer);
    let tx_reader = tx.clone();
    let reader = tokio::spawn(async move {
      let sample_rate = cfg_reader.sample_rate;
      let max_len = (sample_rate as usize).saturating_mul(2);

      while let Some(next) = stream.next().await {
        if stop_reader.load(Ordering::Relaxed) {
          break;
        }

        match next {
          Ok(Message::Binary(bin)) => {
            if let Some(iq) = decode_iq(&cfg_reader.format, &bin) {
              if let Ok(mut q) = buf_reader.lock() {
                q.extend(iq);
                while q.len() > max_len {
                  q.pop_front();
                }
              }
            }
          }
          Ok(Message::Text(text)) => {
            debug!(len = text.len(), "SDRconnect ws text");
          }
          Ok(Message::Ping(p)) => {
            // Best-effort pong (send via writer task).
            let _ = tx_reader.send(Message::Pong(p));
          }
          Ok(Message::Pong(_)) => {}
          Ok(Message::Close(_)) => {
            break;
          }
          Ok(_) => {}
          Err(err) => {
            warn!(error = %err, "SDRconnect ws recv failed");
            break;
          }
        }
      }
    });

    let rt = Self {
      cfg,
      buffer,
      stop,
      started,
      tx,
      reader,
      writer,
    };

    // Configure device (open + initial parameters). Streaming starts on demand.
    rt.send_open()?;
    rt.set_sample_rate(rt.cfg.sample_rate)?;
    rt.set_center_frequency(initial_freq)?;
    if let Some(g) = initial_gain.or(rt.cfg.gain.map(|v| v as f32)) {
      let _ = rt.set_gain(g);
    }
    if let Some(ppm) = rt.cfg.ppm {
      let _ = rt.send_cmd(serde_json::json!({ "cmd": "setPpm", "ppm": ppm }));
    }
    if let Some(level) = rt.cfg.squelch {
      let _ = rt.send_cmd(serde_json::json!({ "cmd": "setSquelch", "level": level }));
    }
    if let Some(mode) = rt.cfg.direct_sampling {
      let _ = rt.send_cmd(serde_json::json!({ "cmd": "setDirectSampling", "mode": mode }));
    }

    Ok(rt)
  }

  pub(crate) async fn shutdown(self) {
    self.stop.store(true, Ordering::Relaxed);
    let _ = self.tx.send(Message::Close(None));
    self.reader.abort();
    self.writer.abort();
    let _ = self.reader.await;
    let _ = self.writer.await;
    if let Ok(mut q) = self.buffer.lock() {
      q.clear();
    }
  }

  pub(crate) fn start_streaming(&self) -> anyhow::Result<()> {
    if self.started.swap(true, Ordering::Relaxed) {
      return Ok(());
    }
    self.send_cmd(serde_json::json!({ "cmd": "start" }))?;
    Ok(())
  }

  pub(crate) fn set_center_frequency(&self, freq: u64) -> anyhow::Result<()> {
    self.send_cmd(serde_json::json!({ "cmd": "setCenterFrequency", "frequency": freq }))?;
    Ok(())
  }

  pub(crate) fn set_sample_rate(&self, sample_rate: u32) -> anyhow::Result<()> {
    self.send_cmd(serde_json::json!({ "cmd": "setSampleRate", "sampleRate": sample_rate }))?;
    Ok(())
  }

  pub(crate) fn set_gain(&self, gain: f32) -> anyhow::Result<()> {
    let g = gain.round() as i32;
    self.send_cmd(serde_json::json!({ "cmd": "setGain", "gain": g }))?;
    Ok(())
  }

  pub(crate) fn set_squelch(&self, level: f32) -> anyhow::Result<()> {
    let l = level.round() as i32;
    self.send_cmd(serde_json::json!({ "cmd": "setSquelch", "level": l }))?;
    Ok(())
  }

  fn send_open(&self) -> anyhow::Result<()> {
    if let Some(serial) = self.cfg.serial.as_deref() {
      self.send_cmd(serde_json::json!({ "cmd": "open", "serial": serial }))?;
    } else {
      self.send_cmd(serde_json::json!({ "cmd": "open", "deviceId": self.cfg.device_id.unwrap_or(0) }))?;
    }
    Ok(())
  }

  fn send_cmd(&self, cmd: serde_json::Value) -> anyhow::Result<()> {
    let text = serde_json::to_string(&cmd)?;
    self.tx.send(Message::Text(text)).map_err(|_| anyhow::anyhow!("SDRconnect command channel closed"))?;
    Ok(())
  }
}

fn decode_iq(fmt: &SdrconnectIqFormat, bin: &[u8]) -> Option<Vec<Complex32>> {
  match fmt {
    SdrconnectIqFormat::U8 => decode_iq_u8(bin),
    SdrconnectIqFormat::S16le => decode_iq_s16le(bin),
  }
}

fn decode_iq_u8(bin: &[u8]) -> Option<Vec<Complex32>> {
  if bin.len() < 2 {
    return None;
  }
  let n = bin.len() / 2;
  let mut out = Vec::with_capacity(n);
  for chunk in bin.chunks_exact(2) {
    let i = (chunk[0] as f32 - 128.0) / 128.0;
    let q = (chunk[1] as f32 - 128.0) / 128.0;
    out.push(Complex32::new(i, q));
  }
  Some(out)
}

fn decode_iq_s16le(bin: &[u8]) -> Option<Vec<Complex32>> {
  if bin.len() < 4 {
    return None;
  }
  let n = bin.len() / 4;
  let mut out = Vec::with_capacity(n);
  for chunk in bin.chunks_exact(4) {
    let i = i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32768.0;
    let q = i16::from_le_bytes([chunk[2], chunk[3]]) as f32 / 32768.0;
    out.push(Complex32::new(i, q));
  }
  Some(out)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn decode_u8_pairs() {
    let iq = decode_iq_u8(&[128, 128, 255, 0]).unwrap();
    assert_eq!(iq.len(), 2);
    assert!((iq[0].re - 0.0).abs() < 1e-6);
    assert!((iq[0].im - 0.0).abs() < 1e-6);
  }

  #[test]
  fn decode_s16le_pairs() {
    // i=32767, q=-32768
    let iq = decode_iq_s16le(&[0xff, 0x7f, 0x00, 0x80]).unwrap();
    assert_eq!(iq.len(), 1);
    assert!(iq[0].re > 0.9);
    assert!(iq[0].im < -0.9);
  }
}
