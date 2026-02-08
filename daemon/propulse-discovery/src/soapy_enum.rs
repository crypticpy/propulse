#[derive(Debug, Clone)]
pub struct SoapyDeviceInfo {
  pub driver: String,
  pub label: String,
  pub serial: Option<String>,
}

/// Enumerate SoapySDR devices.
///
/// The full SoapySDR backend requires the SoapySDR shared library and vendor
/// modules to be installed on the host. If SoapySDR isn't available, this
/// returns an empty list.
pub fn enumerate_soapy_devices() -> anyhow::Result<Vec<SoapyDeviceInfo>> {
  // TODO(PRD): implement dynamic SoapySDR loading + enumeration.
  Ok(Vec::new())
}

