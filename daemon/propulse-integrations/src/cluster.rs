use std::{
  collections::HashMap,
  net::SocketAddr,
  time::{Duration, SystemTime},
};

use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  net::TcpStream,
  time::sleep,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterFilters {
  #[serde(default)]
  pub bands: Option<Vec<u32>>,
  #[serde(default)]
  pub modes: Option<Vec<String>>,
  #[serde(default, rename = "minSNR")]
  pub min_snr: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterConnectConfig {
  pub host: String,
  pub port: u16,
  pub callsign: String,
  #[serde(default)]
  pub password: Option<String>,
  #[serde(default)]
  pub filters: Option<ClusterFilters>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterSpot {
  pub id: String,
  pub spotter: String,
  #[serde(skip_serializing_if = "Option::is_none", rename = "spotterGrid")]
  pub spotter_grid: Option<String>,
  pub dx: String,
  #[serde(skip_serializing_if = "Option::is_none", rename = "dxGrid")]
  pub dx_grid: Option<String>,
  /// Frequency in kHz (DX Spider)
  pub frequency: f64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mode: Option<String>,
  pub comment: String,
  /// ISO 8601 UTC timestamp
  pub time: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub band: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterStatus {
  pub connected: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub node: Option<String>,
  #[serde(rename = "spotsReceived")]
  pub spots_received: u64,
  #[serde(skip_serializing_if = "Option::is_none", rename = "lastSpotTime")]
  pub last_spot_time: Option<String>,
}

#[derive(Debug)]
pub enum ClusterEvent {
  Status(ClusterStatus),
  Spot(ClusterSpot),
}

#[derive(Debug)]
pub struct ClusterClient {
  cfg: ClusterConnectConfig,
  spot_regex: Regex,
  dedupe: HashMap<String, u64>,
  dedupe_window_ms: u64,
  spots_received: u64,
  last_spot_time: Option<String>,
}

impl ClusterClient {
  pub fn new(cfg: ClusterConnectConfig) -> anyhow::Result<Self> {
    let spot_regex = Regex::new(
      r"^DX\s+de\s+([A-Z0-9/]+):\s+([\d.]+)\s+([A-Z0-9/]+)\s+(.*?)\s+(\d{4})Z\s*$",
    )?;
    Ok(Self {
      cfg,
      spot_regex,
      dedupe: HashMap::new(),
      dedupe_window_ms: 60_000,
      spots_received: 0,
      last_spot_time: None,
    })
  }

  pub async fn run(
    mut self,
    mut on_event: impl FnMut(ClusterEvent) + Send + 'static,
    mut should_stop: impl FnMut() -> bool + Send + 'static,
  ) {
    let mut attempt: u32 = 0;
    loop {
      if should_stop() {
        break;
      }

      let node = format!("{}:{}", self.cfg.host, self.cfg.port);
      match self.connect_and_loop(&mut on_event, &mut should_stop).await {
        Ok(()) => {
          // clean exit
          on_event(ClusterEvent::Status(ClusterStatus {
            connected: false,
            node: Some(node),
            spots_received: self.spots_received,
            last_spot_time: self.last_spot_time.clone(),
          }));
          break;
        }
        Err(err) => {
          on_event(ClusterEvent::Status(ClusterStatus {
            connected: false,
            node: Some(node),
            spots_received: self.spots_received,
            last_spot_time: self.last_spot_time.clone(),
          }));

          let delay = (1000u64.saturating_mul(2u64.saturating_pow(attempt))).min(30_000);
          attempt = attempt.saturating_add(1).min(10);
          tracing::warn!(error = %err, "DX Cluster disconnected; retrying");
          sleep(Duration::from_millis(delay)).await;
        }
      }
    }
  }

  async fn connect_and_loop(
    &mut self,
    on_event: &mut impl FnMut(ClusterEvent),
    should_stop: &mut impl FnMut() -> bool,
  ) -> anyhow::Result<()> {
    let addr: SocketAddr = format!("{}:{}", self.cfg.host, self.cfg.port).parse()?;
    let stream = TcpStream::connect(addr).await?;
    stream.set_nodelay(true)?;

    let (read_half, mut write_half) = stream.into_split();
    let mut reader = BufReader::new(read_half);

    let mut login_complete = false;
    let mut buf = String::new();

    loop {
      if should_stop() {
        return Ok(());
      }

      buf.clear();
      let n = reader.read_line(&mut buf).await?;
      if n == 0 {
        return Err(anyhow::anyhow!("cluster connection closed"));
      }
      let line = buf.trim().to_string();
      if line.is_empty() {
        continue;
      }

      if !login_complete {
        let lower = line.to_lowercase();
        if lower.contains("login:")
          || lower.contains("call:")
          || lower.contains("callsign:")
          || lower.contains("please enter your call")
        {
          write_half
            .write_all(format!("{}\r\n", self.cfg.callsign).as_bytes())
            .await?;
          continue;
        }

        if lower.contains("password:") {
          if let Some(pw) = self.cfg.password.as_deref() {
            write_half.write_all(format!("{pw}\r\n").as_bytes()).await?;
          }
          continue;
        }

        if lower.contains("hello")
          || lower.contains("welcome")
          || lower.contains(self.cfg.callsign.to_lowercase().as_str())
          || lower.contains("dx spider")
        {
          login_complete = true;
          on_event(ClusterEvent::Status(ClusterStatus {
            connected: true,
            node: Some(format!("{}:{}", self.cfg.host, self.cfg.port)),
            spots_received: self.spots_received,
            last_spot_time: self.last_spot_time.clone(),
          }));
        }

        continue;
      }

      if let Some(spot) = self.parse_spot_line(&line) {
        if self.passes_filters(&spot) && !self.is_duplicate(&spot) {
          self.spots_received += 1;
          self.last_spot_time = Some(spot.time.clone());
          on_event(ClusterEvent::Spot(spot));
        }
      }
    }
  }

  fn parse_spot_line(&self, line: &str) -> Option<ClusterSpot> {
    let caps = self.spot_regex.captures(line)?;
    let spotter = caps.get(1)?.as_str().to_string();
    let freq_str = caps.get(2)?.as_str();
    let dx = caps.get(3)?.as_str().to_string();
    let comment = caps.get(4)?.as_str().trim().to_string();
    let time_str = caps.get(5)?.as_str();

    let frequency = freq_str.parse::<f64>().ok()?;
    let band = frequency_to_band_khz(frequency);
    let mode = extract_mode(&comment);

    let now = chrono_now_utc();
    let hours = time_str.get(0..2)?.parse::<u32>().ok()?;
    let minutes = time_str.get(2..4)?.parse::<u32>().ok()?;
    let spot_time = chrono_today_utc_with_hm(hours, minutes, now)?;

    Some(ClusterSpot {
      id: format!("{}_{}", now_ms(), rand_suffix()),
      spotter,
      spotter_grid: None,
      dx,
      dx_grid: None,
      frequency,
      mode,
      comment,
      time: spot_time,
      band,
    })
  }

  fn passes_filters(&self, spot: &ClusterSpot) -> bool {
    let Some(filters) = self.cfg.filters.as_ref() else {
      return true;
    };

    if let Some(bands) = filters.bands.as_ref() {
      if !bands.is_empty() {
        let Some(band) = spot.band.as_ref() else {
          return false;
        };
        let band_num = band.trim_end_matches('m').parse::<u32>().ok();
        let Some(bn) = band_num else {
          return false;
        };
        if !bands.contains(&bn) {
          return false;
        }
      }
    }

    if let Some(modes) = filters.modes.as_ref() {
      if !modes.is_empty() {
        if let Some(mode) = spot.mode.as_ref() {
          if !modes.iter().any(|m| m.eq_ignore_ascii_case(mode)) {
            return false;
          }
        }
      }
    }

    if let Some(min_snr) = filters.min_snr {
      if let Some(snr) = extract_snr_db(&spot.comment) {
        if snr < min_snr {
          return false;
        }
      }
    }

    true
  }

  fn is_duplicate(&mut self, spot: &ClusterSpot) -> bool {
    let hash = dedupe_hash(&spot.dx, spot.frequency);
    let now = now_ms();
    self.dedupe.retain(|_, exp| *exp > now);
    if let Some(exp) = self.dedupe.get(&hash) {
      return *exp > now;
    }
    self.dedupe.insert(hash, now + self.dedupe_window_ms);
    false
  }
}

fn dedupe_hash(dx: &str, frequency_khz: f64) -> String {
  let rounded = (frequency_khz * 1.0).round() as i64;
  format!("{}_{}", dx.to_uppercase(), rounded)
}

fn extract_mode(comment: &str) -> Option<String> {
  let upper = comment.to_uppercase();
  let modes = [
    "FT8", "FT4", "CW", "SSB", "RTTY", "PSK31", "JT65", "JT9", "MSK144", "JS8",
  ];
  for m in modes {
    if upper.contains(m) {
      return Some(m.to_string());
    }
  }
  None
}

fn extract_snr_db(comment: &str) -> Option<i32> {
  let re = Regex::new(r"([+-]?\d+)\s*dB").ok()?;
  let caps = re.captures(comment)?;
  caps.get(1)?.as_str().parse::<i32>().ok()
}

fn frequency_to_band_khz(freq_khz: f64) -> Option<String> {
  let f = freq_khz;
  if (1800.0..=2000.0).contains(&f) {
    return Some("160m".to_string());
  }
  if (3500.0..=4000.0).contains(&f) {
    return Some("80m".to_string());
  }
  if (5330.0..=5410.0).contains(&f) {
    return Some("60m".to_string());
  }
  if (7000.0..=7300.0).contains(&f) {
    return Some("40m".to_string());
  }
  if (10100.0..=10150.0).contains(&f) {
    return Some("30m".to_string());
  }
  if (14000.0..=14350.0).contains(&f) {
    return Some("20m".to_string());
  }
  if (18068.0..=18168.0).contains(&f) {
    return Some("17m".to_string());
  }
  if (21000.0..=21450.0).contains(&f) {
    return Some("15m".to_string());
  }
  if (24890.0..=24990.0).contains(&f) {
    return Some("12m".to_string());
  }
  if (28000.0..=29700.0).contains(&f) {
    return Some("10m".to_string());
  }
  if (50000.0..=54000.0).contains(&f) {
    return Some("6m".to_string());
  }
  if (144000.0..=148000.0).contains(&f) {
    return Some("2m".to_string());
  }
  None
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(SystemTime::UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn rand_suffix() -> String {
  format!("{:x}", (now_ms() & 0xffff) as u16)
}

fn chrono_now_utc() -> chrono::DateTime<chrono::Utc> {
  chrono::Utc::now()
}

fn chrono_today_utc_with_hm(
  hours: u32,
  minutes: u32,
  now: chrono::DateTime<chrono::Utc>,
) -> Option<String> {
  let mut date = now.date_naive();
  let time = chrono::NaiveTime::from_hms_opt(hours, minutes, 0)?;
  let dt = chrono::NaiveDateTime::new(date, time);
  let mut spot = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt, chrono::Utc);

  if spot > now + chrono::Duration::minutes(1) {
    // assume it was yesterday
    date = date.pred_opt()?;
    let dt2 = chrono::NaiveDateTime::new(date, time);
    spot = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt2, chrono::Utc);
  }
  Some(spot.to_rfc3339())
}
