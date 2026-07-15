use std::collections::BTreeMap;

use crate::types::{
  DeviceInfo, GainStage, RadioCapabilities, RadioCommandCapabilities, RadioState, RadioType,
};

pub fn dummy_device(device_id: &str) -> DeviceInfo {
  DeviceInfo {
    device_id: device_id.to_string(),
    name: "Dummy SDR (Simulated)".to_string(),
    driver: "dummy".to_string(),
    device_type: RadioType::Sdr,
    serial: Some("DUMMY0001".to_string()),
    port: None,
    available: true,
    capabilities: RadioCapabilities {
      can_transmit: false,
      can_stream_iq: false,
      can_stream_fft: true,
      can_stream_audio: true,
      antennas: vec!["RX".to_string()],
      modes: vec![
        "USB".to_string(),
        "LSB".to_string(),
        "CW".to_string(),
        "AM".to_string(),
        "FM".to_string(),
      ],
      frequency_range: (1_000, 2_000_000_000),
      sample_rates: vec![2_048_000, 4_096_000],
      gain_stages: vec![
        GainStage {
          name: "LNA".to_string(),
          min: 0.0,
          max: 9.0,
          step: 1.0,
        },
        GainStage {
          name: "IF".to_string(),
          min: -59.0,
          max: 0.0,
          step: 1.0,
        },
      ],
      commands: RadioCommandCapabilities {
        tune: true,
        mode: true,
        gain: true,
        agc: true,
        antenna: true,
        filter: true,
        nr: true,
        nb: true,
        ..RadioCommandCapabilities::default()
      },
    },
  }
}

pub fn dummy_state(freq: u64, mode: &str) -> RadioState {
  let mut gains = BTreeMap::new();
  gains.insert("LNA".to_string(), 5.0);
  gains.insert("IF".to_string(), -30.0);

  RadioState {
    connected: false,
    freq,
    mode: mode.to_string(),
    antenna: Some("RX".to_string()),
    gains,
    agc: false,
    agc_mode: Some(0),
    ptt: None,
    filter: None,
    nr: None,
    nb: None,
    squelch: None,
    signal_dbm: Some(-92.0),
  }
}
