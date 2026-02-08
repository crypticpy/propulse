use std::{fs, path::PathBuf};

use clap::Parser;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use tracing::warn;

#[derive(Debug, Clone, Parser)]
#[command(name = "propulse-daemon", version)]
pub struct Cli {
  /// Override config path (TOML)
  #[arg(long)]
  pub config: Option<PathBuf>,

  /// Bind address (overrides config)
  #[arg(long)]
  pub bind: Option<String>,

  /// Port (overrides config)
  #[arg(long)]
  pub port: Option<u16>,

  /// Restrict to localhost (sets bind=127.0.0.1)
  #[arg(long)]
  pub localhost_only: bool,

  /// Require token during initial hello
  #[arg(long)]
  pub auth_token: Option<String>,

  /// Accept legacy ProPulse Bridge message envelopes (type/payload)
  #[arg(long, default_value_t = true)]
  pub compat_bridge: bool,

  /// Log level (overrides config/env). Example: info, debug, trace
  #[arg(long)]
  pub log_level: Option<String>,

  /// Optional log file path (JSON lines)
  #[arg(long)]
  pub log_file: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
  pub port: u16,
  pub bind: String,
  #[serde(default)]
  pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioConfig {
  #[serde(default = "default_true")]
  pub dummy_enabled: bool,

  #[serde(default)]
  pub soapy: RadioSoapyConfig,

  #[serde(default)]
  pub hamlib: RadioHamlibConfig,
}

impl Default for RadioConfig {
  fn default() -> Self {
    Self {
      dummy_enabled: true,
      soapy: RadioSoapyConfig::default(),
      hamlib: RadioHamlibConfig::default(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioSoapyConfig {
  #[serde(default = "default_true")]
  pub enabled: bool,
  #[serde(default = "default_scan_interval_secs")]
  pub scan_interval_secs: u64,
}

fn default_scan_interval_secs() -> u64 {
  5
}

impl Default for RadioSoapyConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      scan_interval_secs: default_scan_interval_secs(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HamlibRigConfig {
  pub name: String,
  pub model: u32,
  pub port: String,
  #[serde(default = "default_hamlib_baud")]
  pub baud: u32,
  #[serde(default = "default_hamlib_poll_ms")]
  pub poll_interval_ms: u64,
}

fn default_hamlib_baud() -> u32 {
  19_200
}

fn default_hamlib_poll_ms() -> u64 {
  200
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RadioHamlibConfig {
  #[serde(default = "default_true")]
  pub enabled: bool,
  #[serde(default)]
  pub rigs: Vec<HamlibRigConfig>,
}

impl Default for RadioHamlibConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      rigs: Vec::new(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DspConfig {
  #[serde(default = "default_fft_size")]
  pub default_fft_size: usize,
  #[serde(default = "default_fft_fps")]
  pub default_fft_fps: u32,
  #[serde(default = "default_audio_rate")]
  pub default_audio_rate: u32,
}

fn default_fft_size() -> usize {
  4096
}

fn default_fft_fps() -> u32 {
  20
}

fn default_audio_rate() -> u32 {
  48_000
}

impl Default for DspConfig {
  fn default() -> Self {
    Self {
      default_fft_size: default_fft_size(),
      default_fft_fps: default_fft_fps(),
      default_audio_rate: default_audio_rate(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WSJTXConfig {
  #[serde(default = "default_true")]
  pub enabled: bool,
  #[serde(default = "default_wsjtx_port")]
  pub port: u16,
}

fn default_wsjtx_port() -> u16 {
  2237
}

impl Default for WSJTXConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      port: default_wsjtx_port(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationsConfig {
  #[serde(default)]
  pub wsjtx: WSJTXConfig,

  #[serde(default)]
  pub cluster: ClusterConfig,

  #[serde(default)]
  pub n1mm: N1mmConfig,

  #[serde(default)]
  pub cat_server: CatServerConfig,
}

impl Default for IntegrationsConfig {
  fn default() -> Self {
    Self {
      wsjtx: WSJTXConfig::default(),
      cluster: ClusterConfig::default(),
      n1mm: N1mmConfig::default(),
      cat_server: CatServerConfig::default(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterConfig {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default = "default_cluster_host")]
  pub host: String,
  #[serde(default = "default_cluster_port")]
  pub port: u16,
  #[serde(default)]
  pub callsign: String,
  #[serde(default)]
  pub password: Option<String>,
}

fn default_cluster_host() -> String {
  "dxc.nc7j.com".to_string()
}

fn default_cluster_port() -> u16 {
  7300
}

impl Default for ClusterConfig {
  fn default() -> Self {
    Self {
      enabled: false,
      host: default_cluster_host(),
      port: default_cluster_port(),
      callsign: "".to_string(),
      password: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct N1mmConfig {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default = "default_n1mm_port")]
  pub broadcast_port: u16,
}

fn default_n1mm_port() -> u16 {
  12060
}

impl Default for N1mmConfig {
  fn default() -> Self {
    Self {
      enabled: false,
      broadcast_port: default_n1mm_port(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatServerConfig {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default = "default_cat_bind")]
  pub bind: String,
  #[serde(default = "default_cat_port")]
  pub port: u16,
}

fn default_cat_bind() -> String {
  "127.0.0.1".to_string()
}

fn default_cat_port() -> u16 {
  4532
}

impl Default for CatServerConfig {
  fn default() -> Self {
    Self {
      enabled: false,
      bind: default_cat_bind(),
      port: default_cat_port(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioConfig {
  #[serde(default = "default_audio_output")]
  pub output_device: String,
  #[serde(default)]
  pub virtual_cable: bool,
}

fn default_audio_output() -> String {
  "default".to_string()
}

impl Default for AudioConfig {
  fn default() -> Self {
    Self {
      output_device: default_audio_output(),
      virtual_cable: false,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryConfig {
  #[serde(default = "default_true")]
  pub mdns_enabled: bool,
  #[serde(default = "default_service_name")]
  pub service_name: String,
}

fn default_service_name() -> String {
  "My Shack".to_string()
}

impl Default for DiscoveryConfig {
  fn default() -> Self {
    Self {
      mdns_enabled: true,
      service_name: default_service_name(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
  pub server: ServerConfig,
  #[serde(default)]
  pub radio: RadioConfig,
  #[serde(default)]
  pub integrations: IntegrationsConfig,
  #[serde(default)]
  pub dsp: DspConfig,
  #[serde(default)]
  pub audio: AudioConfig,
  #[serde(default)]
  pub discovery: DiscoveryConfig,
}

fn default_true() -> bool {
  true
}

impl Default for AppConfig {
  fn default() -> Self {
    Self {
      server: ServerConfig {
        port: 9867,
        bind: "127.0.0.1".to_string(),
        auth_token: "".to_string(),
      },
      radio: RadioConfig::default(),
      integrations: IntegrationsConfig::default(),
      dsp: DspConfig::default(),
      audio: AudioConfig::default(),
      discovery: DiscoveryConfig::default(),
    }
  }
}

impl AppConfig {
  pub fn default_path() -> anyhow::Result<PathBuf> {
    let proj = ProjectDirs::from("com", "propulse", "propulse-daemon")
      .ok_or_else(|| anyhow::anyhow!("Unable to determine config directory"))?;
    Ok(proj.config_dir().join("daemon.toml"))
  }

  pub fn load_or_create_with_path(cli: &Cli) -> anyhow::Result<(Self, PathBuf)> {
    let path = cli.config.clone().unwrap_or(Self::default_path()?);
    if !path.exists() {
      if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
      }
      let default = Self::default();
      fs::write(&path, toml::to_string_pretty(&default)?)?;
      warn_if_insecure_permissions(&path);
      let mut cfg = default;
      apply_env_overrides(&mut cfg);
      return Ok((cfg, path));
    }

    let raw = fs::read_to_string(&path)?;
    let mut config: Self = toml::from_str(&raw)?;
    warn_if_insecure_permissions(&path);
    apply_env_overrides(&mut config);
    Ok((config, path))
  }

  pub fn load_from_path(path: &PathBuf) -> anyhow::Result<Self> {
    let raw = fs::read_to_string(path)?;
    let mut config: Self = toml::from_str(&raw)?;
    warn_if_insecure_permissions(path);
    apply_env_overrides(&mut config);
    Ok(config)
  }
}

fn env_bool(key: &str) -> Option<bool> {
  let raw = std::env::var(key).ok()?;
  let v = raw.trim().to_lowercase();
  match v.as_str() {
    "1" | "true" | "yes" | "y" | "on" => Some(true),
    "0" | "false" | "no" | "n" | "off" => Some(false),
    _ => None,
  }
}

fn env_u16(key: &str) -> Option<u16> {
  let raw = std::env::var(key).ok()?;
  raw.trim().parse::<u16>().ok()
}

fn env_u32(key: &str) -> Option<u32> {
  let raw = std::env::var(key).ok()?;
  raw.trim().parse::<u32>().ok()
}

fn env_u64(key: &str) -> Option<u64> {
  let raw = std::env::var(key).ok()?;
  raw.trim().parse::<u64>().ok()
}

fn env_string(key: &str) -> Option<String> {
  let raw = std::env::var(key).ok()?;
  let v = raw.trim().to_string();
  if v.is_empty() {
    None
  } else {
    Some(v)
  }
}

fn apply_env_overrides(cfg: &mut AppConfig) {
  if let Some(port) = env_u16("PROPULSE_PORT") {
    cfg.server.port = port;
  }
  if let Some(bind) = env_string("PROPULSE_BIND") {
    cfg.server.bind = bind;
  }
  if let Some(token) = env_string("PROPULSE_AUTH_TOKEN") {
    cfg.server.auth_token = token;
  }

  if let Some(v) = env_bool("PROPULSE_WSJT_X_ENABLED") {
    cfg.integrations.wsjtx.enabled = v;
  }
  if let Some(p) = env_u16("PROPULSE_WSJT_X_PORT") {
    cfg.integrations.wsjtx.port = p;
  }

  if let Some(v) = env_bool("PROPULSE_CLUSTER_ENABLED") {
    cfg.integrations.cluster.enabled = v;
  }
  if let Some(host) = env_string("PROPULSE_CLUSTER_HOST") {
    cfg.integrations.cluster.host = host;
  }
  if let Some(p) = env_u16("PROPULSE_CLUSTER_PORT") {
    cfg.integrations.cluster.port = p;
  }
  if let Some(cs) = env_string("PROPULSE_CLUSTER_CALLSIGN") {
    cfg.integrations.cluster.callsign = cs;
  }

  if let Some(v) = env_bool("PROPULSE_N1MM_ENABLED") {
    cfg.integrations.n1mm.enabled = v;
  }
  if let Some(p) = env_u16("PROPULSE_N1MM_PORT") {
    cfg.integrations.n1mm.broadcast_port = p;
  }

  if let Some(v) = env_bool("PROPULSE_CAT_SERVER_ENABLED") {
    cfg.integrations.cat_server.enabled = v;
  }
  if let Some(bind) = env_string("PROPULSE_CAT_SERVER_BIND") {
    cfg.integrations.cat_server.bind = bind;
  }
  if let Some(p) = env_u16("PROPULSE_CAT_SERVER_PORT") {
    cfg.integrations.cat_server.port = p;
  }

  if let Some(v) = env_bool("PROPULSE_MDNS_ENABLED") {
    cfg.discovery.mdns_enabled = v;
  }
  if let Some(name) = env_string("PROPULSE_SERVICE_NAME") {
    cfg.discovery.service_name = name;
  }

  if let Some(size) = env_u64("PROPULSE_DEFAULT_FFT_SIZE") {
    cfg.dsp.default_fft_size = size as usize;
  }
  if let Some(fps) = env_u32("PROPULSE_DEFAULT_FFT_FPS") {
    cfg.dsp.default_fft_fps = fps;
  }
  if let Some(rate) = env_u32("PROPULSE_DEFAULT_AUDIO_RATE") {
    cfg.dsp.default_audio_rate = rate;
  }
}

fn warn_if_insecure_permissions(path: &PathBuf) {
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(md) = fs::metadata(path) {
      let mode = md.permissions().mode();
      // If group/other has any perms, warn.
      if (mode & 0o077) != 0 {
        warn!(
          path = %path.display(),
          mode = format!("{mode:o}"),
          "Config file has permissive permissions; may expose auth_token"
        );
      }
    }
  }
}
