use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, warn};

use crate::config::SdrconnectRadioInstanceConfig;
use propulse_dsp::Complex32;

#[derive(Debug, Clone, Copy)]
enum SdrconnectBinaryKind {
  Audio = 0x0001,
  Iq = 0x0002,
  Spectrum = 0x0003,
}

#[derive(Debug, Clone)]
struct SdrconnectWsMessage {
  event_type: String,
  #[allow(dead_code)]
  property: Option<String>,
  value: Option<String>,
}

pub(crate) struct SdrconnectRuntime {
  cfg: SdrconnectRadioInstanceConfig,
  buffer: Arc<StdMutex<VecDeque<Complex32>>>,
  reported_sample_rate: Arc<StdMutex<Option<u32>>>,
  stop: Arc<AtomicBool>,
  started: Arc<AtomicBool>,
  tx: mpsc::UnboundedSender<Message>,
  reader: tokio::task::JoinHandle<()>,
  writer: tokio::task::JoinHandle<()>,
}

impl SdrconnectRuntime {
  pub(crate) fn sample_rate(&self) -> u32 {
    self
      .reported_sample_rate
      .lock()
      .ok()
      .and_then(|v| *v)
      .unwrap_or(self.cfg.sample_rate)
  }

  pub(crate) fn buffer(&self) -> Arc<StdMutex<VecDeque<Complex32>>> {
    Arc::clone(&self.buffer)
  }

