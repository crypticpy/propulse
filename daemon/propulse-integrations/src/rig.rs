use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  net::TcpStream,
  sync::{mpsc, oneshot},
  task::JoinHandle,
  time::{interval, MissedTickBehavior},
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RigBackendKind {
  Auto,
  Hamlib,
  Flrig,
  None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RigConnectConfig {
  pub backend: RigBackendKind,
  #[serde(default)]
  pub host: Option<String>,
  #[serde(default)]
  pub port: Option<u16>,
  #[serde(default)]
  pub poll_interval_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RigStatus {
  pub connected: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub frequency: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mode: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ptt: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub backend: Option<String>,
}

#[derive(Debug)]
pub enum RigCommand {
  Connect(RigConnectConfig, oneshot::Sender<anyhow::Result<RigStatus>>),
  Disconnect(oneshot::Sender<RigStatus>),
  Status(oneshot::Sender<RigStatus>),
  SetFrequency(u64, oneshot::Sender<anyhow::Result<()>>),
  SetMode(String, oneshot::Sender<anyhow::Result<()>>),
  SetPTT(bool, oneshot::Sender<anyhow::Result<()>>),
  Stop,
}

#[derive(Clone)]
pub struct RigService {
  tx: mpsc::UnboundedSender<RigCommand>,
}

impl RigService {
  pub fn start(
    mut on_status: impl FnMut(RigStatus) + Send + 'static,
  ) -> (Self, JoinHandle<()>) {
    let (tx, mut rx) = mpsc::unbounded_channel::<RigCommand>();
    let handle = tokio::spawn(async move {
      let mut backend = RigBackend::None;
      let mut status = RigStatus {
        connected: false,
        frequency: None,
        mode: None,
        ptt: None,
        backend: Some("none".to_string()),
      };

      let mut poll_every = Duration::from_millis(200);
      let mut tick = interval(poll_every);
      tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
      let mut last_polled: Option<RigStatus> = None;

      loop {
        tokio::select! {
          maybe = rx.recv() => {
            let Some(cmd) = maybe else { break; };
            match cmd {
              RigCommand::Stop => {
                break;
              }
              RigCommand::Connect(cfg, reply) => {
              let resolved = match cfg.backend {
                RigBackendKind::None => RigBackend::None,
                RigBackendKind::Hamlib => {
                  let host = cfg.host.unwrap_or_else(|| "127.0.0.1".to_string());
                  let port = cfg.port.unwrap_or(4532);
                  RigBackend::Hamlib(RigctldClient::new(host, port))
                }
                RigBackendKind::Flrig => {
                  let host = cfg.host.unwrap_or_else(|| "127.0.0.1".to_string());
                  let port = cfg.port.unwrap_or(12345);
                  RigBackend::Flrig(FlrigClient::new(host, port))
                }
                RigBackendKind::Auto => {
                  let host = cfg.host.unwrap_or_else(|| "127.0.0.1".to_string());
                  let hamlib_port = cfg.port.unwrap_or(4532);
                  let mut ham = RigctldClient::new(host.clone(), hamlib_port);
                  if ham.probe().await.is_ok() {
                    RigBackend::Hamlib(ham)
                  } else {
                    let mut fl = FlrigClient::new(host, 12345);
                    if fl.probe().await.is_ok() {
                      RigBackend::Flrig(fl)
                    } else {
                      RigBackend::None
                    }
                  }
                }
              };

              poll_every = Duration::from_millis(cfg.poll_interval_ms.unwrap_or(200));
              tick = interval(poll_every);
              tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
              backend = resolved;
              last_polled = None;

              let initial = backend.poll_once().await.unwrap_or(RigStatus {
                connected: false,
                frequency: None,
                mode: None,
                ptt: None,
                backend: backend.name().map(|s| s.to_string()),
              });
              status = initial.clone();
              on_status(status.clone());
              let _ = reply.send(Ok(status.clone()));
              }
              RigCommand::Disconnect(reply) => {
                backend = RigBackend::None;
                last_polled = None;
                status = RigStatus {
                  connected: false,
                  frequency: None,
                  mode: None,
                  ptt: None,
                  backend: Some("none".to_string()),
                };
                on_status(status.clone());
                let _ = reply.send(status.clone());
              }
              RigCommand::Status(reply) => {
                let _ = reply.send(status.clone());
              }
              RigCommand::SetFrequency(freq, reply) => {
                let res = backend.set_frequency(freq).await;
                if res.is_ok() {
                  if let Ok(s) = backend.poll_once().await {
                    status = s.clone();
                    on_status(s);
                  }
                }
                let _ = reply.send(res);
              }
              RigCommand::SetMode(mode, reply) => {
                let res = backend.set_mode(&mode).await;
                if res.is_ok() {
                  if let Ok(s) = backend.poll_once().await {
                    status = s.clone();
                    on_status(s);
                  }
                }
                let _ = reply.send(res);
              }
              RigCommand::SetPTT(ptt, reply) => {
                let res = backend.set_ptt(ptt).await;
                if res.is_ok() {
                  if let Ok(s) = backend.poll_once().await {
                    status = s.clone();
                    on_status(s);
                  }
                }
                let _ = reply.send(res);
              }
            }
          }

          _ = tick.tick() => {
            if let Ok(next) = backend.poll_once().await {
              if !next.connected {
                status = next.clone();
                on_status(next);
                continue;
              }
              let changed = last_polled.as_ref().map(|l| l != &next).unwrap_or(true);
              if changed {
                last_polled = Some(next.clone());
                status = next.clone();
                on_status(next);
              }
            }
          }
        }
      }
    });

    (Self { tx }, handle)
  }

  pub async fn connect(&self, cfg: RigConnectConfig) -> anyhow::Result<RigStatus> {
    let (tx, rx) = oneshot::channel();
    self.tx.send(RigCommand::Connect(cfg, tx))?;
    rx.await?
  }

  pub async fn disconnect(&self) -> anyhow::Result<RigStatus> {
    let (tx, rx) = oneshot::channel();
    self.tx.send(RigCommand::Disconnect(tx))?;
    Ok(rx.await?)
  }

  pub async fn status(&self) -> anyhow::Result<RigStatus> {
    let (tx, rx) = oneshot::channel();
    self.tx.send(RigCommand::Status(tx))?;
    Ok(rx.await?)
  }

  pub async fn set_frequency(&self, hz: u64) -> anyhow::Result<()> {
    let (tx, rx) = oneshot::channel();
    self.tx.send(RigCommand::SetFrequency(hz, tx))?;
    rx.await?
  }

  pub async fn set_mode(&self, mode: &str) -> anyhow::Result<()> {
    let (tx, rx) = oneshot::channel();
    self.tx.send(RigCommand::SetMode(mode.to_string(), tx))?;
    rx.await?
  }

  pub async fn set_ptt(&self, enabled: bool) -> anyhow::Result<()> {
    let (tx, rx) = oneshot::channel();
    self.tx.send(RigCommand::SetPTT(enabled, tx))?;
    rx.await?
  }
}

enum RigBackend {
  Hamlib(RigctldClient),
  Flrig(FlrigClient),
  None,
}

impl RigBackend {
  fn name(&self) -> Option<&'static str> {
    match self {
      RigBackend::Hamlib(_) => Some("hamlib"),
      RigBackend::Flrig(_) => Some("flrig"),
      RigBackend::None => Some("none"),
    }
  }

  async fn poll_once(&mut self) -> anyhow::Result<RigStatus> {
    match self {
      RigBackend::Hamlib(c) => c.poll_status().await,
      RigBackend::Flrig(c) => c.poll_status().await,
      RigBackend::None => Ok(RigStatus {
        connected: false,
        frequency: None,
        mode: None,
        ptt: None,
        backend: Some("none".to_string()),
      }),
    }
  }

  async fn set_frequency(&mut self, hz: u64) -> anyhow::Result<()> {
    match self {
      RigBackend::Hamlib(c) => c.set_frequency(hz).await,
      RigBackend::Flrig(c) => c.set_frequency(hz).await,
      RigBackend::None => Err(anyhow::anyhow!("No rig backend connected")),
    }
  }

  async fn set_mode(&mut self, mode: &str) -> anyhow::Result<()> {
    match self {
      RigBackend::Hamlib(c) => c.set_mode(mode).await,
      RigBackend::Flrig(c) => c.set_mode(mode).await,
      RigBackend::None => Err(anyhow::anyhow!("No rig backend connected")),
    }
  }

  async fn set_ptt(&mut self, enabled: bool) -> anyhow::Result<()> {
    match self {
      RigBackend::Hamlib(c) => c.set_ptt(enabled).await,
      RigBackend::Flrig(_) => Err(anyhow::anyhow!("PTT requires Hamlib backend")),
      RigBackend::None => Err(anyhow::anyhow!("No rig backend connected")),
    }
  }
}

struct RigctldClient {
  host: String,
  port: u16,
  stream: Option<BufReader<TcpStream>>,
}

impl RigctldClient {
  fn new(host: String, port: u16) -> Self {
    Self {
      host,
      port,
      stream: None,
    }
  }

  async fn connect(&mut self) -> anyhow::Result<()> {
    if self.stream.is_some() {
      return Ok(());
    }
    let s = TcpStream::connect((self.host.as_str(), self.port)).await?;
    s.set_nodelay(true)?;
    self.stream = Some(BufReader::new(s));
    Ok(())
  }

  async fn probe(&mut self) -> anyhow::Result<()> {
    self.connect().await?;
    let f = self.send_lines("f", 1).await?;
    let _ = f[0].trim().parse::<u64>()?;
    Ok(())
  }

  async fn poll_status(&mut self) -> anyhow::Result<RigStatus> {
    self.connect().await?;
    let freq = self.send_lines("f", 1).await?;
    let mode = self.send_lines("m", 2).await?;
    let ptt = self.send_lines("t", 1).await?;

    Ok(RigStatus {
      connected: true,
      frequency: Some(freq[0].trim().parse::<u64>()?),
      mode: Some(mode[0].trim().to_string()),
      ptt: Some(ptt[0].trim() != "0"),
      backend: Some("hamlib".to_string()),
    })
  }

  async fn set_frequency(&mut self, hz: u64) -> anyhow::Result<()> {
    self.connect().await?;
    let _ = self.send_lines(&format!("F {hz}"), 1).await?;
    Ok(())
  }

  async fn set_mode(&mut self, mode: &str) -> anyhow::Result<()> {
    self.connect().await?;
    let _ = self.send_lines(&format!("M {mode} 0"), 1).await?;
    Ok(())
  }

  async fn set_ptt(&mut self, enabled: bool) -> anyhow::Result<()> {
    self.connect().await?;
    let v = if enabled { 1 } else { 0 };
    let _ = self.send_lines(&format!("T {v}"), 1).await?;
    Ok(())
  }

  async fn send_lines(&mut self, cmd: &str, expected: usize) -> anyhow::Result<Vec<String>> {
    let Some(reader) = self.stream.as_mut() else {
      return Err(anyhow::anyhow!("rigctld not connected"));
    };

    let stream = reader.get_mut();
    stream.write_all(cmd.as_bytes()).await?;
    stream.write_all(b"\n").await?;
    stream.flush().await?;

    let mut lines = Vec::with_capacity(expected);
    for _ in 0..expected {
      let mut s = String::new();
      let n = reader.read_line(&mut s).await?;
      if n == 0 {
        self.stream = None;
        return Err(anyhow::anyhow!("rigctld connection closed"));
      }
      lines.push(s.trim().to_string());
    }
    Ok(lines)
  }
}

struct FlrigClient {
  host: String,
  port: u16,
}

impl FlrigClient {
  fn new(host: String, port: u16) -> Self {
    Self { host, port }
  }

  async fn probe(&mut self) -> anyhow::Result<()> {
    let _ = self.xmlrpc_call("rig.get_vfo", &[]).await?;
    Ok(())
  }

  async fn poll_status(&mut self) -> anyhow::Result<RigStatus> {
    let freq = self
      .xmlrpc_call("rig.get_frequency", &[])
      .await?
      .parse::<u64>()
      .unwrap_or(0);
    let mode = self.xmlrpc_call("rig.get_mode", &[]).await?;
    Ok(RigStatus {
      connected: true,
      frequency: Some(freq),
      mode: Some(mode),
      ptt: None,
      backend: Some("flrig".to_string()),
    })
  }

  async fn set_frequency(&mut self, hz: u64) -> anyhow::Result<()> {
    let _ = self
      .xmlrpc_call("rig.set_frequency", &[hz.to_string()])
      .await?;
    Ok(())
  }

  async fn set_mode(&mut self, mode: &str) -> anyhow::Result<()> {
    let _ = self.xmlrpc_call("rig.set_mode", &[mode.to_string()]).await?;
    Ok(())
  }

  async fn xmlrpc_call(&mut self, method: &str, params: &[String]) -> anyhow::Result<String> {
    let params_xml = params
      .iter()
      .map(|p| format!("<param><value><string>{}</string></value></param>", escape_xml(p)))
      .collect::<Vec<_>>()
      .join("");

    let body = format!(
      r#"<?xml version="1.0"?><methodCall><methodName>{}</methodName><params>{}</params></methodCall>"#,
      method, params_xml
    );

    let mut stream = TcpStream::connect((self.host.as_str(), self.port)).await?;
    let req = format!(
      "POST /RPC2 HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: text/xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      self.host,
      self.port,
      body.as_bytes().len(),
      body
    );
    stream.write_all(req.as_bytes()).await?;
    stream.flush().await?;

    let mut resp = Vec::new();
    use tokio::io::AsyncReadExt;
    stream.read_to_end(&mut resp).await?;
    let s = String::from_utf8_lossy(&resp);

    extract_xmlrpc_value(&s).ok_or_else(|| anyhow::anyhow!("invalid flrig response"))
  }
}

fn escape_xml(s: &str) -> String {
  s.replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
}

fn extract_xmlrpc_value(xml: &str) -> Option<String> {
  // Find first <value> ... </value> and extract inner text (string/int/etc).
  // This is intentionally simple and works for Flrig's typical responses.
  let start = xml.find("<value>")?;
  let sub = &xml[start + "<value>".len()..];
  // Strip optional nested tag
  let sub = if sub.starts_with('<') {
    let close = sub.find('>')?;
    &sub[close + 1..]
  } else {
    sub
  };
  let end = sub.find('<')?;
  Some(sub[..end].trim().to_string())
}
