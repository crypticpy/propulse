#[derive(Debug, Clone)]
pub struct SerialPortInfo {
  pub port_name: String,
  pub description: Option<String>,
  pub vid: Option<u16>,
  pub pid: Option<u16>,
  pub serial_number: Option<String>,
}

pub fn list_serial_ports() -> anyhow::Result<Vec<SerialPortInfo>> {
  let ports = serialport::available_ports()?;
  Ok(
    ports
      .into_iter()
      .map(|p| SerialPortInfo {
        port_name: p.port_name,
        description: match &p.port_type {
          serialport::SerialPortType::UsbPort(info) => info.product.clone(),
          serialport::SerialPortType::PciPort => Some("PCI".to_string()),
          serialport::SerialPortType::BluetoothPort => Some("Bluetooth".to_string()),
          serialport::SerialPortType::Unknown => None,
        },
        vid: match &p.port_type {
          serialport::SerialPortType::UsbPort(info) => Some(info.vid),
          _ => None,
        },
        pid: match &p.port_type {
          serialport::SerialPortType::UsbPort(info) => Some(info.pid),
          _ => None,
        },
        serial_number: match &p.port_type {
          serialport::SerialPortType::UsbPort(info) => info.serial_number.clone(),
          _ => None,
        },
      })
      .collect(),
  )
}