  pub(crate) async fn connect(
    cfg: SdrconnectRadioInstanceConfig,
    initial_freq: u64,
    _initial_gain: Option<f32>,
  ) -> anyhow::Result<Self> {
    let (ws, _resp) = connect_async(cfg.url.clone()).await?;
    let (mut sink, mut stream) = ws.split();

    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let stop = Arc::new(AtomicBool::new(false));
    let started = Arc::new(AtomicBool::new(false));
    let buffer = Arc::new(StdMutex::new(VecDeque::new()));
    let reported_sample_rate = Arc::new(StdMutex::new(None));

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
    let rate_reader = Arc::clone(&reported_sample_rate);
    let reader = tokio::spawn(async move {
      let max_len = (cfg_reader.sample_rate as usize).saturating_mul(2);

      while let Some(next) = stream.next().await {
        if stop_reader.load(Ordering::Relaxed) {
          break;
        }

        match next {
          Ok(Message::Binary(bin)) => {
            if let Some(iq) = decode_iq_frame(&bin) {
              if let Ok(mut q) = buf_reader.lock() {
                q.extend(iq);
                while q.len() > max_len {
                  q.pop_front();
                }
              }
            }
          }
          Ok(Message::Text(text)) => {
            if let Some(msg) = parse_text_message(&text) {
              if msg.event_type == "get_property_response" || msg.event_type == "property_changed" {
                if msg.property.as_deref() == Some("device_sample_rate") {
                  if let Some(v) = msg.value.as_deref() {
                    if let Ok(sr) = v.parse::<u32>() {
                      if let Ok(mut g) = rate_reader.lock() {
                        *g = Some(sr);
                      }
                    }
                  }
                }
              }
            } else {
              debug!(len = text.len(), "SDRconnect ws text (unparsed)");
            }
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
      reported_sample_rate,
      stop,
      started,
      tx,
      reader,
      writer,
    };

    // Configure device (select + initial parameters). Streaming starts on demand.
    if let Some(idx) = rt.cfg.device_id {
      let _ = rt.set_selected_device(idx as i32);
    }

    let _ = rt.get_property("device_sample_rate");
    rt.set_center_frequency(initial_freq)?;

    if let Some(level) = rt.cfg.squelch {
      let _ = rt.set_squelch(level as f32);
    }

    Ok(rt)
  }

  pub(crate) async fn shutdown(self) {
    self.stop.store(true, Ordering::Relaxed);
    let _ = self.stop_streaming();
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
    self.send_event("iq_stream_enable", None, Some("true"))?;
    Ok(())
  }

  fn stop_streaming(&self) -> anyhow::Result<()> {
    if !self.started.swap(false, Ordering::Relaxed) {
      return Ok(());
    }
    self.send_event("iq_stream_enable", None, Some("false"))?;
    Ok(())
  }

  pub(crate) fn set_center_frequency(&self, freq: u64) -> anyhow::Result<()> {
    self.send_event("set_property", Some("device_center_frequency"), Some(&freq.to_string()))?;
    Ok(())
  }

  pub(crate) fn set_gain(&self, gain: f32) -> anyhow::Result<()> {
    // Not currently exposed by the SDRconnect WebSocket API.
    let _ = gain;
    Ok(())
  }

  pub(crate) fn set_squelch(&self, level: f32) -> anyhow::Result<()> {
    let l = level.round() as i32;
    let _ = self.send_event("set_property", Some("squelch_enable"), Some("true"));
    let _ = self.send_event("set_property", Some("squelch_threshold"), Some(&l.to_string()));
    Ok(())
  }

  fn set_selected_device(&self, idx: i32) -> anyhow::Result<()> {
    self.send_event("selected_device", None, Some(&idx.to_string()))?;
    Ok(())
  }

  fn get_property(&self, prop: &str) -> anyhow::Result<()> {
    self.send_event("get_property", Some(prop), None)?;
    Ok(())
  }

  fn send_event(&self, event_type: &str, property: Option<&str>, value: Option<&str>) -> anyhow::Result<()> {
    let v = serde_json::json!({
      "event_type": event_type,
      // SDRconnect requires these fields, even when unused.
      "property": property.unwrap_or(""),
      "value": value.unwrap_or(""),
    });
    let text = serde_json::to_string(&v)?;
    self
      .tx
      .send(Message::Text(text))
      .map_err(|_| anyhow::anyhow!("SDRconnect command channel closed"))?;
    Ok(())
  }
}

fn parse_text_message(text: &str) -> Option<SdrconnectWsMessage> {
  let v: serde_json::Value = serde_json::from_str(text).ok()?;
  let event_type = v.get("event_type")?.as_str()?.to_string();
  let property = v.get("property").and_then(|p| p.as_str()).map(|s| s.to_string());
  let value = v.get("value").and_then(|p| p.as_str()).map(|s| s.to_string());
  Some(SdrconnectWsMessage { event_type, property, value })
}

fn decode_iq_frame(bin: &[u8]) -> Option<Vec<Complex32>> {
  if bin.len() < 2 {
    return None;
  }
  let header = u16::from_le_bytes([bin[0], bin[1]]);
  if header != (SdrconnectBinaryKind::Iq as u16) {
    return None;
  }
  let payload = &bin[2..];
  decode_iq_s16le(payload)
}

fn decode_iq_s16le(bin: &[u8]) -> Option<Vec<Complex32>> {
  if bin.len() < 4 {
    return None;
  }
  let n_i16 = bin.len() / 2;
  if n_i16 < 2 {
    return None;
  }
  let pairs = (n_i16 / 2).max(1);
  let mut out = Vec::with_capacity(pairs);
  let mut it = bin.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]));
  while let (Some(i), Some(q)) = (it.next(), it.next()) {
    out.push(Complex32::new(i as f32 / 32768.0, q as f32 / 32768.0));
  }
  Some(out)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_text_envelope() {
    let msg = parse_text_message(
      r#"{"event_type":"get_property_response","property":"device_sample_rate","value":"2048000"}"#,
    )
    .unwrap();
    assert_eq!(msg.event_type, "get_property_response");
    assert_eq!(msg.property.as_deref(), Some("device_sample_rate"));
    assert_eq!(msg.value.as_deref(), Some("2048000"));
  }

  #[test]
  fn decode_iq_frame_pairs() {
    // header 0x0002 + (i=32767, q=-32768)
    let frame = [0x02, 0x00, 0xff, 0x7f, 0x00, 0x80];
    let iq = decode_iq_frame(&frame).unwrap();
    assert_eq!(iq.len(), 1);
    assert!(iq[0].re > 0.9);
    assert!(iq[0].im < -0.9);
  }
}
