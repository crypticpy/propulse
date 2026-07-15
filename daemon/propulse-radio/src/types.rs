use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GainStage {
  pub name: String,
  pub min: f32,
  pub max: f32,
  pub step: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RadioCommandCapabilities {
  pub tune: bool,
  pub mode: bool,
  pub gain: bool,
  pub squelch: bool,
  pub agc: bool,
  pub antenna: bool,
  pub filter: bool,
  pub nr: bool,
  pub nb: bool,
  pub ptt: bool,
  pub vfo: bool,
  pub rit: bool,
  pub xit: bool,
  pub split: bool,
  pub anf: bool,
  pub qsk: bool,
  pub vox: bool,
  pub if_shift: bool,
  pub cw_speed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioCapabilities {
  pub can_transmit: bool,
  pub can_stream_iq: bool,
  pub can_stream_fft: bool,
  pub can_stream_audio: bool,
  pub antennas: Vec<String>,
  pub modes: Vec<String>,
  pub frequency_range: (u64, u64),
  pub sample_rates: Vec<u32>,
  pub gain_stages: Vec<GainStage>,
  #[serde(default)]
  pub commands: RadioCommandCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RadioType {
  Sdr,
  Transceiver,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
  pub device_id: String,
  pub name: String,
  pub driver: String,
  #[serde(rename = "type")]
  pub device_type: RadioType,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub serial: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub port: Option<String>,
  pub available: bool,
  pub capabilities: RadioCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioFilter {
  pub low: i32,
  pub high: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioNr {
  pub enabled: bool,
  pub level: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioNb {
  pub enabled: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub threshold: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioState {
  pub connected: bool,
  pub freq: u64,
  pub mode: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub antenna: Option<String>,
  #[serde(default)]
  pub gains: BTreeMap<String, f32>,
  #[serde(default)]
  pub agc: bool,
  #[serde(rename = "agcMode", skip_serializing_if = "Option::is_none")]
  pub agc_mode: Option<u8>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ptt: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub filter: Option<RadioFilter>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub nr: Option<RadioNr>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub nb: Option<RadioNb>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub squelch: Option<f32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub signal_dbm: Option<f32>,
}
