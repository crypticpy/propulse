use cpal::traits::{DeviceTrait, HostTrait};

/// Best-effort search for a "virtual cable" style output device name.
/// Users are expected to install an OS-specific virtual audio driver (e.g. VB-Audio).
pub fn find_virtual_cable_device_name() -> anyhow::Result<Option<String>> {
  let host = cpal::default_host();
  let mut names = Vec::new();
  for dev in host.output_devices()? {
    if let Ok(name) = dev.name() {
      names.push(name);
    }
  }

  let hay = names
    .iter()
    .map(|n| n.to_lowercase())
    .collect::<Vec<_>>();
  for (idx, lower) in hay.iter().enumerate() {
    if lower.contains("cable")
      || lower.contains("vb-audio")
      || lower.contains("virtual")
      || lower.contains("loopback")
    {
      return Ok(Some(names[idx].clone()));
    }
  }

  Ok(None)
}

