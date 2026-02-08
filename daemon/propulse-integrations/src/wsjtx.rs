use std::time::SystemTime;

use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;

const WSJTX_MAGIC: u32 = 0xadbccbda;
const WSJTX_SCHEMA_VERSION: u32 = 2;

#[repr(u32)]
enum WSJTXMessageType {
  Heartbeat = 0,
  Status = 1,
  Decode = 2,
  Clear = 3,
  QSOLogged = 5,
  LoggedADIF = 12,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WSJTXStatus {
  pub frequency: u64,
  pub mode: String,
  #[serde(skip_serializing_if = "Option::is_none", rename = "dxCall")]
  pub dx_call: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", rename = "dxGrid")]
  pub dx_grid: Option<String>,
  #[serde(rename = "txEnabled")]
  pub tx_enabled: bool,
  pub decoding: bool,
  #[serde(rename = "rxDF")]
  pub rx_df: u32,
  #[serde(rename = "txDF")]
  pub tx_df: u32,
  #[serde(skip_serializing_if = "Option::is_none", rename = "instanceId")]
  pub instance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WSJTXDecode {
  #[serde(rename = "isNew")]
  pub is_new: bool,
  pub time: u32,
  pub snr: i32,
  #[serde(rename = "deltaTime")]
  pub delta_time: f64,
  #[serde(rename = "deltaFrequency")]
  pub delta_frequency: u32,
  pub mode: String,
  pub message: String,
  #[serde(rename = "lowConfidence")]
  pub low_confidence: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub callsign: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub grid: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", rename = "instanceId")]
  pub instance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WSJTXQSOLogged {
  pub callsign: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub grid: Option<String>,
  pub frequency: u64,
  pub mode: String,
  #[serde(rename = "reportSent")]
  pub report_sent: String,
  #[serde(rename = "reportReceived")]
  pub report_received: String,
  #[serde(rename = "txPower")]
  pub tx_power: String,
  pub comments: String,
  pub timestamp: String,
  #[serde(skip_serializing_if = "Option::is_none", rename = "adifRecord")]
  pub adif_record: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", rename = "instanceId")]
  pub instance_id: Option<String>,
}

#[derive(Debug, Clone)]
pub enum WSJTXEvent {
  Status(WSJTXStatus),
  Decode(WSJTXDecode),
  QsoLogged(WSJTXQSOLogged),
  Clear { window: Option<String>, instance_id: Option<String> },
}

pub async fn run_wsjtx_listener(
  port: u16,
  mut on_event: impl FnMut(WSJTXEvent) + Send + 'static,
  mut should_stop: impl FnMut() -> bool + Send + 'static,
) -> anyhow::Result<()> {
  let socket = UdpSocket::bind(("127.0.0.1", port)).await?;
  let mut buf = vec![0u8; 64 * 1024];

  loop {
    if should_stop() {
      break;
    }

    let (len, _) = socket.recv_from(&mut buf).await?;
    if len < 12 {
      continue;
    }
    if let Ok(Some(ev)) = parse_datagram(&buf[..len]) {
      on_event(ev);
    }
  }

  Ok(())
}

fn parse_datagram(buf: &[u8]) -> anyhow::Result<Option<WSJTXEvent>> {
  let mut r = QDataStreamReader::new(buf);
  let magic = r.read_u32()?;
  if magic != WSJTX_MAGIC {
    return Ok(None);
  }

  let schema = r.read_u32()?;
  if schema > WSJTX_SCHEMA_VERSION + 1 {
    return Ok(None);
  }

  let msg_type = r.read_u32()?;
  let instance_id = r.read_utf8()?.unwrap_or_else(|| "WSJT-X".to_string());

  match msg_type {
    x if x == WSJTXMessageType::Heartbeat as u32 => Ok(None),
    x if x == WSJTXMessageType::Status as u32 => parse_status(&mut r, instance_id).map(Some),
    x if x == WSJTXMessageType::Decode as u32 => parse_decode(&mut r, instance_id).map(Some),
    x if x == WSJTXMessageType::Clear as u32 => parse_clear(&mut r, instance_id).map(Some),
    x if x == WSJTXMessageType::QSOLogged as u32 => parse_qso_logged(&mut r, instance_id).map(Some),
    x if x == WSJTXMessageType::LoggedADIF as u32 => parse_logged_adif(&mut r, instance_id).map(Some),
    _ => Ok(None),
  }
}

fn parse_status(r: &mut QDataStreamReader<'_>, instance_id: String) -> anyhow::Result<WSJTXEvent> {
  let dial_frequency = r.read_u64_as_number()?;
  let mode = r.read_utf8()?.unwrap_or_default();
  let dx_call = r.read_utf8()?;
  let _report = r.read_utf8()?;
  let _tx_mode = r.read_utf8()?;
  let tx_enabled = r.read_bool()?;
  let _transmitting = r.read_bool()?;
  let decoding = r.read_bool()?;
  let rx_df = r.read_u32()?;
  let tx_df = r.read_u32()?;
  let _de_call = r.read_utf8()?;
  let _de_grid = r.read_utf8()?;
  let dx_grid = r.read_utf8()?;

  Ok(WSJTXEvent::Status(WSJTXStatus {
    frequency: dial_frequency,
    mode,
    dx_call,
    dx_grid,
    tx_enabled,
    decoding,
    rx_df,
    tx_df,
    instance_id: Some(instance_id),
  }))
}

fn parse_decode(r: &mut QDataStreamReader<'_>, instance_id: String) -> anyhow::Result<WSJTXEvent> {
  let is_new = r.read_bool()?;
  let time = r.read_u32()?; // QTime ms since midnight
  let snr = r.read_i32()?;
  let delta_time = r.read_f64()?;
  let delta_frequency = r.read_u32()?;
  let mode = r.read_utf8()?.unwrap_or_default();
  let message = r.read_utf8()?.unwrap_or_default();
  let low_confidence = r.read_bool()?;

  let (callsign, grid) = extract_call_info(&message);

  Ok(WSJTXEvent::Decode(WSJTXDecode {
    is_new,
    time,
    snr,
    delta_time,
    delta_frequency,
    mode,
    message,
    low_confidence,
    callsign,
    grid,
    instance_id: Some(instance_id),
  }))
}

fn parse_clear(r: &mut QDataStreamReader<'_>, instance_id: String) -> anyhow::Result<WSJTXEvent> {
  let window = if r.remaining() >= 1 {
    match r.read_u8()? {
      0 => Some("band_activity".to_string()),
      1 => Some("rx_frequency".to_string()),
      _ => None,
    }
  } else {
    None
  };

  Ok(WSJTXEvent::Clear {
    window,
    instance_id: Some(instance_id),
  })
}

fn parse_qso_logged(r: &mut QDataStreamReader<'_>, instance_id: String) -> anyhow::Result<WSJTXEvent> {
  let _date_time_off = r.read_qdatetime()?;
  let callsign = r.read_utf8()?.unwrap_or_default();
  let grid = r.read_utf8()?;
  let dial_frequency = r.read_u64_as_number()?;
  let mode = r.read_utf8()?.unwrap_or_default();
  let report_sent = r.read_utf8()?.unwrap_or_default();
  let report_received = r.read_utf8()?.unwrap_or_default();
  let tx_power = r.read_utf8()?.unwrap_or_default();
  let comments = r.read_utf8()?.unwrap_or_default();
  let _op = r.read_utf8()?;
  let _date_time_on = r.read_qdatetime()?;

  Ok(WSJTXEvent::QsoLogged(WSJTXQSOLogged {
    callsign,
    grid,
    frequency: dial_frequency,
    mode,
    report_sent,
    report_received,
    tx_power,
    comments,
    timestamp: chrono::Utc::now().to_rfc3339(),
    adif_record: None,
    instance_id: Some(instance_id),
  }))
}

fn parse_logged_adif(r: &mut QDataStreamReader<'_>, instance_id: String) -> anyhow::Result<WSJTXEvent> {
  let adif = r.read_utf8()?;
  let callsign = extract_adif_field(adif.as_deref(), "CALL").unwrap_or_default();
  let grid = extract_adif_field(adif.as_deref(), "GRIDSQUARE");
  let freq_str = extract_adif_field(adif.as_deref(), "FREQ");
  let mode = extract_adif_field(adif.as_deref(), "MODE").unwrap_or_default();

  let frequency = freq_str
    .and_then(|s| s.parse::<f64>().ok())
    .map(|mhz| (mhz * 1_000_000.0) as u64)
    .unwrap_or(0);

  Ok(WSJTXEvent::QsoLogged(WSJTXQSOLogged {
    callsign,
    grid,
    frequency,
    mode,
    report_sent: extract_adif_field(adif.as_deref(), "RST_SENT").unwrap_or_default(),
    report_received: extract_adif_field(adif.as_deref(), "RST_RCVD").unwrap_or_default(),
    tx_power: extract_adif_field(adif.as_deref(), "TX_PWR").unwrap_or_default(),
    comments: extract_adif_field(adif.as_deref(), "COMMENT").unwrap_or_default(),
    timestamp: chrono::Utc::now().to_rfc3339(),
    adif_record: adif,
    instance_id: Some(instance_id),
  }))
}

// ────────────────────────────────────────────────────────────────────────────
// QDataStream reader helpers
// ────────────────────────────────────────────────────────────────────────────

struct QDataStreamReader<'a> {
  buf: &'a [u8],
  off: usize,
}

impl<'a> QDataStreamReader<'a> {
  fn new(buf: &'a [u8]) -> Self {
    Self { buf, off: 0 }
  }

  fn remaining(&self) -> usize {
    self.buf.len().saturating_sub(self.off)
  }

  fn read_u8(&mut self) -> anyhow::Result<u8> {
    if self.remaining() < 1 {
      return Err(anyhow::anyhow!("buffer underflow u8"));
    }
    let v = self.buf[self.off];
    self.off += 1;
    Ok(v)
  }

  fn read_bool(&mut self) -> anyhow::Result<bool> {
    Ok(self.read_u8()? != 0)
  }

  fn read_u32(&mut self) -> anyhow::Result<u32> {
    if self.remaining() < 4 {
      return Err(anyhow::anyhow!("buffer underflow u32"));
    }
    let v = u32::from_be_bytes(self.buf[self.off..self.off + 4].try_into()?);
    self.off += 4;
    Ok(v)
  }

  fn read_i32(&mut self) -> anyhow::Result<i32> {
    if self.remaining() < 4 {
      return Err(anyhow::anyhow!("buffer underflow i32"));
    }
    let v = i32::from_be_bytes(self.buf[self.off..self.off + 4].try_into()?);
    self.off += 4;
    Ok(v)
  }

  fn read_f64(&mut self) -> anyhow::Result<f64> {
    if self.remaining() < 8 {
      return Err(anyhow::anyhow!("buffer underflow f64"));
    }
    let v = f64::from_be_bytes(self.buf[self.off..self.off + 8].try_into()?);
    self.off += 8;
    Ok(v)
  }

  fn read_utf8(&mut self) -> anyhow::Result<Option<String>> {
    let len = self.read_u32()?;
    if len == 0xffff_ffff {
      return Ok(None);
    }
    let len = len as usize;
    if self.remaining() < len {
      return Err(anyhow::anyhow!("buffer underflow utf8"));
    }
    let s = std::str::from_utf8(&self.buf[self.off..self.off + len])?.to_string();
    self.off += len;
    Ok(Some(s))
  }

  fn read_u64_as_number(&mut self) -> anyhow::Result<u64> {
    // QDataStream encodes u64 as two u32 big-endian parts.
    let high = self.read_u32()? as u64;
    let low = self.read_u32()? as u64;
    Ok((high << 32) | low)
  }

  fn read_qdatetime(&mut self) -> anyhow::Result<SystemTime> {
    // Format: int64 Julian day + u32 ms since midnight + u8 timespec
    let julian_high = self.read_i32()? as i64;
    let julian_low = self.read_u32()? as i64;
    let julian = (julian_high << 32) | (julian_low & 0xffff_ffff);
    let ms_midnight = self.read_u32()? as i64;
    let _timespec = self.read_u8()?;

    // Julian Day 2440587.5 = Unix epoch. In WSJT-X wire format, this matches the
    // approach used in the existing bridge implementation: subtract 2440588.
    let unix_days = julian - 2_440_588;
    let ms = unix_days * 86_400_000 + ms_midnight;
    Ok(SystemTime::UNIX_EPOCH + std::time::Duration::from_millis(ms.max(0) as u64))
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Message parsing helpers
// ────────────────────────────────────────────────────────────────────────────

fn extract_call_info(message: &str) -> (Option<String>, Option<String>) {
  // CQ [dir] CALL GRID
  let cq_re = Regex::new(r"^CQ\s+(?:(\w{2,4})\s+)?([A-Z0-9/]{3,})\s+([A-R]{2}\d{2}(?:[a-x]{2})?)$").ok();
  if let Some(re) = cq_re {
    if let Some(caps) = re.captures(message.trim()) {
      return (
        caps.get(2).map(|m| m.as_str().to_string()),
        caps.get(3).map(|m| m.as_str().to_string()),
      );
    }
  }

  let grid_re = Regex::new(r"^([A-Z0-9/]{3,})\s+([A-Z0-9/]{3,})\s+([A-R]{2}\d{2}(?:[a-x]{2})?)$").ok();
  if let Some(re) = grid_re {
    if let Some(caps) = re.captures(message.trim()) {
      return (
        caps.get(2).map(|m| m.as_str().to_string()),
        caps.get(3).map(|m| m.as_str().to_string()),
      );
    }
  }

  let report_re = Regex::new(r"^([A-Z0-9/]{3,})\s+([A-Z0-9/]{3,})\s+(R?[+-]\d{2}|RR73|RRR|73)$").ok();
  if let Some(re) = report_re {
    if let Some(caps) = re.captures(message.trim()) {
      return (caps.get(2).map(|m| m.as_str().to_string()), None);
    }
  }

  (None, None)
}

fn extract_adif_field(adif: Option<&str>, field: &str) -> Option<String> {
  let adif = adif?;
  let re = Regex::new(&format!(r"(?i)<{field}:\d+(?::[^>]*)?>([^<]*)")).ok()?;
  let caps = re.captures(adif)?;
  Some(caps.get(1)?.as_str().trim().to_string())
}
