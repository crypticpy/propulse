use std::collections::HashMap;

use crate::dummy::{dummy_device, dummy_state};
use crate::types::{DeviceInfo, RadioFilter, RadioNb, RadioNr, RadioState};

pub struct RadioManager {
  devices: Vec<DeviceInfo>,
  states: HashMap<String, RadioState>,
}

impl RadioManager {
  pub fn new(dummy_enabled: bool) -> Self {
    let mut devices = Vec::new();
    let mut states = HashMap::new();

    if dummy_enabled {
      let dev = dummy_device("dummy:0");
      states.insert(dev.device_id.clone(), dummy_state(14_074_000, "USB"));
      devices.push(dev);
    }

    Self { devices, states }
  }

  pub fn devices(&self) -> &[DeviceInfo] {
    &self.devices
  }

  pub fn device(&self, device_id: &str) -> Option<&DeviceInfo> {
    self.devices.iter().find(|d| d.device_id == device_id)
  }

  pub fn state(&self, device_id: &str) -> Option<&RadioState> {
    self.states.get(device_id)
  }

  pub fn connect(&mut self, device_id: &str) -> anyhow::Result<RadioState> {
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    if state.connected {
      return Err(anyhow::anyhow!("Device already connected"));
    }
    state.connected = true;
    Ok(state.clone())
  }

  pub fn disconnect(&mut self, device_id: &str) -> anyhow::Result<RadioState> {
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.connected = false;
    Ok(state.clone())
  }

  pub fn tune(&mut self, device_id: &str, freq: u64) -> anyhow::Result<RadioState> {
    let dev = self
      .device(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    let (min, max) = dev.capabilities.frequency_range;
    if freq < min || freq > max {
      return Err(anyhow::anyhow!(
        "Frequency out of range for device ({min}..{max}): {freq}"
      ));
    }

    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.freq = freq;
    Ok(state.clone())
  }

  pub fn set_mode(&mut self, device_id: &str, mode: &str) -> anyhow::Result<RadioState> {
    let dev = self
      .device(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    if !dev.capabilities.modes.iter().any(|m| m == mode) {
      return Err(anyhow::anyhow!("Unsupported mode for device: {mode}"));
    }

    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.mode = mode.to_string();
    Ok(state.clone())
  }

  pub fn set_gain(
    &mut self,
    device_id: &str,
    stage: &str,
    value: f32,
  ) -> anyhow::Result<RadioState> {
    let dev = self
      .device(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    let stage_def = dev
      .capabilities
      .gain_stages
      .iter()
      .find(|s| s.name == stage)
      .ok_or_else(|| anyhow::anyhow!("Unknown gain stage: {stage}"))?;

    let clamped = value.clamp(stage_def.min, stage_def.max);
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.gains.insert(stage.to_string(), clamped);
    Ok(state.clone())
  }

  pub fn set_agc(
    &mut self,
    device_id: &str,
    enabled: bool,
  ) -> anyhow::Result<RadioState> {
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.agc = enabled;
    Ok(state.clone())
  }

  pub fn set_ptt(&mut self, device_id: &str, active: bool) -> anyhow::Result<RadioState> {
    let dev = self
      .device(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    if !dev.capabilities.can_transmit {
      return Err(anyhow::anyhow!("PTT not supported (RX only)"));
    }

    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.ptt = Some(active);
    Ok(state.clone())
  }

  pub fn set_filter(&mut self, device_id: &str, low: i32, high: i32) -> anyhow::Result<RadioState> {
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.filter = Some(RadioFilter { low, high });
    Ok(state.clone())
  }

  pub fn set_nr(&mut self, device_id: &str, enabled: bool, level: u8) -> anyhow::Result<RadioState> {
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.nr = Some(RadioNr { enabled, level: level.min(5) });
    Ok(state.clone())
  }

  pub fn set_nb(
    &mut self,
    device_id: &str,
    enabled: bool,
    threshold: Option<u32>,
  ) -> anyhow::Result<RadioState> {
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.nb = Some(RadioNb { enabled, threshold });
    Ok(state.clone())
  }

  pub fn set_squelch(&mut self, device_id: &str, level: f32) -> anyhow::Result<RadioState> {
    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.squelch = Some(level);
    Ok(state.clone())
  }

  pub fn set_antenna(
    &mut self,
    device_id: &str,
    antenna: &str,
  ) -> anyhow::Result<RadioState> {
    let dev = self
      .device(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    if !dev.capabilities.antennas.iter().any(|a| a == antenna) {
      return Err(anyhow::anyhow!("Unknown antenna port: {antenna}"));
    }

    let state = self
      .states
      .get_mut(device_id)
      .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
    state.antenna = Some(antenna.to_string());
    Ok(state.clone())
  }
}
