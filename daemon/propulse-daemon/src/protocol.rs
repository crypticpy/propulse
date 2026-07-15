use serde::{Deserialize, Serialize};

use propulse_radio::types::{DeviceInfo, RadioState};

pub const PROTOCOL_VERSION: &str = "1.1.0";
pub const FRAME_TYPE_FFT: u8 = 0x01;
pub const FRAME_TYPE_AUDIO: u8 = 0x02;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hello {
  #[serde(rename = "type")]
  pub kind: String,
  pub version: String,
  pub daemon_id: String,
  pub features: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicesList {
  #[serde(rename = "type")]
  pub kind: String,
  pub devices: Vec<DeviceInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioStateEvent {
  #[serde(rename = "type")]
  pub kind: String,
  pub device_id: String,
  pub state: RadioState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioSmeterEvent {
  #[serde(rename = "type")]
  pub kind: String,
  pub device_id: String,
  pub dbm: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatusEvent {
  #[serde(rename = "type")]
  pub kind: String,
  pub version: String,
  pub uptime_secs: u64,
  pub platform: String,
  pub connected_radios: usize,
  pub active_streams: usize,
  pub cpu_percent: f32,
  pub memory_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
  #[serde(rename = "type")]
  pub kind: String,
  pub id: String,
  pub success: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl Response {
  pub fn ok(id: impl Into<String>) -> Self {
    Self {
      kind: "response".to_string(),
      id: id.into(),
      success: true,
      error: None,
    }
  }

  pub fn err(id: impl Into<String>, message: impl Into<String>) -> Self {
    Self {
      kind: "response".to_string(),
      id: id.into(),
      success: false,
      error: Some(message.into()),
    }
  }
}

pub fn build_fft_frame(dev_idx: u8, center_hz: f64, span_hz: f64, bins: &[f32]) -> Vec<u8> {
  let mut out = Vec::with_capacity(1 + 1 + 8 + 8 + (bins.len() * 4));
  out.push(FRAME_TYPE_FFT);
  out.push(dev_idx);
  out.extend_from_slice(&center_hz.to_le_bytes());
  out.extend_from_slice(&span_hz.to_le_bytes());
  for v in bins {
    out.extend_from_slice(&v.to_le_bytes());
  }
  out
}

pub fn build_audio_frame(dev_idx: u8, sample_rate: u32, samples: &[i16]) -> Vec<u8> {
  let mut out = Vec::with_capacity(1 + 1 + 4 + (samples.len() * 2));
  out.push(FRAME_TYPE_AUDIO);
  out.push(dev_idx);
  out.extend_from_slice(&sample_rate.to_le_bytes());
  for s in samples {
    out.extend_from_slice(&s.to_le_bytes());
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn fft_frame_roundtrip() {
    let dev_idx = 7;
    let center = 14_074_000.0;
    let span = 2_048_000.0;
    let bins = [1.0f32, -5.5f32, 3.25f32];

    let bytes = build_fft_frame(dev_idx, center, span, &bins);
    assert_eq!(bytes[0], FRAME_TYPE_FFT);
    assert_eq!(bytes[1], dev_idx);

    let center_bytes: [u8; 8] = bytes[2..10].try_into().unwrap();
    let span_bytes: [u8; 8] = bytes[10..18].try_into().unwrap();
    assert_eq!(f64::from_le_bytes(center_bytes), center);
    assert_eq!(f64::from_le_bytes(span_bytes), span);

    let b0: [u8; 4] = bytes[18..22].try_into().unwrap();
    let b1: [u8; 4] = bytes[22..26].try_into().unwrap();
    let b2: [u8; 4] = bytes[26..30].try_into().unwrap();
    assert_eq!(f32::from_le_bytes(b0), bins[0]);
    assert_eq!(f32::from_le_bytes(b1), bins[1]);
    assert_eq!(f32::from_le_bytes(b2), bins[2]);
  }

  #[test]
  fn audio_frame_roundtrip() {
    let dev_idx = 1;
    let sample_rate = 48_000u32;
    let samples = [0i16, 1234i16, -1234i16, i16::MAX];

    let bytes = build_audio_frame(dev_idx, sample_rate, &samples);
    assert_eq!(bytes[0], FRAME_TYPE_AUDIO);
    assert_eq!(bytes[1], dev_idx);

    let sr: [u8; 4] = bytes[2..6].try_into().unwrap();
    assert_eq!(u32::from_le_bytes(sr), sample_rate);

    let s0: [u8; 2] = bytes[6..8].try_into().unwrap();
    let s1: [u8; 2] = bytes[8..10].try_into().unwrap();
    let s2: [u8; 2] = bytes[10..12].try_into().unwrap();
    let s3: [u8; 2] = bytes[12..14].try_into().unwrap();
    assert_eq!(i16::from_le_bytes(s0), samples[0]);
    assert_eq!(i16::from_le_bytes(s1), samples[1]);
    assert_eq!(i16::from_le_bytes(s2), samples[2]);
    assert_eq!(i16::from_le_bytes(s3), samples[3]);
  }
}
