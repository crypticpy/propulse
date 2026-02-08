use std::net::SocketAddr;

use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct N1mmConfig {
  #[serde(default = "default_broadcast_port")]
  pub broadcast_port: u16,
}

fn default_broadcast_port() -> u16 {
  12060
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct N1mmScore {
  pub raw_xml: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct N1mmContact {
  pub raw_xml: String,
}

#[derive(Debug, Clone)]
pub enum N1mmEvent {
  Score(N1mmScore),
  Contact(N1mmContact),
  Unknown(String),
}

pub async fn run_n1mm_listener(
  port: u16,
  mut on_event: impl FnMut(N1mmEvent) + Send + 'static,
  mut should_stop: impl FnMut() -> bool + Send + 'static,
) -> anyhow::Result<()> {
  let socket = UdpSocket::bind(("0.0.0.0", port)).await?;
  let mut buf = vec![0u8; 64 * 1024];

  loop {
    if should_stop() {
      break;
    }

    let (len, _) = socket.recv_from(&mut buf).await?;
    if len == 0 {
      continue;
    }

    let raw = String::from_utf8_lossy(&buf[..len]).to_string();
    let upper = raw.to_uppercase();
    if upper.contains("<SCOREREPORT") || upper.contains("<SCORE") {
      on_event(N1mmEvent::Score(N1mmScore { raw_xml: raw }));
    } else if upper.contains("<CONTACTINFO") || upper.contains("<CONTACT") {
      on_event(N1mmEvent::Contact(N1mmContact { raw_xml: raw }));
    } else {
      on_event(N1mmEvent::Unknown(raw));
    }
  }

  Ok(())
}

pub async fn broadcast_n1mm_xml(port: u16, xml: &str) -> anyhow::Result<()> {
  let socket = UdpSocket::bind(("0.0.0.0", 0)).await?;
  socket.set_broadcast(true)?;
  let addr: SocketAddr = format!("255.255.255.255:{port}").parse()?;
  socket.send_to(xml.as_bytes(), addr).await?;
  Ok(())
}

pub fn wsjtx_qso_to_n1mm_contact_xml(qso: &crate::wsjtx::WSJTXQSOLogged) -> String {
  // N1MM+ expects UDP XML. This is a minimal "contactinfo"-like payload.
  // Fields vary across integrations; keeping it simple while remaining useful.
  let freq_hz = qso.frequency;
  let freq_khz = (freq_hz as f64) / 1000.0;

  format!(
    r#"<?xml version="1.0" encoding="UTF-8"?><contactinfo><call>{}</call><grid>{}</grid><freq>{:.1}</freq><mode>{}</mode><timestamp>{}</timestamp><comment>{}</comment></contactinfo>"#,
    escape_xml(&qso.callsign),
    escape_xml(qso.grid.as_deref().unwrap_or("")),
    freq_khz,
    escape_xml(&qso.mode),
    escape_xml(&qso.timestamp),
    escape_xml(&qso.comments),
  )
}

fn escape_xml(s: &str) -> String {
  s.replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
}

