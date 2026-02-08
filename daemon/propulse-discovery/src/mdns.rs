use std::{
  collections::HashMap,
  net::IpAddr,
  time::Duration,
};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

pub const PROPULSE_SERVICE_TYPE: &str = "_propulse._tcp.local.";

pub struct MdnsAdvertiser {
  daemon: ServiceDaemon,
  fullname: String,
}

impl MdnsAdvertiser {
  pub fn start(instance_name: &str, port: u16, txt: HashMap<String, String>) -> anyhow::Result<Self> {
    let daemon = ServiceDaemon::new()?;

    let hostname = gethostname::gethostname().to_string_lossy().to_string();
    let host = format!("{hostname}.local.");
    let ip = pick_primary_ip().unwrap_or(IpAddr::from([127, 0, 0, 1]));

    let service = ServiceInfo::new(
      PROPULSE_SERVICE_TYPE,
      instance_name,
      &host,
      ip,
      port,
      txt,
    )?
    .enable_addr_auto();

    let fullname = service.get_fullname().to_string();
    daemon.register(service)?;

    Ok(Self { daemon, fullname })
  }

  pub fn stop(self) {
    let _ = self.daemon.unregister(&self.fullname);
    let _ = self.daemon.shutdown();
  }
}

fn pick_primary_ip() -> Option<IpAddr> {
  let ifaces = if_addrs::get_if_addrs().ok()?;
  for iface in ifaces {
    if iface.is_loopback() {
      continue;
    }
    match iface.addr.ip() {
      IpAddr::V4(ip) => {
        if !ip.is_link_local() {
          return Some(IpAddr::V4(ip));
        }
      }
      IpAddr::V6(ip) => {
        if !ip.is_loopback() {
          return Some(IpAddr::V6(ip));
        }
      }
    }
  }
  None
}

#[derive(Debug, Clone)]
pub struct DiscoveredDaemon {
  pub fullname: String,
  pub hostname: String,
  pub port: u16,
  pub addresses: Vec<IpAddr>,
  pub txt: HashMap<String, String>,
}

pub async fn browse_propulse(timeout: Duration) -> anyhow::Result<Vec<DiscoveredDaemon>> {
  let daemon = ServiceDaemon::new()?;
  let rx = daemon.browse(PROPULSE_SERVICE_TYPE)?;

  let deadline = tokio::time::Instant::now() + timeout;
  let mut found: HashMap<String, DiscoveredDaemon> = HashMap::new();

  loop {
    let now = tokio::time::Instant::now();
    if now >= deadline {
      break;
    }

    let remaining = deadline - now;
    let evt = match tokio::time::timeout(remaining, rx.recv_async()).await {
      Ok(Ok(e)) => e,
      Ok(Err(_)) => break,
      Err(_) => break,
    };

    if let ServiceEvent::ServiceResolved(info) = evt {
      let mut txt = HashMap::new();
      for prop in info.get_properties().iter() {
        let key = prop.key().to_string();
        let val = prop.val_str().to_string();
        txt.insert(key, val);
      }

      let entry = DiscoveredDaemon {
        fullname: info.get_fullname().to_string(),
        hostname: info.get_hostname().to_string(),
        port: info.get_port(),
        addresses: info.get_addresses().iter().copied().collect(),
        txt,
      };
      found.insert(entry.fullname.clone(), entry);
    }
  }

  let _ = daemon.stop_browse(PROPULSE_SERVICE_TYPE);
  let _ = daemon.shutdown();

  Ok(found.into_values().collect())
}
