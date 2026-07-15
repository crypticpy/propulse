use std::{
  net::{IpAddr, SocketAddr},
  collections::{HashMap, HashSet, VecDeque},
  path::PathBuf,
  sync::atomic::{AtomicBool, AtomicU64, Ordering},
  sync::Arc,
  sync::Mutex as StdMutex,
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, mpsc};
use tokio::task::JoinHandle;
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};
use tracing::{error, info, warn, debug};
use uuid::Uuid;

use async_trait::async_trait;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};

use crate::config::{AppConfig, Cli, HamlibRigConfig, SdrconnectRadioInstanceConfig};
use crate::protocol::{
  build_audio_frame, build_fft_frame, DaemonStatusEvent, DevicesList, Hello,
  PROTOCOL_VERSION, RadioSmeterEvent, RadioStateEvent, Response,
};
use crate::sdrconnect::SdrconnectRuntime;

use propulse_radio::{
  dummy::dummy_device,
  manager::{DeviceDelta, RadioManager},
  soapy::SoapyDevice,
  types::{DeviceInfo, RadioCapabilities, RadioCommandCapabilities, RadioType},
};
use sysinfo::System;

use propulse_integrations::{
  cat_server::{start_cat_server, CatBackend},
  cluster::{ClusterClient, ClusterConnectConfig, ClusterEvent},
  n1mm::{broadcast_n1mm_xml, run_n1mm_listener, wsjtx_qso_to_n1mm_contact_xml, N1mmEvent},
  rig::{RigBackendKind, RigConnectConfig, RigService, RigStatus},
  wsjtx::{run_wsjtx_listener, WSJTXEvent},
};
use propulse_discovery::{
  mdns::MdnsAdvertiser,
  soapy_enum::enumerate_soapy_devices,
};
use propulse_dsp::{
  demod::DemodMode,
  fft::{FftConfig, WindowKind},
  pipeline::{DspPipeline, PipelineConfig},
  Complex32,
};
use propulse_audio::output::ThreadedAudioOutput;
use propulse_audio::virtual_cable::find_virtual_cable_device_name;

struct DaemonState {
  started_at: Instant,
  daemon_id: String,
  auth_token: Option<String>,
  compat_bridge: bool,
  config: Mutex<AppConfig>,
  radio: Mutex<RadioManager>,
  soapy_kwargs_by_device_id: Mutex<HashMap<String, HashMap<String, String>>>,
  sdrconnect_cfg_by_device_id: Mutex<HashMap<String, SdrconnectRadioInstanceConfig>>,
  device_idx_by_id: Mutex<HashMap<String, u8>>,
  clients: Mutex<HashMap<String, ClientState>>,
  streams: Mutex<HashMap<String, DeviceStreams>>,
  integrations: Mutex<IntegrationsState>,
  ptt_safety: PttSafetyState,
}

struct PttSafetyState {
  lockout: AtomicBool,
  release_pending: AtomicBool,
  generation: AtomicU64,
  owner: Mutex<Option<String>>,
}

impl Default for PttSafetyState {
  fn default() -> Self {
    Self {
      lockout: AtomicBool::new(false),
      release_pending: AtomicBool::new(false),
      generation: AtomicU64::new(0),
      owner: Mutex::new(None),
    }
  }
}

impl PttSafetyState {
  fn key_down_error(&self) -> Option<&'static str> {
    if self.lockout.load(Ordering::SeqCst) {
      Some("PTT safety lockout is enabled")
    } else if self.release_pending.load(Ordering::SeqCst) {
      Some("PTT release is pending after a hardware error")
    } else {
      None
    }
  }

  async fn track_manual(&self, client_id: &str, active: bool) -> u64 {
    let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
    if !active {
      self.release_pending.store(false, Ordering::SeqCst);
    }
    *self.owner.lock().await = active.then(|| client_id.to_string());
    generation
  }

  fn begin_release(&self) -> u64 {
    self.release_pending.store(true, Ordering::SeqCst);
    self.generation.fetch_add(1, Ordering::SeqCst) + 1
  }

  fn generation_is(&self, generation: u64) -> bool {
    self.generation.load(Ordering::SeqCst) == generation
  }

  async fn complete_release(&self, generation: u64) -> bool {
    if !self.generation_is(generation) {
      return false;
    }
    let mut owner = self.owner.lock().await;
    if !self.generation_is(generation) {
      return false;
    }
    *owner = None;
    self.release_pending.store(false, Ordering::SeqCst);
    true
  }

  async fn is_owned_by(&self, client_id: &str) -> bool {
    self.owner.lock().await.as_deref() == Some(client_id)
  }
}

#[derive(Default)]
struct IntegrationsState {
  wsjtx: Option<RunningWsjtx>,
  clusters: HashMap<String, RunningCluster>,
  rig: Option<RunningRig>,
  cat_server: Option<RunningCatServer>,
  n1mm: Option<RunningN1mm>,
  mdns: Option<MdnsAdvertiser>,
}

struct RunningWsjtx {
  port: u16,
  stop: Arc<AtomicBool>,
  handle: JoinHandle<()>,
  last_seen: Arc<Mutex<Instant>>,
}

struct RunningCluster {
  cfg: ClusterConnectConfig,
  stop: Arc<AtomicBool>,
  handle: JoinHandle<()>,
}

struct RunningRig {
  service: RigService,
  handle: JoinHandle<()>,
  last_status: Arc<Mutex<RigStatus>>,
}

struct RunningCatServer {
  addr: SocketAddr,
  handle: JoinHandle<anyhow::Result<()>>,
}

struct RunningN1mm {
  port: u16,
  stop: Arc<AtomicBool>,
  handle: JoinHandle<()>,
}

pub async fn run(config: AppConfig, cli: Cli, config_path: PathBuf) -> anyhow::Result<()> {
  run_until_shutdown(config, cli, config_path, futures_util::future::pending::<()>()).await
}

pub async fn run_until_shutdown<F>(
  config: AppConfig,
  cli: Cli,
  config_path: PathBuf,
  shutdown: F,
) -> anyhow::Result<()>
where
  F: std::future::Future<Output = ()> + Send,
{
  let mut bind = config.server.bind.clone();
  let mut port = config.server.port;
  let mut auth_token = config.server.auth_token.clone();

  if cli.localhost_only {
    bind = "127.0.0.1".to_string();
  }
  if let Some(b) = cli.bind {
    bind = b;
  }
  if let Some(p) = cli.port {
    port = p;
  }
  if let Some(t) = cli.auth_token {
    auth_token = t;
  }

  let ip: IpAddr = bind.parse().map_err(|_| anyhow::anyhow!("Invalid bind address: {bind}"))?;
  let addr = SocketAddr::new(ip, port);

  if !ip.is_loopback() && auth_token.trim().is_empty() {
    return Err(anyhow::anyhow!(
      "Refusing unauthenticated non-loopback bind. Configure server.auth_token or use --localhost-only"
    ));
  }

  let listener = TcpListener::bind(addr).await?;
  info!(%addr, "Propulse Radio Daemon listening");

  let auth_token = auth_token.trim().to_string();
  let auth_token = if auth_token.is_empty() {
    None
  } else {
    Some(auth_token)
  };

  let mut effective_config = config.clone();
  effective_config.server.bind = bind.clone();
  effective_config.server.port = port;
  effective_config.server.auth_token = auth_token.clone().unwrap_or_default();

  let radio = RadioManager::new(effective_config.radio.dummy_enabled);
  let device_idx_by_id = radio
    .devices()
    .iter()
    .enumerate()
    .map(|(idx, d)| (d.device_id.clone(), u8::try_from(idx).unwrap_or(0)))
    .collect::<HashMap<_, _>>();

  let state = Arc::new(DaemonState {
    started_at: Instant::now(),
    daemon_id: Uuid::new_v4().to_string(),
    auth_token,
    compat_bridge: cli.compat_bridge,
    config: Mutex::new(effective_config.clone()),
    radio: Mutex::new(radio),
    soapy_kwargs_by_device_id: Mutex::new(HashMap::new()),
    sdrconnect_cfg_by_device_id: Mutex::new(HashMap::new()),
    device_idx_by_id: Mutex::new(device_idx_by_id),
    clients: Mutex::new(HashMap::new()),
    streams: Mutex::new(HashMap::new()),
    integrations: Mutex::new(IntegrationsState::default()),
    ptt_safety: PttSafetyState::default(),
  });

  apply_runtime_config(&state, &effective_config).await;
  spawn_config_reload_watcher(Arc::clone(&state), config_path);
  spawn_device_scanner(Arc::clone(&state));

  tokio::pin!(shutdown);
  loop {
    tokio::select! {
      _ = &mut shutdown => {
        info!("Propulse Radio Daemon shutting down");
        break;
      }

      res = listener.accept() => {
        let (stream, remote) = res?;
        let state = Arc::clone(&state);
        tokio::spawn(async move {
          if let Err(err) = handle_client(stream, remote, state).await {
            warn!(error = %err, %remote, "client handler error");
          }
        });
      }
    }
  }

  release_all_ptt(&state, "daemon shutdown").await;

  // Best-effort close notifications.
  {
    let clients = state.clients.lock().await;
    for c in clients.values() {
      let _ = c.sender.send(Message::Close(None));
    }
  }

  Ok(())
}

async fn apply_runtime_config(state: &Arc<DaemonState>, config: &AppConfig) {
  {
    let mut cfg = state.config.lock().await;
    *cfg = config.clone();
  }

  // Integrations
  if config.integrations.wsjtx.enabled {
    start_wsjtx(state, config.integrations.wsjtx.port).await;
  } else {
    stop_wsjtx(state).await;
  }

  if config.integrations.cluster.enabled && !config.integrations.cluster.callsign.trim().is_empty()
  {
    start_cluster(
      state,
      ClusterConnectConfig {
        host: config.integrations.cluster.host.clone(),
        port: config.integrations.cluster.port,
        callsign: config.integrations.cluster.callsign.clone(),
        password: config.integrations.cluster.password.clone(),
        filters: None,
      },
    )
    .await;
  } else {
    stop_cluster(state, None).await;
  }

  if config.integrations.n1mm.enabled {
    start_n1mm(state, config.integrations.n1mm.broadcast_port).await;
  } else {
    stop_n1mm(state).await;
  }

  if config.integrations.cat_server.enabled {
    let _ = start_virtual_cat_server(
      state,
      &config.integrations.cat_server.bind,
      config.integrations.cat_server.port,
    )
    .await;
  } else {
    stop_virtual_cat_server(state).await;
  }

  // mDNS advertise
  if config.discovery.mdns_enabled {
    let bind = config.server.bind.as_str();
    let localhost = bind == "127.0.0.1" || bind == "localhost" || bind == "::1";
    if !localhost {
      let mut txt = HashMap::new();
      txt.insert("version".to_string(), env!("CARGO_PKG_VERSION").to_string());
      txt.insert("daemon_id".to_string(), state.daemon_id.clone());
      txt.insert("port".to_string(), config.server.port.to_string());

      let radios = {
        let radio = state.radio.lock().await;
        radio
          .devices()
          .iter()
          .map(|d| d.name.clone())
          .collect::<Vec<_>>()
          .join(",")
      };
      if !radios.is_empty() {
        txt.insert("radios".to_string(), radios);
      }

      let mut integrations = state.integrations.lock().await;
      if let Some(old) = integrations.mdns.take() {
        old.stop();
      }
      if let Ok(ad) = MdnsAdvertiser::start(&config.discovery.service_name, config.server.port, txt) {
        integrations.mdns = Some(ad);
      }
    }
  } else {
    let mut integrations = state.integrations.lock().await;
    if let Some(old) = integrations.mdns.take() {
      old.stop();
    }
  }
}

fn spawn_config_reload_watcher(state: Arc<DaemonState>, config_path: PathBuf) {
  let (tx, mut rx) = mpsc::unbounded_channel::<()>();

  let mut watcher = match RecommendedWatcher::new(
    move |res: Result<notify::Event, notify::Error>| {
      if res.is_ok() {
        let _ = tx.send(());
      }
    },
    notify::Config::default(),
  ) {
    Ok(w) => w,
    Err(err) => {
      warn!(error = %err, "Config watcher disabled");
      return;
    }
  };

  if let Err(err) = watcher.watch(&config_path, RecursiveMode::NonRecursive) {
    warn!(error = %err, path = %config_path.display(), "Config watcher disabled");
    return;
  }

  let state_for_file = Arc::clone(&state);
  let path_for_file = config_path.clone();
  tokio::spawn(async move {
    let _watcher = watcher; // keep alive
    while rx.recv().await.is_some() {
      // Simple debounce
      tokio::time::sleep(Duration::from_millis(250)).await;
      while rx.try_recv().is_ok() {}

      let mut next = match AppConfig::load_from_path(&path_for_file) {
        Ok(c) => c,
        Err(err) => {
          warn!(error = %err, path = %path_for_file.display(), "Config reload failed");
          continue;
        }
      };

      // Preserve effective server settings (bind/port) from the running daemon.
      let server = { state_for_file.config.lock().await.server.clone() };
      next.server = server;

      apply_runtime_config(&state_for_file, &next).await;
      info!(path = %path_for_file.display(), "Config reloaded");
    }
  });

  #[cfg(unix)]
  {
    let state2 = Arc::clone(&state);
    let path2 = config_path.clone();
    tokio::spawn(async move {
      use tokio::signal::unix::{signal, SignalKind};
      let Ok(mut hup) = signal(SignalKind::hangup()) else {
        return;
      };
      while hup.recv().await.is_some() {
        match AppConfig::load_from_path(&path2) {
          Ok(mut cfg) => {
            let server = { state2.config.lock().await.server.clone() };
            cfg.server = server;
            apply_runtime_config(&state2, &cfg).await;
            info!(path = %path2.display(), "Config reloaded (SIGHUP)");
          }
          Err(err) => {
            warn!(error = %err, path = %path2.display(), "Config reload failed (SIGHUP)");
          }
        }
      }
    });
  }
}

fn spawn_device_scanner(state: Arc<DaemonState>) {
  tokio::spawn(async move {
    let mut last_interval_secs: u64 = 5;
    let mut interval = tokio::time::interval(Duration::from_secs(last_interval_secs));

    loop {
      interval.tick().await;

      // Pull scan settings from the latest config.
      let radio_cfg = { state.config.lock().await.radio.clone() };
      let scan_secs = radio_cfg.soapy.scan_interval_secs.max(1);
      if scan_secs != last_interval_secs {
        last_interval_secs = scan_secs;
        interval = tokio::time::interval(Duration::from_secs(last_interval_secs));
        continue;
      }

      // Enumerate on a blocking thread (USB/serial APIs may block).
      let scan = tokio::task::spawn_blocking(move || discover_devices(&radio_cfg))
        .await
        .unwrap_or_else(|_| DeviceScanResult::default());

      {
        let mut map = state.soapy_kwargs_by_device_id.lock().await;
        *map = scan.soapy_kwargs_by_device_id;
      }
      {
        let mut map = state.sdrconnect_cfg_by_device_id.lock().await;
        *map = scan.sdrconnect_cfg_by_device_id;
      }

      let delta = {
        let mut radio = state.radio.lock().await;
        radio.replace_devices(scan.devices)
      };

      if !delta.added.is_empty() || !delta.removed.is_empty() {
        for id in &delta.removed {
          stop_device_streams_if_any(&state, id).await;
          stop_soapy_device_if_any(&state, id).await;
          stop_sdrconnect_device_if_any(&state, id).await;
          let mut streams = state.streams.lock().await;
          streams.remove(id);
        }
        rebuild_device_index(&state).await;
        broadcast_device_delta(&state, &delta).await;
      }
    }
  });
}

#[derive(Default)]
struct DeviceScanResult {
  devices: Vec<DeviceInfo>,
  soapy_kwargs_by_device_id: HashMap<String, HashMap<String, String>>,
  sdrconnect_cfg_by_device_id: HashMap<String, SdrconnectRadioInstanceConfig>,
}

fn discover_devices(cfg: &crate::config::RadioConfig) -> DeviceScanResult {
  let mut devices = Vec::new();
  let mut soapy_kwargs_by_device_id: HashMap<String, HashMap<String, String>> = HashMap::new();
  let mut sdrconnect_cfg_by_device_id: HashMap<String, SdrconnectRadioInstanceConfig> =
    HashMap::new();

  if cfg.dummy_enabled {
    devices.push(dummy_device("dummy:0"));
  }

  if cfg.soapy.enabled {
    if let Ok(list) = enumerate_soapy_devices() {
      for d in list {
        let device_id = stable_soapy_device_id(&d);
        soapy_kwargs_by_device_id.insert(device_id.clone(), d.kwargs.clone());
        devices.push(DeviceInfo {
          device_id,
          name: d.label.clone(),
          driver: d.driver.clone(),
          device_type: RadioType::Sdr,
          serial: d.serial.clone(),
          port: None,
          available: true,
          capabilities: default_sdr_capabilities(),
        });
      }
    }
  }

  if cfg.sdrconnect.enabled {
    for sc in &cfg.sdrconnect.radios {
      let device_id = stable_sdrconnect_device_id(sc);
      sdrconnect_cfg_by_device_id.insert(device_id.clone(), sc.clone());
      let display_name = if sc.name.trim().is_empty() {
        format!("SDRconnect @ {}", sc.url)
      } else {
        sc.name.clone()
      };
      devices.push(DeviceInfo {
        device_id,
        name: display_name,
        driver: "sdrconnect".to_string(),
        device_type: RadioType::Sdr,
        serial: sc.serial.clone(),
        port: Some(sc.url.clone()),
        available: true,
        capabilities: sdrconnect_sdr_capabilities(sc),
      });
    }
  }

  if cfg.hamlib.enabled && !cfg.hamlib.rigs.is_empty() {
    for rig in &cfg.hamlib.rigs {
      devices.push(hamlib_device_from_config(rig));
    }
  }

  DeviceScanResult {
    devices,
    soapy_kwargs_by_device_id,
    sdrconnect_cfg_by_device_id,
  }
}

fn stable_soapy_device_id(info: &propulse_discovery::soapy_enum::SoapyDeviceInfo) -> String {
  if let Some(serial) = info.serial.as_deref() {
    return format!("soapy:{}:{}", info.driver, serial);
  }
  let h = short_hash(&info.label);
  format!("soapy:{}:{}", info.driver, h)
}

fn stable_sdrconnect_device_id(info: &SdrconnectRadioInstanceConfig) -> String {
  let h = short_hash(&info.url);
  if let Some(serial) = info.serial.as_deref() {
    return format!("sdrconnect:{h}:{serial}");
  }
  format!("sdrconnect:{h}:{}", info.device_id.unwrap_or(0))
}

fn hamlib_device_from_config(rig: &HamlibRigConfig) -> DeviceInfo {
  DeviceInfo {
    device_id: stable_hamlib_device_id(rig),
    name: rig.name.clone(),
    driver: "hamlib".to_string(),
    device_type: RadioType::Transceiver,
    serial: None,
    port: Some(rig.port.clone()),
    // Configured Hamlib rigs are controlled through RigService, not the
    // RadioManager device protocol. Keep them visible for diagnostics but do
    // not claim that in-memory RadioManager commands control real hardware.
    available: false,
    capabilities: unavailable_rig_capabilities(),
  }
}

fn stable_hamlib_device_id(rig: &HamlibRigConfig) -> String {
  format!("hamlib:{}:{}", rig.model, short_hash(&rig.port))
}

fn short_hash(input: &str) -> String {
  use std::hash::{Hash, Hasher};
  let mut h = std::collections::hash_map::DefaultHasher::new();
  input.hash(&mut h);
  format!("{:016x}", h.finish())
}

fn default_sdr_capabilities() -> RadioCapabilities {
  RadioCapabilities {
    can_transmit: false,
    // IQ is consumed internally by the DSP pipeline; there is no client IQ
    // stream command in protocol 1.1.
    can_stream_iq: false,
    can_stream_fft: true,
    can_stream_audio: true,
    // Enumeration does not currently query antenna ports or gain ranges.
    // Keep those controls hidden instead of publishing invented values.
    antennas: Vec::new(),
    modes: vec![
      "USB".to_string(),
      "LSB".to_string(),
      "CW".to_string(),
      "AM".to_string(),
      "FM".to_string(),
    ],
    frequency_range: (1_000, 2_000_000_000),
    sample_rates: vec![2_048_000, 4_096_000],
    gain_stages: Vec::new(),
    commands: RadioCommandCapabilities {
      tune: true,
      mode: true,
      agc: true,
      filter: true,
      nr: true,
      nb: true,
      ..RadioCommandCapabilities::default()
    },
  }
}

fn sdrconnect_sdr_capabilities(cfg: &SdrconnectRadioInstanceConfig) -> RadioCapabilities {
  RadioCapabilities {
    can_transmit: false,
    can_stream_iq: false,
    can_stream_fft: true,
    can_stream_audio: true,
    antennas: Vec::new(),
    modes: vec![
      "USB".to_string(),
      "LSB".to_string(),
      "CW".to_string(),
      "AM".to_string(),
      "FM".to_string(),
    ],
    frequency_range: (1_000, 2_000_000_000),
    sample_rates: vec![cfg.sample_rate],
    gain_stages: Vec::new(),
    commands: RadioCommandCapabilities {
      tune: true,
      mode: true,
      squelch: true,
      agc: true,
      filter: true,
      nr: true,
      nb: true,
      ..RadioCommandCapabilities::default()
    },
  }
}

fn unavailable_rig_capabilities() -> RadioCapabilities {
  RadioCapabilities {
    can_transmit: false,
    can_stream_iq: false,
    can_stream_fft: false,
    can_stream_audio: false,
    antennas: Vec::new(),
    modes: Vec::new(),
    frequency_range: (0, 0),
    sample_rates: Vec::new(),
    gain_stages: Vec::new(),
    commands: RadioCommandCapabilities::default(),
  }
}

async fn rebuild_device_index(state: &Arc<DaemonState>) {
  let map = {
    let radio = state.radio.lock().await;
    radio
      .devices()
      .iter()
      .enumerate()
      .map(|(idx, d)| (d.device_id.clone(), u8::try_from(idx).unwrap_or(0)))
      .collect::<HashMap<_, _>>()
  };

  let mut idx = state.device_idx_by_id.lock().await;
  *idx = map;
}

async fn broadcast_device_delta(state: &Arc<DaemonState>, delta: &DeviceDelta) {
  for dev in &delta.added {
    let msg = serde_json::json!({
      "type": "devices:added",
      "device_id": dev.device_id,
      "name": dev.name,
    });
    let _ = broadcast_json(state, &msg).await;
  }
  for id in &delta.removed {
    let msg = serde_json::json!({
      "type": "devices:removed",
      "device_id": id,
    });
    let _ = broadcast_json(state, &msg).await;
  }
}

async fn handle_client(
  stream: TcpStream,
  remote: SocketAddr,
  state: Arc<DaemonState>,
) -> anyhow::Result<()> {
  let ws = accept_async(stream).await?;
  info!(%remote, "client connected");

  let client_id = Uuid::new_v4().to_string();

  let (out_tx, out_rx) = mpsc::unbounded_channel::<Message>();

  {
    let mut clients = state.clients.lock().await;
    clients.insert(
      client_id.clone(),
      ClientState {
        sender: out_tx.clone(),
        authenticated: state.auth_token.is_none(),
        fft_subs: HashSet::new(),
        audio_subs: HashSet::new(),
      },
    );
  }

  let (ws_sink, mut ws_stream) = ws.split();

  let writer_handle = tokio::spawn(client_writer(out_rx, ws_sink, remote));

  let daemon_id = state.daemon_id.clone();
  send_json(
    &state,
    &client_id,
    &Hello {
      kind: "hello".to_string(),
      version: PROTOCOL_VERSION.to_string(),
      daemon_id,
      features: vec![
        "command-capabilities".to_string(),
        "correlated-responses".to_string(),
        "ptt-safety".to_string(),
        "stream-subscriptions".to_string(),
      ],
    },
  )
  .await?;

  while let Some(msg) = ws_stream.next().await {
    match msg {
      Ok(Message::Text(text)) => {
        handle_text_message(&state, &client_id, &text).await?;
      }
      Ok(Message::Binary(bin)) => {
        debug!(%remote, len = bin.len(), "rx binary");
      }
      Ok(Message::Close(_)) => {
        break;
      }
      Ok(_) => {}
      Err(err) => {
        error!(%remote, error = %err, "ws error");
        break;
      }
    }
  }

  writer_handle.abort();
  remove_client_and_cleanup(&state, &client_id).await;

  info!(%remote, "client disconnected");
  Ok(())
}

async fn client_writer(
  mut rx: mpsc::UnboundedReceiver<Message>,
  mut sink: futures_util::stream::SplitSink<WebSocketStream<TcpStream>, Message>,
  remote: SocketAddr,
) {
  while let Some(msg) = rx.recv().await {
    if let Err(err) = sink.send(msg).await {
      debug!(%remote, error = %err, "writer send failed");
      break;
    }
  }
}

#[derive(Debug)]
struct ClientState {
  sender: mpsc::UnboundedSender<Message>,
  authenticated: bool,
  fft_subs: HashSet<String>,
  audio_subs: HashSet<String>,
}

#[derive(Default)]
struct DeviceStreams {
  fft: Option<JoinHandle<()>>,
  audio: Option<JoinHandle<()>>,
  dsp: Option<Arc<Mutex<DspPipeline>>>,
  soapy: Option<SoapyRuntime>,
  sdrconnect: Option<SdrconnectRuntime>,
}

struct SoapyRuntime {
  device: SoapyDevice,
  sample_rate: u32,
  buffer: Arc<StdMutex<VecDeque<Complex32>>>,
  stop: Arc<AtomicBool>,
  reader: Option<JoinHandle<()>>,
}

async fn send_to_client(state: &Arc<DaemonState>, client_id: &str, msg: Message) -> bool {
  let clients = state.clients.lock().await;
  clients
    .get(client_id)
    .and_then(|c| c.sender.send(msg).ok())
    .is_some()
}

async fn send_json<T: serde::Serialize>(
  state: &Arc<DaemonState>,
  client_id: &str,
  value: &T,
) -> anyhow::Result<()> {
  let text = serde_json::to_string(value)?;
  send_to_client(state, client_id, Message::Text(text)).await;
  Ok(())
}

async fn broadcast_json<T: serde::Serialize>(
  state: &Arc<DaemonState>,
  value: &T,
) -> anyhow::Result<()> {
  let text = serde_json::to_string(value)?;
  let clients = state.clients.lock().await;
  for c in clients.values() {
    let _ = c.sender.send(Message::Text(text.clone()));
  }
  Ok(())
}

async fn broadcast_stream_frame(
  state: &Arc<DaemonState>,
  kind: StreamKind,
  device_id: &str,
  bytes: Vec<u8>,
) {
  let clients = state.clients.lock().await;
  for c in clients.values() {
    let wants = match kind {
      StreamKind::Fft => c.fft_subs.contains(device_id),
      StreamKind::Audio => c.audio_subs.contains(device_id),
    };
    if wants {
      let _ = c.sender.send(Message::Binary(bytes.clone()));
    }
  }
}

#[derive(Debug, Clone, Copy)]
enum StreamKind {
  Fft,
  Audio,
}

const MAX_MANUAL_PTT_DURATION: Duration = Duration::from_secs(180);
const PTT_RELEASE_RETRY_DELAY: Duration = Duration::from_secs(1);

async fn attempt_release_all_ptt(state: &Arc<DaemonState>, reason: &str) -> bool {
  let mut release_succeeded = true;
  let rig = {
    let integrations = state.integrations.lock().await;
    integrations.rig.as_ref().map(|running| running.service.clone())
  };
  if let Some(rig) = rig {
    match rig.status().await {
      Ok(status) if status.connected => {
        if let Err(err) = rig.set_ptt(false).await {
          release_succeeded = false;
          warn!(error = %err, %reason, "failed to release rig PTT");
        }
      }
      Ok(_) => {}
      Err(err) => {
        release_succeeded = false;
        warn!(error = %err, %reason, "failed to release rig PTT");
      }
    }
  }

  let (released, radio_release_succeeded) = {
    let mut radio = state.radio.lock().await;
    let ids = radio
      .devices()
      .iter()
      .filter(|device| device.capabilities.can_transmit)
      .filter(|device| radio.state(&device.device_id).is_some_and(|status| status.ptt == Some(true)))
      .map(|device| device.device_id.clone())
      .collect::<Vec<_>>();
    let mut released = Vec::new();
    let mut succeeded = true;
    for device_id in ids {
      match radio.set_ptt(&device_id, false) {
        Ok(status) => released.push((device_id, status)),
        Err(err) => {
          succeeded = false;
          warn!(error = %err, %reason, %device_id, "failed to release radio PTT");
        }
      }
    }
    (released, succeeded)
  };

  for (device_id, radio_state) in released {
    let _ = broadcast_json(
      state,
      &RadioStateEvent {
        kind: "radio:state".to_string(),
        device_id,
        state: radio_state.clone(),
      },
    )
    .await;
    let _ = maybe_broadcast_rig_from_radio_state(state, &radio_state).await;
  }

  release_succeeded && radio_release_succeeded
}

async fn release_all_ptt(state: &Arc<DaemonState>, reason: &str) {
  let generation = state.ptt_safety.begin_release();
  if attempt_release_all_ptt(state, reason).await {
    state.ptt_safety.complete_release(generation).await;
    return;
  }

  if !state.ptt_safety.generation_is(generation) {
    return;
  }

  let state = Arc::clone(state);
  let reason = reason.to_string();
  tokio::spawn(async move {
    loop {
      tokio::time::sleep(PTT_RELEASE_RETRY_DELAY).await;
      if !state.ptt_safety.generation_is(generation) {
        return;
      }
      if attempt_release_all_ptt(&state, &reason).await {
        state.ptt_safety.complete_release(generation).await;
        return;
      }
    }
  });
}

async fn track_manual_ptt(state: &Arc<DaemonState>, client_id: &str, active: bool) {
  let generation = state.ptt_safety.track_manual(client_id, active).await;

  if active {
    let state = Arc::clone(state);
    tokio::spawn(async move {
      tokio::time::sleep(MAX_MANUAL_PTT_DURATION).await;
      if state.ptt_safety.generation_is(generation) {
        release_all_ptt(&state, "manual PTT timeout").await;
      }
    });
  }
}

async fn configure_ptt_safety(state: &Arc<DaemonState>, lockout: bool) {
  state.ptt_safety.lockout.store(lockout, Ordering::SeqCst);
  if lockout {
    release_all_ptt(state, "PTT safety lockout enabled").await;
  }
}

async fn handle_text_message(
  state: &Arc<DaemonState>,
  client_id: &str,
  text: &str,
) -> anyhow::Result<()> {
  let value: serde_json::Value = match serde_json::from_str(text) {
    Ok(v) => v,
    Err(_) => {
      return Ok(());
    }
  };

  let Some(msg_type) = value.get("type").and_then(|v| v.as_str()) else {
    return Ok(());
  };
  let id = value.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
  let is_bridge_message = state.compat_bridge && value.get("payload").is_some();

  // Authentication applies equally to flat daemon messages and compatibility
  // envelopes. Check without holding the clients lock across a response send.
  let authenticated = {
    let clients = state.clients.lock().await;
    clients
      .get(client_id)
      .is_some_and(|client| client.authenticated)
  };
  if state.auth_token.is_some() && !authenticated && msg_type != "hello" {
    if is_bridge_message {
      send_bridge_envelope(
        state,
        client_id,
        id.as_deref(),
        "error",
        serde_json::json!({ "code": "UNAUTHENTICATED", "message": "Not authenticated" }),
      )
      .await?;
    } else if let Some(id) = id {
      send_json(state, client_id, &Response::err(id, "Not authenticated")).await?;
    }
    return Ok(());
  }

  // Bridge compatibility: messages that use { type, payload, ... } are treated as
  // legacy bridge messages.
  if is_bridge_message {
    handle_bridge_message(state, client_id, &value).await?;
    return Ok(());
  }

  match msg_type {
    "hello" => {
      let presented = value
        .get("auth_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");

      let mut ok = true;
      {
        if let Some(expected) = state.auth_token.as_deref() {
          ok = presented == expected;
        }

        let mut clients = state.clients.lock().await;
        if let Some(client) = clients.get_mut(client_id) {
          client.authenticated = ok;
        }
      }

      if let Some(id) = id {
        if ok {
          send_json(state, client_id, &Response::ok(id)).await?;
        } else {
          send_json(state, client_id, &Response::err(id, "Invalid token")).await?;
        }
      }
    }

    "devices:enumerate" => {
      if let Some(id) = id.clone() {
        send_json(state, client_id, &Response::ok(id)).await?;
      }

      let devices = { state.radio.lock().await.devices().to_vec() };
      send_json(
        state,
        client_id,
        &DevicesList {
          kind: "devices:list".to_string(),
          devices,
        },
      )
      .await?;
    }

    "rig:test" => {
      // Reuse the compatibility protocol's real backend probe so setup clients
      // receive the same correlated result from either server implementation.
      let envelope = serde_json::json!({
        "type": "rig:test",
        "id": id,
        "payload": value.clone(),
      });
      handle_bridge_message(state, client_id, &envelope).await?;
    }

    "radio:connect" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };

      // Preflight without changing state: ensure device exists and isn't already connected.
      let (device, current_state) = {
        let radio = state.radio.lock().await;
        let dev = radio.device(device_id).cloned();
        let st = radio.state(device_id).cloned();
        (dev, st)
      };

      let Some(device) = device else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "Device not found")).await?;
        }
        return Ok(());
      };

      if current_state.as_ref().is_some_and(|s| s.connected) {
        // Treat connect as idempotent so a UI refresh or a second client can
        // regain control/visibility without forcing a daemon restart.
        if let Some(id) = id.clone() {
          send_json(state, client_id, &Response::ok(id)).await?;
        }
        if let Some(st) = current_state {
          send_json(
            state,
            client_id,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: st,
            },
          )
          .await?;
        }
        return Ok(());
      }

      if !device.available {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "Device not available")).await?;
        }
        return Ok(());
      }

      // Optional connect config.
      let (sample_rate, antenna) = {
        let cfg = value.get("config");
        let sample_rate = cfg
          .and_then(|c| c.get("sample_rate"))
          .and_then(|v| v.as_u64())
          .map(|v| v as u32);
        let antenna = cfg
          .and_then(|c| c.get("antenna"))
          .and_then(|v| v.as_str())
          .map(|s| s.to_string());
        (sample_rate, antenna)
      };

      // SoapySDR devices require a real connection to stream IQ/FFT/audio.
      if device_id.starts_with("soapy:") {
        let kwargs = {
          let map = state.soapy_kwargs_by_device_id.lock().await;
          map.get(device_id).cloned()
        };
        let Some(kwargs) = kwargs else {
          if let Some(id) = id {
            send_json(
              state,
              client_id,
              &Response::err(id, "SoapySDR device details not found; re-enumerate devices"),
            )
            .await?;
          }
          return Ok(());
        };

        let freq = current_state.as_ref().map(|s| s.freq).unwrap_or(14_074_000);
        let gains = current_state
          .as_ref()
          .map(|s| s.gains.clone())
          .unwrap_or_default();
        let sample_rate = sample_rate.unwrap_or(2_048_000);
        let antenna2 = antenna.clone();

        let soapy = tokio::task::spawn_blocking(move || -> anyhow::Result<SoapyDevice> {
          let dev = SoapyDevice::open(&kwargs)?;
          dev.set_sample_rate(sample_rate)?;
          dev.set_frequency(freq)?;
          if let Some(a) = antenna2.as_deref() {
            let _ = dev.set_antenna(a);
          }
          for (stage, val) in &gains {
            let _ = dev.set_gain_element(stage, *val);
          }
          Ok(dev)
        })
        .await
        .map_err(|_| anyhow::anyhow!("Soapy connect task failed"))??;

        let maybe_pipeline = {
          let mut streams = state.streams.lock().await;
          let entry = streams.entry(device_id.to_string()).or_default();
          entry.soapy = Some(SoapyRuntime {
            device: soapy,
            sample_rate,
            buffer: Arc::new(StdMutex::new(VecDeque::new())),
            stop: Arc::new(AtomicBool::new(false)),
            reader: None,
          });
          entry.dsp.as_ref().cloned()
        };

        if let Some(p) = maybe_pipeline {
          let audio_rate = { state.config.lock().await.dsp.default_audio_rate };
          let mut pipe = p.lock().await;
          pipe.set_sample_rates(sample_rate, audio_rate);
        }
      }

      // SDRconnect network devices require a remote WebSocket session.
      if device_id.starts_with("sdrconnect:") {
        let cfg = {
          let map = state.sdrconnect_cfg_by_device_id.lock().await;
          map.get(device_id).cloned()
        };
        let Some(mut cfg) = cfg else {
          if let Some(id) = id {
            send_json(
              state,
              client_id,
              &Response::err(id, "SDRconnect device details not found; re-enumerate devices"),
            )
            .await?;
          }
          return Ok(());
        };

        if let Some(sr) = sample_rate {
          cfg.sample_rate = sr;
        }

        let freq = current_state.as_ref().map(|s| s.freq).unwrap_or(14_074_000);
        let gains = current_state
          .as_ref()
          .map(|s| s.gains.clone())
          .unwrap_or_default();
        let gain = gains.get("GAIN").copied().or_else(|| gains.values().next().copied());

        let rt = match SdrconnectRuntime::connect(cfg, freq, gain).await {
          Ok(v) => v,
          Err(err) => {
            if let Some(id) = id {
              send_json(state, client_id, &Response::err(id, err.to_string())).await?;
            }
            return Ok(());
          }
        };
        let iq_sample_rate = rt.sample_rate();

        let maybe_pipeline = {
          let mut streams = state.streams.lock().await;
          let entry = streams.entry(device_id.to_string()).or_default();
          entry.sdrconnect = Some(rt);
          entry.dsp.as_ref().cloned()
        };

        if let Some(p) = maybe_pipeline {
          let audio_rate = { state.config.lock().await.dsp.default_audio_rate };
          let mut pipe = p.lock().await;
          pipe.set_sample_rates(iq_sample_rate, audio_rate);
        }
      }

      let mut radio = state.radio.lock().await;
      match radio.connect(device_id) {
        Ok(mut new_state) => {
          if let Some(a) = antenna.as_deref() {
            if let Ok(st) = radio.set_antenna(device_id, a) {
              new_state = st;
            }
          }

          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state.clone(),
            },
          )
          .await?;
          maybe_broadcast_rig_from_radio_state(state, &new_state).await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:disconnect" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };

      stop_device_streams_if_any(state, device_id).await;
      stop_soapy_device_if_any(state, device_id).await;
      stop_sdrconnect_device_if_any(state, device_id).await;
      release_all_ptt(state, "radio disconnect").await;

      let mut radio = state.radio.lock().await;
      match radio.disconnect(device_id) {
        Ok(new_state) => {
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state.clone(),
            },
          )
          .await?;
          maybe_broadcast_rig_from_radio_state(state, &new_state).await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:tune" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let Some(freq) = value.get("freq").and_then(|v| v.as_u64()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "freq required")).await?;
        }
        return Ok(());
      };

      if let Err(err) = maybe_apply_soapy_tune(state, device_id, freq).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }
      if let Err(err) = maybe_apply_sdrconnect_tune(state, device_id, freq).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }

      let mut radio = state.radio.lock().await;
      match radio.tune(device_id, freq) {
        Ok(new_state) => {
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state.clone(),
            },
          )
          .await?;
          maybe_broadcast_rig_from_radio_state(state, &new_state).await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:mode" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let Some(mode) = value.get("mode").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "mode required")).await?;
        }
        return Ok(());
      };

      let mut radio = state.radio.lock().await;
      match radio.set_mode(device_id, mode) {
        Ok(new_state) => {
          drop(radio);
          apply_radio_state_to_active_pipeline(state, device_id, &new_state).await;
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state.clone(),
            },
          )
          .await?;
          maybe_broadcast_rig_from_radio_state(state, &new_state).await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:gain" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let Some(stage) = value.get("stage").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "stage required")).await?;
        }
        return Ok(());
      };
      let Some(value) = value.get("value").and_then(|v| v.as_f64()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "value required")).await?;
        }
        return Ok(());
      };

      if let Err(err) = maybe_apply_soapy_gain(state, device_id, stage, value as f32).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }
      if let Err(err) = maybe_apply_sdrconnect_gain(state, device_id, stage, value as f32).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }

      let mut radio = state.radio.lock().await;
      match radio.set_gain(device_id, stage, value as f32) {
        Ok(new_state) => {
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state,
            },
          )
          .await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:agc" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let enabled = value.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
      let mode = value
        .get("mode")
        .and_then(|v| v.as_u64())
        .map(|value| value.clamp(0, 3) as u8)
        .unwrap_or(if enabled { 3 } else { 0 });

      let mut radio = state.radio.lock().await;
      match radio.set_agc(device_id, enabled, mode) {
        Ok(new_state) => {
          drop(radio);
          apply_radio_state_to_active_pipeline(state, device_id, &new_state).await;
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state,
            },
          )
          .await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:ptt" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let active = value.get("active").and_then(|v| v.as_bool()).unwrap_or(false);

      if active {
        if let Some(error) = state.ptt_safety.key_down_error() {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, error)).await?;
          }
          return Ok(());
        }
      }

      let mut radio = state.radio.lock().await;
      match radio.set_ptt(device_id, active) {
        Ok(new_state) => {
          drop(radio);
          track_manual_ptt(state, client_id, active).await;
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state.clone(),
            },
          )
          .await?;
          maybe_broadcast_rig_from_radio_state(state, &new_state).await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "safety:configure" => {
      let lockout = value
        .get("ptt_lockout")
        .or_else(|| value.get("pttLockout"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      configure_ptt_safety(state, lockout).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "radio:filter" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let Some(low) = value.get("low").and_then(|v| v.as_i64()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "low required")).await?;
        }
        return Ok(());
      };
      let Some(high) = value.get("high").and_then(|v| v.as_i64()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "high required")).await?;
        }
        return Ok(());
      };

      let mut radio = state.radio.lock().await;
      match radio.set_filter(device_id, low as i32, high as i32) {
        Ok(new_state) => {
          drop(radio);
          apply_radio_state_to_active_pipeline(state, device_id, &new_state).await;
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state,
            },
          )
          .await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:nr" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let enabled = value.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
      let level = value.get("level").and_then(|v| v.as_u64()).unwrap_or(0) as u8;

      let mut radio = state.radio.lock().await;
      match radio.set_nr(device_id, enabled, level) {
        Ok(new_state) => {
          drop(radio);
          apply_radio_state_to_active_pipeline(state, device_id, &new_state).await;
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state,
            },
          )
          .await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:nb" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let enabled = value.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
      let threshold = value.get("threshold").and_then(|v| v.as_u64()).map(|n| n as u32);

      let mut radio = state.radio.lock().await;
      match radio.set_nb(device_id, enabled, threshold) {
        Ok(new_state) => {
          drop(radio);
          apply_radio_state_to_active_pipeline(state, device_id, &new_state).await;
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state,
            },
          )
          .await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:squelch" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let Some(level) = value.get("level").and_then(|v| v.as_f64()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "level required")).await?;
        }
        return Ok(());
      };

      if let Err(err) = maybe_apply_sdrconnect_squelch(state, device_id, level as f32).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }

      let mut radio = state.radio.lock().await;
      match radio.set_squelch(device_id, level as f32) {
        Ok(new_state) => {
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state,
            },
          )
          .await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "radio:antenna" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let Some(port) = value.get("port").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "port required")).await?;
        }
        return Ok(());
      };

      if let Err(err) = maybe_apply_soapy_antenna(state, device_id, port).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }

      let mut radio = state.radio.lock().await;
      match radio.set_antenna(device_id, port) {
        Ok(new_state) => {
          if let Some(id) = id.clone() {
            send_json(state, client_id, &Response::ok(id)).await?;
          }
          broadcast_json(
            state,
            &RadioStateEvent {
              kind: "radio:state".to_string(),
              device_id: device_id.to_string(),
              state: new_state,
            },
          )
          .await?;
        }
        Err(err) => {
          if let Some(id) = id {
            send_json(state, client_id, &Response::err(id, err.to_string())).await?;
          }
        }
      }
    }

    "stream:fft:start" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let fft_size = value
        .get("fft_size")
        .and_then(|v| v.as_u64())
        .unwrap_or(4096) as usize;
      let fps = value.get("fps").and_then(|v| v.as_u64()).unwrap_or(20) as u32;
      let averaging = value
        .get("averaging")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as usize;

      if let Err(err) = validate_stream_start(state, device_id, StreamKind::Fft).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }

      subscribe(state, client_id, StreamKind::Fft, device_id).await;
      ensure_fft_stream(state, device_id, fft_size, fps, averaging).await;

      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "stream:fft:stop" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };

      unsubscribe(state, client_id, StreamKind::Fft, device_id).await;
      stop_stream_if_no_subscribers(state, StreamKind::Fft, device_id).await;

      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "stream:audio:start" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let sample_rate = value
        .get("sample_rate")
        .and_then(|v| v.as_u64())
        .unwrap_or(48_000) as u32;

      if let Err(err) = validate_stream_start(state, device_id, StreamKind::Audio).await {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, err.to_string())).await?;
        }
        return Ok(());
      }

      subscribe(state, client_id, StreamKind::Audio, device_id).await;
      ensure_audio_stream(state, device_id, sample_rate).await;

      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "stream:audio:stop" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };

      unsubscribe(state, client_id, StreamKind::Audio, device_id).await;
      stop_stream_if_no_subscribers(state, StreamKind::Audio, device_id).await;

      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "daemon:status" => {
      if let Some(id) = id.clone() {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
      let status = build_status(state).await;
      send_json(state, client_id, &status).await?;
    }

    "daemon:config" => {
      let audio_output = value.get("audio_output").and_then(|v| v.as_str()).map(|s| s.to_string());
      let virtual_cable = value.get("virtual_cable").and_then(|v| v.as_bool());

      if audio_output.is_none() && virtual_cable.is_none() {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "No config fields provided")).await?;
        }
        return Ok(());
      }

      let next = {
        let cfg = state.config.lock().await.clone();
        let mut cfg = cfg;
        if let Some(out) = audio_output {
          cfg.audio.output_device = out;
        }
        if let Some(v) = virtual_cable {
          cfg.audio.virtual_cable = v;
        }
        cfg
      };

      apply_runtime_config(state, &next).await;

      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "cluster:connect" => {
      let Some(host) = value.get("host").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "host required")).await?;
        }
        return Ok(());
      };
      let port = value.get("port").and_then(|v| v.as_u64()).unwrap_or(7300) as u16;
      let Some(callsign) = value.get("callsign").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "callsign required")).await?;
        }
        return Ok(());
      };

      let cfg = ClusterConnectConfig {
        host: host.to_string(),
        port,
        callsign: callsign.to_string(),
        password: value.get("password").and_then(|v| v.as_str()).map(|s| s.to_string()),
        filters: None,
      };

      start_cluster(state, cfg).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "cluster:disconnect" => {
      let key = value
        .get("host")
        .and_then(|v| v.as_str())
        .map(|host| {
          let port = value.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
          if port == 0 {
            host.to_string()
          } else {
            format!("{host}:{port}")
          }
        });

      stop_cluster(state, key.as_deref()).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "wsjtx:start" => {
      let port = value.get("port").and_then(|v| v.as_u64()).unwrap_or(2237) as u16;
      start_wsjtx(state, port).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "wsjtx:stop" => {
      stop_wsjtx(state).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "cat_server:start" => {
      let bind = value
        .get("bind")
        .and_then(|v| v.as_str())
        .unwrap_or("127.0.0.1");
      let port = value.get("port").and_then(|v| v.as_u64()).unwrap_or(4532) as u16;
      start_virtual_cat_server(state, bind, port).await?;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "cat_server:stop" => {
      stop_virtual_cat_server(state).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "n1mm:start" => {
      let port = value.get("port").and_then(|v| v.as_u64()).unwrap_or(12060) as u16;
      start_n1mm(state, port).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "n1mm:stop" => {
      stop_n1mm(state).await;
      if let Some(id) = id {
        send_json(state, client_id, &Response::ok(id)).await?;
      }
    }

    "discovery:mdns:browse" => {
      let timeout_ms = value.get("timeout_ms").and_then(|v| v.as_u64()).unwrap_or(1500);
      if let Some(id) = id.clone() {
        send_json(state, client_id, &Response::ok(id)).await?;
      }

      let state2 = Arc::clone(state);
      let client_id = client_id.to_string();
      tokio::spawn(async move {
        let daemons = match propulse_discovery::mdns::browse_propulse(Duration::from_millis(timeout_ms)).await {
          Ok(list) => list
            .into_iter()
            .map(|d| {
              serde_json::json!({
                "fullname": d.fullname,
                "hostname": d.hostname,
                "port": d.port,
                "addresses": d.addresses.into_iter().map(|a| a.to_string()).collect::<Vec<_>>(),
                "txt": d.txt,
              })
            })
            .collect::<Vec<_>>(),
          Err(err) => {
            tracing::debug!(error = %err, "mDNS browse failed");
            Vec::new()
          }
        };

        let msg = serde_json::json!({
          "type": "discovery:daemons",
          "daemons": daemons,
        });
        let _ = send_json(&state2, &client_id, &msg).await;
      });
    }

    _ => {
      if let Some(id) = id {
        send_json(state, client_id, &Response::err(id, format!("Unknown message type: {msg_type}")))
          .await?;
      }
    }
  }

  Ok(())
}

async fn start_cluster(state: &Arc<DaemonState>, cfg: ClusterConnectConfig) {
  let key = format!("{}:{}", cfg.host, cfg.port);
  {
    let integrations = state.integrations.lock().await;
    if integrations.clusters.contains_key(&key) {
      return;
    }
  }

  let stop = Arc::new(AtomicBool::new(false));
  let stop2 = Arc::clone(&stop);
  let state2 = Arc::clone(state);
  let cfg2 = cfg.clone();

  let handle = tokio::spawn(async move {
    let should_stop = move || stop2.load(Ordering::Relaxed);
    let client = match ClusterClient::new(cfg2.clone()) {
      Ok(c) => c,
      Err(err) => {
        tracing::error!(error = %err, "Failed to start cluster client");
        return;
      }
    };

    client
      .run(
        move |ev| {
          let state3 = Arc::clone(&state2);
          let key = format!("{}:{}", cfg2.host, cfg2.port);
          tokio::spawn(async move {
            match ev {
              ClusterEvent::Status(status) => {
                let msg = serde_json::json!({
                  "type": "cluster:status",
                  "node": status.node,
                  "connected": status.connected,
                  "spotsReceived": status.spots_received,
                  "lastSpotTime": status.last_spot_time,
                  "key": key,
                });
                let _ = broadcast_json(&state3, &msg).await;

                // Legacy bridge event
                let legacy = serde_json::json!({
                  "type": "cluster.status",
                  "timestamp": now_ms(),
                  "payload": {
                    "connected": status.connected,
                    "node": status.node,
                    "spotsReceived": status.spots_received,
                    "lastSpotTime": status.last_spot_time,
                  }
                });
                let _ = broadcast_json(&state3, &legacy).await;
              }
              ClusterEvent::Spot(spot) => {
                let msg = serde_json::json!({
                  "type": "cluster:spot",
                  "spotter": spot.spotter,
                  "spotterGrid": spot.spotter_grid,
                  "dx": spot.dx,
                  "dxGrid": spot.dx_grid,
                  "freq": spot.frequency,
                  "comment": spot.comment,
                  "time": spot.time,
                  "mode": spot.mode,
                  "band": spot.band,
                  "id": spot.id,
                  "key": key,
                });
                let _ = broadcast_json(&state3, &msg).await;

                let legacy = serde_json::json!({
                  "type": "cluster.spot",
                  "timestamp": now_ms(),
                  "payload": spot,
                });
                let _ = broadcast_json(&state3, &legacy).await;
              }
            }
          });
        },
        should_stop,
      )
      .await;
  });

  let mut integrations = state.integrations.lock().await;
  integrations.clusters.insert(
    key,
    RunningCluster {
      cfg,
      stop,
      handle,
    },
  );
}

async fn stop_cluster(state: &Arc<DaemonState>, key: Option<&str>) {
  let mut integrations = state.integrations.lock().await;
  if let Some(key) = key {
    if let Some(c) = integrations.clusters.remove(key) {
      c.stop.store(true, Ordering::Relaxed);
      c.handle.abort();
    }
    return;
  }

  for (_, c) in integrations.clusters.drain() {
    c.stop.store(true, Ordering::Relaxed);
    c.handle.abort();
  }
}

async fn start_wsjtx(state: &Arc<DaemonState>, port: u16) {
  {
    let integrations = state.integrations.lock().await;
    if integrations.wsjtx.as_ref().is_some_and(|w| w.port == port) {
      return;
    }
  }

  stop_wsjtx(state).await;

  let stop = Arc::new(AtomicBool::new(false));
  let stop2 = Arc::clone(&stop);
  let state2 = Arc::clone(state);
  let last_seen = Arc::new(Mutex::new(Instant::now()));
  let last_seen2 = Arc::clone(&last_seen);

  let handle = tokio::spawn(async move {
    let port2 = port;
    let stop_check = move || stop2.load(Ordering::Relaxed);

    let _ = run_wsjtx_listener(
      port2,
      move |ev| {
        let state3 = Arc::clone(&state2);
        let last_seen3 = Arc::clone(&last_seen2);
        tokio::spawn(async move {
          *last_seen3.lock().await = Instant::now();

          match ev {
            WSJTXEvent::Status(st) => {
              let msg = serde_json::json!({ "type": "wsjtx:status", "status": st });
              let _ = broadcast_json(&state3, &msg).await;
              let legacy = serde_json::json!({
                "type": "wsjtx.status",
                "timestamp": now_ms(),
                "payload": st,
              });
              let _ = broadcast_json(&state3, &legacy).await;
            }
            WSJTXEvent::Decode(d) => {
              let msg = serde_json::json!({ "type": "wsjtx:decode", "decode": d });
              let _ = broadcast_json(&state3, &msg).await;
              let legacy = serde_json::json!({
                "type": "wsjtx.decode",
                "timestamp": now_ms(),
                "payload": d,
              });
              let _ = broadcast_json(&state3, &legacy).await;
            }
            WSJTXEvent::QsoLogged(q) => {
              let msg = serde_json::json!({ "type": "wsjtx:qso_logged", "qso": q });
              let _ = broadcast_json(&state3, &msg).await;
              let legacy = serde_json::json!({
                "type": "wsjtx.qso_logged",
                "timestamp": now_ms(),
                "payload": q,
              });
              let _ = broadcast_json(&state3, &legacy).await;

              maybe_broadcast_n1mm_contact(&state3, &q).await;
            }
            WSJTXEvent::Clear { window, instance_id } => {
              let msg = serde_json::json!({ "type": "wsjtx:clear", "window": window, "instanceId": instance_id });
              let _ = broadcast_json(&state3, &msg).await;
              let legacy = serde_json::json!({
                "type": "wsjtx.clear",
                "timestamp": now_ms(),
                "payload": { "window": window, "instanceId": instance_id },
              });
              let _ = broadcast_json(&state3, &legacy).await;
            }
          }
        });
      },
      stop_check,
    )
    .await;
  });

  // Heartbeat watchdog
  let state_watch = Arc::clone(state);
  let stop_watch = Arc::clone(&stop);
  let last_seen_watch = Arc::clone(&last_seen);
  tokio::spawn(async move {
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    loop {
      tick.tick().await;
      if stop_watch.load(Ordering::Relaxed) {
        break;
      }
      let since = last_seen_watch.lock().await.elapsed();
      if since > Duration::from_secs(10) {
        let msg = serde_json::json!({
          "type": "wsjtx:warning",
          "warning": "No WSJT-X datagrams received in >10s",
          "last_seen_ms": since.as_millis() as u64,
        });
        let _ = broadcast_json(&state_watch, &msg).await;
      }
    }
  });

  let mut integrations = state.integrations.lock().await;
  integrations.wsjtx = Some(RunningWsjtx {
    port,
    stop,
    handle,
    last_seen,
  });
}

async fn stop_wsjtx(state: &Arc<DaemonState>) {
  let mut integrations = state.integrations.lock().await;
  if let Some(w) = integrations.wsjtx.take() {
    w.stop.store(true, Ordering::Relaxed);
    w.handle.abort();
  }
}

async fn ensure_rig_service(state: &Arc<DaemonState>) -> RigService {
  let existing = {
    let integrations = state.integrations.lock().await;
    integrations.rig.as_ref().map(|r| r.service.clone())
  };
  if let Some(r) = existing {
    return r;
  }

  let last_status = Arc::new(Mutex::new(RigStatus {
    connected: false,
    frequency: None,
    mode: None,
    ptt: None,
    backend: Some("none".to_string()),
  }));

  let last_status2 = Arc::clone(&last_status);
  let state2 = Arc::clone(state);

  let (service, handle) = RigService::start(move |st| {
    let state3 = Arc::clone(&state2);
    let last_status3 = Arc::clone(&last_status2);
    tokio::spawn(async move {
      *last_status3.lock().await = st.clone();
      let _ = broadcast_rig_from_status(&state3, &st).await;
    });
  });

  // Auto-connect best-effort (same behavior as the old bridge).
  let svc2 = service.clone();
  tokio::spawn(async move {
    let _ = svc2
      .connect(RigConnectConfig {
        backend: RigBackendKind::Auto,
        host: None,
        port: None,
        poll_interval_ms: Some(200),
      })
      .await;
  });

  let mut integrations = state.integrations.lock().await;
  integrations.rig = Some(RunningRig {
    service: service.clone(),
    handle,
    last_status,
  });

  service
}

struct DaemonCatBackend {
  state: Arc<DaemonState>,
}

#[async_trait]
impl CatBackend for DaemonCatBackend {
  async fn get_frequency(&self) -> anyhow::Result<u64> {
    let rig = ensure_rig_service(&self.state).await;
    if let Ok(st) = rig.status().await {
      if st.connected {
        if let Some(freq) = st.frequency {
          return Ok(freq);
        }
      }
    }

    let radio = self.state.radio.lock().await;
    for d in radio.devices() {
      if let Some(st) = radio.state(&d.device_id) {
        if st.connected {
          return Ok(st.freq);
        }
      }
    }
    Ok(0)
  }

  async fn set_frequency(&self, hz: u64) -> anyhow::Result<()> {
    let rig = ensure_rig_service(&self.state).await;
    if let Ok(st) = rig.status().await {
      if st.connected {
        return rig.set_frequency(hz).await;
      }
    }

    let (device_id, new_state) = {
      let mut radio = self.state.radio.lock().await;
      let device_id = radio
        .devices()
        .iter()
        .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
        .map(|d| d.device_id.clone())
        .ok_or_else(|| anyhow::anyhow!("No connected device"))?;
      let new_state = radio.tune(&device_id, hz)?;
      (device_id, new_state)
    };

    broadcast_json(
      &self.state,
      &RadioStateEvent {
        kind: "radio:state".to_string(),
        device_id: device_id.clone(),
        state: new_state.clone(),
      },
    )
    .await?;
    broadcast_rig_from_radio_state(&self.state, &new_state).await?;
    Ok(())
  }

  async fn get_mode(&self) -> anyhow::Result<(String, i32)> {
    let rig = ensure_rig_service(&self.state).await;
    if let Ok(st) = rig.status().await {
      if st.connected {
        return Ok((st.mode.unwrap_or_else(|| "UNKNOWN".to_string()), 0));
      }
    }

    let radio = self.state.radio.lock().await;
    for d in radio.devices() {
      if let Some(st) = radio.state(&d.device_id) {
        if st.connected {
          return Ok((st.mode.clone(), 0));
        }
      }
    }
    Ok(("UNKNOWN".to_string(), 0))
  }

  async fn set_mode(&self, mode: &str, _passband: i32) -> anyhow::Result<()> {
    let rig = ensure_rig_service(&self.state).await;
    if let Ok(st) = rig.status().await {
      if st.connected {
        return rig.set_mode(mode).await;
      }
    }

    let (device_id, new_state) = {
      let mut radio = self.state.radio.lock().await;
      let device_id = radio
        .devices()
        .iter()
        .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
        .map(|d| d.device_id.clone())
        .ok_or_else(|| anyhow::anyhow!("No connected device"))?;
      let new_state = radio.set_mode(&device_id, mode)?;
      (device_id, new_state)
    };

    broadcast_json(
      &self.state,
      &RadioStateEvent {
        kind: "radio:state".to_string(),
        device_id: device_id.clone(),
        state: new_state.clone(),
      },
    )
    .await?;
    broadcast_rig_from_radio_state(&self.state, &new_state).await?;
    Ok(())
  }

  async fn get_ptt(&self) -> anyhow::Result<bool> {
    let rig = ensure_rig_service(&self.state).await;
    let st = rig.status().await?;
    Ok(st.ptt.unwrap_or(false))
  }

  async fn set_ptt(&self, enabled: bool) -> anyhow::Result<()> {
    if enabled {
      if let Some(error) = self.state.ptt_safety.key_down_error() {
        return Err(anyhow::anyhow!(error));
      }
    }
    let rig = ensure_rig_service(&self.state).await;
    if let Ok(st) = rig.status().await {
      if st.connected {
        rig.set_ptt(enabled).await?;
        track_manual_ptt(&self.state, "cat-server", enabled).await;
        return Ok(());
      }
    }

    let (device_id, new_state) = {
      let mut radio = self.state.radio.lock().await;
      let device_id = radio
        .devices()
        .iter()
        .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
        .map(|d| d.device_id.clone())
        .ok_or_else(|| anyhow::anyhow!("No connected device"))?;
      let new_state = radio.set_ptt(&device_id, enabled)?;
      (device_id, new_state)
    };

    broadcast_json(
      &self.state,
      &RadioStateEvent {
        kind: "radio:state".to_string(),
        device_id: device_id.clone(),
        state: new_state.clone(),
      },
    )
    .await?;
    broadcast_rig_from_radio_state(&self.state, &new_state).await?;
    track_manual_ptt(&self.state, "cat-server", enabled).await;
    Ok(())
  }

  async fn get_smeter(&self) -> anyhow::Result<i32> {
    // Prefer radio's synthetic dBm if present; rigctld uses integer strength.
    let radio = self.state.radio.lock().await;
    for d in radio.devices() {
      if let Some(st) = radio.state(&d.device_id) {
        if st.connected {
          if let Some(dbm) = st.signal_dbm {
            return Ok(dbm.round() as i32);
          }
        }
      }
    }
    Ok(0)
  }
}

async fn start_virtual_cat_server(
  state: &Arc<DaemonState>,
  bind: &str,
  port: u16,
) -> anyhow::Result<()> {
  let ip: IpAddr = bind.parse().map_err(|_| anyhow::anyhow!("Invalid bind address: {bind}"))?;
  let addr = SocketAddr::new(ip, port);

  {
    let integrations = state.integrations.lock().await;
    if integrations.cat_server.as_ref().is_some_and(|c| c.addr == addr) {
      return Ok(());
    }
  }

  stop_virtual_cat_server(state).await;

  let backend = Arc::new(DaemonCatBackend {
    state: Arc::clone(state),
  });
  let handle = start_cat_server(addr, backend);

  let mut integrations = state.integrations.lock().await;
  integrations.cat_server = Some(RunningCatServer { addr, handle });
  Ok(())
}

async fn stop_virtual_cat_server(state: &Arc<DaemonState>) {
  let mut integrations = state.integrations.lock().await;
  if let Some(c) = integrations.cat_server.take() {
    c.handle.abort();
  }
}

async fn start_n1mm(state: &Arc<DaemonState>, port: u16) {
  {
    let integrations = state.integrations.lock().await;
    if integrations.n1mm.as_ref().is_some_and(|n| n.port == port) {
      return;
    }
  }

  stop_n1mm(state).await;

  let stop = Arc::new(AtomicBool::new(false));
  let stop2 = Arc::clone(&stop);
  let state2 = Arc::clone(state);

  let handle = tokio::spawn(async move {
    let should_stop = move || stop2.load(Ordering::Relaxed);
    let _ = run_n1mm_listener(
      port,
      move |ev| {
        let state3 = Arc::clone(&state2);
        tokio::spawn(async move {
          match ev {
            N1mmEvent::Score(score) => {
              let msg = serde_json::json!({ "type": "n1mm:score", "score": score });
              let _ = broadcast_json(&state3, &msg).await;
            }
            N1mmEvent::Contact(contact) => {
              let msg = serde_json::json!({ "type": "n1mm:contact", "contact": contact });
              let _ = broadcast_json(&state3, &msg).await;
            }
            N1mmEvent::Unknown(raw_xml) => {
              let msg = serde_json::json!({ "type": "n1mm:unknown", "raw_xml": raw_xml });
              let _ = broadcast_json(&state3, &msg).await;
            }
          }
        });
      },
      should_stop,
    )
    .await;
  });

  let mut integrations = state.integrations.lock().await;
  integrations.n1mm = Some(RunningN1mm { port, stop, handle });
}

async fn stop_n1mm(state: &Arc<DaemonState>) {
  let mut integrations = state.integrations.lock().await;
  if let Some(n) = integrations.n1mm.take() {
    n.stop.store(true, Ordering::Relaxed);
    n.handle.abort();
  }
}

async fn maybe_broadcast_n1mm_contact(
  state: &Arc<DaemonState>,
  qso: &propulse_integrations::wsjtx::WSJTXQSOLogged,
) {
  let port = {
    let integrations = state.integrations.lock().await;
    integrations.n1mm.as_ref().map(|n| n.port)
  };
  let Some(port) = port else {
    return;
  };

  let xml = wsjtx_qso_to_n1mm_contact_xml(qso);
  tokio::spawn(async move {
    let _ = broadcast_n1mm_xml(port, &xml).await;
  });
}

fn rig_payload_from_rig_status(st: &RigStatus) -> serde_json::Value {
  let freq = st.frequency.unwrap_or(0);
  serde_json::json!({
    "connected": st.connected,
    "frequency": freq,
    "mode": st.mode.clone().unwrap_or_else(|| "UNKNOWN".to_string()),
    "band": frequency_to_band_hz(freq),
    "ptt": st.ptt,
    "catControlled": true,
    "backend": st.backend,
    "lastUpdate": now_ms(),
  })
}

fn rig_payload_from_radio_state(st: &propulse_radio::types::RadioState) -> serde_json::Value {
  let freq = st.freq;
  serde_json::json!({
    "connected": st.connected,
    "frequency": freq,
    "mode": st.mode.clone(),
    "band": frequency_to_band_hz(freq),
    "ptt": st.ptt,
    "catControlled": true,
    "backend": "radio",
    "lastUpdate": now_ms(),
  })
}

async fn broadcast_rig_from_radio_state(
  state: &Arc<DaemonState>,
  st: &propulse_radio::types::RadioState,
) -> anyhow::Result<()> {
  let payload = rig_payload_from_radio_state(st);
  let update = serde_json::json!({
    "type": "rig.update",
    "timestamp": now_ms(),
    "payload": payload,
  });
  broadcast_json(state, &update).await?;
  Ok(())
}

async fn maybe_broadcast_rig_from_radio_state(
  state: &Arc<DaemonState>,
  st: &propulse_radio::types::RadioState,
) -> anyhow::Result<()> {
  let last_status = {
    let integrations = state.integrations.lock().await;
    integrations.rig.as_ref().map(|r| Arc::clone(&r.last_status))
  };

  if let Some(last_status) = last_status {
    if last_status.lock().await.connected {
      return Ok(());
    }
  }

  broadcast_rig_from_radio_state(state, st).await
}

async fn connected_radio_snapshot(
  state: &Arc<DaemonState>,
) -> Option<(String, propulse_radio::types::RadioState)> {
  let radio = state.radio.lock().await;
  for d in radio.devices() {
    if let Some(st) = radio.state(&d.device_id) {
      if st.connected {
        return Some((d.device_id.clone(), st.clone()));
      }
    }
  }
  None
}

async fn broadcast_rig_from_status(
  state: &Arc<DaemonState>,
  st: &RigStatus,
) -> anyhow::Result<()> {
  let payload = rig_payload_from_rig_status(st);

  let status = serde_json::json!({
    "type": "rig.status",
    "timestamp": now_ms(),
    "payload": payload,
  });
  broadcast_json(state, &status).await?;

  let update = serde_json::json!({
    "type": "rig.update",
    "timestamp": now_ms(),
    "payload": payload,
  });
  broadcast_json(state, &update).await?;

  Ok(())
}

async fn subscribe(
  state: &Arc<DaemonState>,
  client_id: &str,
  kind: StreamKind,
  device_id: &str,
) {
  let mut clients = state.clients.lock().await;
  let Some(client) = clients.get_mut(client_id) else {
    return;
  };
  match kind {
    StreamKind::Fft => {
      client.fft_subs.insert(device_id.to_string());
    }
    StreamKind::Audio => {
      client.audio_subs.insert(device_id.to_string());
    }
  }
}

async fn unsubscribe(state: &Arc<DaemonState>, client_id: &str, kind: StreamKind, device_id: &str) {
  let mut clients = state.clients.lock().await;
  let Some(client) = clients.get_mut(client_id) else {
    return;
  };
  match kind {
    StreamKind::Fft => {
      client.fft_subs.remove(device_id);
    }
    StreamKind::Audio => {
      client.audio_subs.remove(device_id);
    }
  }
}

async fn subscriber_count(state: &Arc<DaemonState>, kind: StreamKind, device_id: &str) -> usize {
  let clients = state.clients.lock().await;
  clients
    .values()
    .filter(|c| match kind {
      StreamKind::Fft => c.fft_subs.contains(device_id),
      StreamKind::Audio => c.audio_subs.contains(device_id),
    })
    .count()
}

async fn ensure_soapy_reader_buffer(
  state: &Arc<DaemonState>,
  device_id: &str,
) -> Option<Arc<StdMutex<VecDeque<Complex32>>>> {
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return None;
  }

  let mut streams = state.streams.lock().await;
  let entry = streams.entry(device_id.to_string()).or_default();
  let soapy = entry.soapy.as_mut()?;

  if soapy.reader.is_none() {
    soapy.stop.store(false, Ordering::Relaxed);
    let device = soapy.device.clone();
    let stop = Arc::clone(&soapy.stop);
    let buf = Arc::clone(&soapy.buffer);
    let sample_rate = soapy.sample_rate;

    soapy.reader = Some(tokio::task::spawn_blocking(move || {
      let stream = match device.setup_rx_stream_cf32() {
        Ok(s) => s,
        Err(err) => {
          tracing::warn!(error = %err, "SoapySDR setupStream failed");
          return;
        }
      };
      if let Err(err) = stream.activate() {
        tracing::warn!(error = %err, "SoapySDR activateStream failed");
        let _ = stream.close();
        return;
      }

      // Prefer a modest chunk size to keep control responsiveness snappy.
      let chunk = 8192usize;
      let mut tmp = vec![Complex32::new(0.0, 0.0); chunk];
      let max_len = (sample_rate as usize).saturating_mul(2);

      while !stop.load(Ordering::Relaxed) {
        match stream.read_cf32(&mut tmp, 100_000) {
          Ok(0) => continue,
          Ok(n) => {
            if n == 0 {
              continue;
            }
            if let Ok(mut q) = buf.lock() {
              q.extend(tmp[..n].iter().copied());
              while q.len() > max_len {
                q.pop_front();
              }
            }
          }
          Err(err) => {
            tracing::warn!(error = %err, "SoapySDR readStream failed");
            break;
          }
        }
      }

      let _ = stream.deactivate();
      let _ = stream.close();
    }));
  }

  Some(Arc::clone(&soapy.buffer))
}

async fn ensure_sdrconnect_reader_buffer(
  state: &Arc<DaemonState>,
  device_id: &str,
) -> Option<Arc<StdMutex<VecDeque<Complex32>>>> {
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return None;
  }

  let streams = state.streams.lock().await;
  let rt = streams.get(device_id).and_then(|s| s.sdrconnect.as_ref())?;
  if let Err(err) = rt.start_streaming() {
    warn!(error = %err, "SDRconnect start failed");
  }
  Some(rt.buffer())
}

fn latest_iq_window(buf: &Arc<StdMutex<VecDeque<Complex32>>>, n: usize) -> Option<Vec<Complex32>> {
  if n == 0 {
    return Some(Vec::new());
  }
  let q = buf.lock().ok()?;
  if q.len() < n {
    return None;
  }

  let mut out = Vec::with_capacity(n);
  let (a, b) = q.as_slices();
  let total = a.len() + b.len();
  let start = total - n;
  if start < a.len() {
    out.extend_from_slice(&a[start..]);
    let remaining = n - (a.len() - start);
    if remaining > 0 {
      out.extend_from_slice(&b[..remaining]);
    }
  } else {
    let start_b = start - a.len();
    out.extend_from_slice(&b[start_b..start_b + n]);
  }
  Some(out)
}

fn consume_iq_chunk(buf: &Arc<StdMutex<VecDeque<Complex32>>>, n: usize) -> Option<Vec<Complex32>> {
  if n == 0 {
    return Some(Vec::new());
  }
  let mut q = buf.lock().ok()?;
  if q.len() < n {
    return None;
  }
  Some(q.drain(..n).collect())
}

async fn stop_soapy_device_if_any(state: &Arc<DaemonState>, device_id: &str) {
  let runtime = {
    let mut streams = state.streams.lock().await;
    streams.get_mut(device_id).and_then(|s| s.soapy.take())
  };

  let Some(mut rt) = runtime else {
    return;
  };

  rt.stop.store(true, Ordering::Relaxed);
  if let Some(h) = rt.reader.take() {
    let _ = h.await;
  }
}

async fn stop_sdrconnect_device_if_any(state: &Arc<DaemonState>, device_id: &str) {
  let runtime = {
    let mut streams = state.streams.lock().await;
    streams.get_mut(device_id).and_then(|s| s.sdrconnect.take())
  };

  let Some(rt) = runtime else {
    return;
  };

  rt.shutdown().await;
}

async fn stop_soapy_reader_if_idle(state: &Arc<DaemonState>, device_id: &str) {
  if !device_id.starts_with("soapy:") {
    return;
  }
  if subscriber_count(state, StreamKind::Fft, device_id).await > 0 {
    return;
  }
  if subscriber_count(state, StreamKind::Audio, device_id).await > 0 {
    return;
  }

  let (stop, handle, buf) = {
    let mut streams = state.streams.lock().await;
    let Some(rt) = streams.get_mut(device_id).and_then(|s| s.soapy.as_mut()) else {
      return;
    };
    (Arc::clone(&rt.stop), rt.reader.take(), Arc::clone(&rt.buffer))
  };

  stop.store(true, Ordering::Relaxed);
  if let Some(h) = handle {
    let _ = h.await;
  }
  if let Ok(mut q) = buf.lock() {
    q.clear();
  };
}

async fn maybe_apply_soapy_tune(state: &Arc<DaemonState>, device_id: &str, freq: u64) -> anyhow::Result<()> {
  if !device_id.starts_with("soapy:") {
    return Ok(());
  }
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return Ok(());
  }

  let soapy = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| s.soapy.as_ref())
      .map(|s| s.device.clone())
  };
  let Some(soapy) = soapy else {
    return Ok(());
  };

  tokio::task::spawn_blocking(move || soapy.set_frequency(freq))
    .await
    .map_err(|_| anyhow::anyhow!("Soapy tune task failed"))??;
  Ok(())
}

async fn maybe_apply_soapy_gain(
  state: &Arc<DaemonState>,
  device_id: &str,
  stage: &str,
  value: f32,
) -> anyhow::Result<()> {
  if !device_id.starts_with("soapy:") {
    return Ok(());
  }
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return Ok(());
  }

  let soapy = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| s.soapy.as_ref())
      .map(|s| s.device.clone())
  };
  let Some(soapy) = soapy else {
    return Ok(());
  };

  let stage = stage.to_string();
  tokio::task::spawn_blocking(move || soapy.set_gain_element(&stage, value))
    .await
    .map_err(|_| anyhow::anyhow!("Soapy gain task failed"))??;
  Ok(())
}

async fn maybe_apply_soapy_antenna(state: &Arc<DaemonState>, device_id: &str, port: &str) -> anyhow::Result<()> {
  if !device_id.starts_with("soapy:") {
    return Ok(());
  }
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return Ok(());
  }

  let soapy = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| s.soapy.as_ref())
      .map(|s| s.device.clone())
  };
  let Some(soapy) = soapy else {
    return Ok(());
  };

  let port = port.to_string();
  tokio::task::spawn_blocking(move || soapy.set_antenna(&port))
    .await
    .map_err(|_| anyhow::anyhow!("Soapy antenna task failed"))??;
  Ok(())
}

async fn maybe_apply_sdrconnect_tune(
  state: &Arc<DaemonState>,
  device_id: &str,
  freq: u64,
) -> anyhow::Result<()> {
  if !device_id.starts_with("sdrconnect:") {
    return Ok(());
  }
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return Ok(());
  }

  let res = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| s.sdrconnect.as_ref())
      .map(|rt| rt.set_center_frequency(freq))
  };
  if let Some(r) = res {
    r?;
  }
  Ok(())
}

async fn maybe_apply_sdrconnect_gain(
  state: &Arc<DaemonState>,
  device_id: &str,
  stage: &str,
  value: f32,
) -> anyhow::Result<()> {
  if !device_id.starts_with("sdrconnect:") {
    return Ok(());
  }
  if stage.to_uppercase() != "GAIN" {
    return Ok(());
  }
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return Ok(());
  }

  let res = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| s.sdrconnect.as_ref())
      .map(|rt| rt.set_gain(value))
  };
  if let Some(r) = res {
    r?;
  }
  Ok(())
}

async fn maybe_apply_sdrconnect_squelch(
  state: &Arc<DaemonState>,
  device_id: &str,
  level: f32,
) -> anyhow::Result<()> {
  if !device_id.starts_with("sdrconnect:") {
    return Ok(());
  }
  let connected = {
    let radio = state.radio.lock().await;
    radio.state(device_id).map(|s| s.connected).unwrap_or(false)
  };
  if !connected {
    return Ok(());
  }

  let res = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| s.sdrconnect.as_ref())
      .map(|rt| rt.set_squelch(level))
  };
  if let Some(r) = res {
    r?;
  }
  Ok(())
}

async fn ensure_fft_stream(
  state: &Arc<DaemonState>,
  device_id: &str,
  fft_size: usize,
  fps: u32,
  averaging: usize,
) {
  let already_running = {
    let streams = state.streams.lock().await;
    streams.get(device_id).and_then(|s| s.fft.as_ref()).is_some()
  };
  if already_running {
    return;
  }

  let device_id = device_id.to_string();
  let state2 = Arc::clone(state);
  let device_id2 = device_id.clone();

  let pipeline = ensure_pipeline(&state2, &device_id2).await;
  {
    let mut p = pipeline.lock().await;
    p.set_fft_config(FftConfig {
      size: fft_size,
      window: WindowKind::BlackmanHarris,
      averaging: averaging.max(1).min(8),
    });
  }

  let pipeline_task = Arc::clone(&pipeline);
  let handle = tokio::spawn(async move {
    let tick_ms = (1000.0 / (fps.max(1) as f64)).round() as u64;
    let mut interval = tokio::time::interval(Duration::from_millis(tick_ms.max(10)));
    let started = Instant::now();
    let iq_rate = {
      pipeline_task.lock().await.config().iq_sample_rate
    };
    let mut iq_buf: Option<Arc<StdMutex<VecDeque<Complex32>>>> = None;

    loop {
      interval.tick().await;

      // Stop if nobody is subscribed anymore
      if subscriber_count(&state2, StreamKind::Fft, &device_id2).await == 0 {
        break;
      }

      let t = started.elapsed().as_secs_f32();

      let (center, mode, filter, nr, nb, agc_enabled, connected) = {
        let radio = state2.radio.lock().await;
        let st = radio.state(&device_id2).cloned();
        match st {
          Some(st) => (
            st.freq,
            st.mode,
            st.filter,
            st.nr,
            st.nb,
            st.agc,
            st.connected,
          ),
          None => (0, "USB".to_string(), None, None, None, false, false),
        }
      };
      if !connected {
        continue;
      }

      if iq_buf.is_none() && device_id2.starts_with("soapy:") {
        iq_buf = ensure_soapy_reader_buffer(&state2, &device_id2).await;
      }
      if iq_buf.is_none() && device_id2.starts_with("sdrconnect:") {
        iq_buf = ensure_sdrconnect_reader_buffer(&state2, &device_id2).await;
      }

      let iq = if let Some(buf) = iq_buf.as_ref() {
        let Some(v) = latest_iq_window(buf, fft_size) else {
          continue;
        };
        v
      } else {
        generate_dummy_iq(fft_size, iq_rate, t)
      };
      let bins = {
        let mut p = pipeline_task.lock().await;
        apply_pipeline_controls(&mut p, &mode, filter.as_ref(), nr.as_ref(), nb.as_ref(), agc_enabled);
        match p.process_fft(&iq) {
          Ok(v) => v,
          Err(_) => continue,
        }
      };

      let smeter_dbm = estimate_dbm_from_bins(&bins);
      let span = iq_rate as f64;

      let dev_idx = {
        let map = state2.device_idx_by_id.lock().await;
        *map.get(&device_id2).unwrap_or(&0)
      };

      broadcast_stream_frame(
        &state2,
        StreamKind::Fft,
        &device_id2,
        build_fft_frame(dev_idx, center as f64, span, &bins),
      )
      .await;
      // Also emit smeter at ~10 Hz (share the same loop at low fps too)
      if fps >= 10 || (started.elapsed().as_millis() % 100) < tick_ms as u128 {
        let _ = broadcast_json(
        &state2,
        &RadioSmeterEvent {
          kind: "radio:smeter".to_string(),
          device_id: device_id2.clone(),
          dbm: smeter_dbm,
        },
      )
      .await;
      }
    }
  });

  let mut streams = state.streams.lock().await;
  let entry = streams.entry(device_id).or_default();
  entry.fft = Some(handle);
}

async fn ensure_audio_stream(state: &Arc<DaemonState>, device_id: &str, sample_rate: u32) {
  let already_running = {
    let streams = state.streams.lock().await;
    streams.get(device_id).and_then(|s| s.audio.as_ref()).is_some()
  };
  if already_running {
    return;
  }

  let device_id = device_id.to_string();
  let state2 = Arc::clone(state);
  let device_id2 = device_id.clone();
  let pipeline = ensure_pipeline(&state2, &device_id2).await;
  let pipeline_task = Arc::clone(&pipeline);

  {
    let mut p = pipeline.lock().await;
    let iq_rate = p.config().iq_sample_rate;
    p.set_sample_rates(iq_rate, sample_rate);
  }

  let audio_cfg = { state.config.lock().await.audio.clone() };
  let local_out = ThreadedAudioOutput::start(&audio_cfg.output_device, sample_rate).ok();
  let vc_out = if audio_cfg.virtual_cable {
    match find_virtual_cable_device_name() {
      Ok(Some(name)) if name != audio_cfg.output_device => ThreadedAudioOutput::start(&name, sample_rate).ok(),
      _ => None,
    }
  } else {
    None
  };

  let handle = tokio::spawn(async move {
    let frame_ms = 20u64;
    let iq_rate = {
      pipeline_task.lock().await.config().iq_sample_rate
    };
    let iq_frame = (iq_rate as u64 * frame_ms / 1000).max(1024) as usize;
    let mut interval = tokio::time::interval(Duration::from_millis(20));
    let mut iq_buf: Option<Arc<StdMutex<VecDeque<Complex32>>>> = None;

    loop {
      interval.tick().await;

      if subscriber_count(&state2, StreamKind::Audio, &device_id2).await == 0 {
        break;
      }

      let connected = {
        let radio = state2.radio.lock().await;
        radio.state(&device_id2).map(|s| s.connected).unwrap_or(false)
      };
      if !connected {
        continue;
      }

      let (mode, filter, nr, nb, agc_enabled) = {
        let radio = state2.radio.lock().await;
        let st = radio.state(&device_id2).cloned();
        match st {
          Some(st) => (st.mode, st.filter, st.nr, st.nb, st.agc),
          None => ("USB".to_string(), None, None, None, false),
        }
      };

      if iq_buf.is_none() && device_id2.starts_with("soapy:") {
        iq_buf = ensure_soapy_reader_buffer(&state2, &device_id2).await;
      }
      if iq_buf.is_none() && device_id2.starts_with("sdrconnect:") {
        iq_buf = ensure_sdrconnect_reader_buffer(&state2, &device_id2).await;
      }

      let iq = if let Some(buf) = iq_buf.as_ref() {
        let Some(v) = consume_iq_chunk(buf, iq_frame) else {
          continue;
        };
        v
      } else {
        generate_dummy_iq(iq_frame, iq_rate, 0.0)
      };
      let samples = {
        let mut p = pipeline_task.lock().await;
        apply_pipeline_controls(&mut p, &mode, filter.as_ref(), nr.as_ref(), nb.as_ref(), agc_enabled);
        p.process_audio_i16(&iq)
      };

      let dev_idx = {
        let map = state2.device_idx_by_id.lock().await;
        *map.get(&device_id2).unwrap_or(&0)
      };

      broadcast_stream_frame(
        &state2,
        StreamKind::Audio,
        &device_id2,
        build_audio_frame(dev_idx, sample_rate, &samples),
      )
      .await;

      if let Some(out) = local_out.as_ref() {
        out.push_pcm_i16(&samples);
      }
      if let Some(out) = vc_out.as_ref() {
        out.push_pcm_i16(&samples);
      }
    }
  });

  let mut streams = state.streams.lock().await;
  let entry = streams.entry(device_id).or_default();
  entry.audio = Some(handle);
}

async fn ensure_pipeline(state: &Arc<DaemonState>, device_id: &str) -> Arc<Mutex<DspPipeline>> {
  let existing = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| s.dsp.as_ref())
      .cloned()
  };
  if let Some(p) = existing {
    return p;
  }

  let iq_sample_rate = {
    let streams = state.streams.lock().await;
    streams
      .get(device_id)
      .and_then(|s| {
        s.soapy.as_ref().map(|s| s.sample_rate).or_else(|| {
          s.sdrconnect.as_ref().map(|s| s.sample_rate())
        })
      })
      .unwrap_or(2_048_000)
  };
  let audio_sample_rate = { state.config.lock().await.dsp.default_audio_rate };

  let cfg = PipelineConfig {
    iq_sample_rate,
    audio_sample_rate,
    ..PipelineConfig::default()
  };
  let p = Arc::new(Mutex::new(DspPipeline::new(cfg)));

  let mut streams = state.streams.lock().await;
  let entry = streams.entry(device_id.to_string()).or_default();
  entry.dsp = Some(Arc::clone(&p));
  p
}

fn generate_dummy_iq(n: usize, sample_rate: u32, t: f32) -> Vec<Complex32> {
  let sr = sample_rate as f32;
  let mut out = Vec::with_capacity(n);

  // A few moving tones within the baseband.
  let tones = [
    (12_000.0, 0.60),
    (28_000.0 + 400.0 * (t * 0.5).sin(), 0.35),
    (-55_000.0 + 600.0 * (t * 0.3).cos(), 0.25),
  ];

  let mut rng: u32 = (t.to_bits() ^ 0x9e37_79b9) as u32;
  for i in 0..n {
    let n_f = i as f32;
    let mut re = 0.0f32;
    let mut im = 0.0f32;
    for (f, a) in tones {
      let ph = std::f32::consts::TAU * (f / sr) * n_f;
      re += a as f32 * ph.cos();
      im += a as f32 * ph.sin();
    }
    // light noise
    rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
    let noise = ((rng >> 8) as f32 / (u32::MAX as f32) - 0.5) * 0.02;
    out.push(Complex32::new(re + noise, im - noise));
  }
  out
}

fn estimate_dbm_from_bins(bins_db: &[f32]) -> f32 {
  // Rough synthetic "S-meter" derived from average bin power.
  if bins_db.is_empty() {
    return -120.0;
  }
  let avg = bins_db.iter().copied().sum::<f32>() / (bins_db.len() as f32);
  // Map dBFS-ish to dBm-ish for UI
  (avg - 30.0).clamp(-140.0, -10.0)
}

async fn apply_radio_state_to_active_pipeline(
  state: &Arc<DaemonState>,
  device_id: &str,
  radio_state: &propulse_radio::types::RadioState,
) {
  let pipeline = {
    let streams = state.streams.lock().await;
    streams.get(device_id).and_then(|runtime| runtime.dsp.clone())
  };
  let Some(pipeline) = pipeline else {
    return;
  };
  let mut pipeline = pipeline.lock().await;
  apply_pipeline_controls(
    &mut pipeline,
    &radio_state.mode,
    radio_state.filter.as_ref(),
    radio_state.nr.as_ref(),
    radio_state.nb.as_ref(),
    radio_state.agc,
  );
}

fn apply_pipeline_controls(
  p: &mut DspPipeline,
  mode: &str,
  filter: Option<&propulse_radio::types::RadioFilter>,
  nr: Option<&propulse_radio::types::RadioNr>,
  nb: Option<&propulse_radio::types::RadioNb>,
  agc_enabled: bool,
) {
  let dm = match mode.to_uppercase().as_str() {
    "LSB" => DemodMode::Lsb,
    "CW" => DemodMode::Cw,
    "AM" => DemodMode::Am,
    "FM" => DemodMode::Fm,
    _ => DemodMode::Usb,
  };
  p.set_mode(dm);
  if let Some(f) = filter {
    p.set_filter(f.low as f32, f.high as f32);
  }
  if let Some(nr) = nr {
    p.set_nr(nr.enabled, nr.level);
  }
  if let Some(nb) = nb {
    p.set_nb(nb.enabled, nb.threshold.unwrap_or(0) as f32 / 100.0);
  }
  p.set_agc(if agc_enabled {
    propulse_dsp::agc::AgcMode::Medium
  } else {
    propulse_dsp::agc::AgcMode::Off
  });
}

async fn stop_stream_if_no_subscribers(
  state: &Arc<DaemonState>,
  kind: StreamKind,
  device_id: &str,
) {
  if subscriber_count(state, kind, device_id).await > 0 {
    return;
  }

  let mut streams = state.streams.lock().await;
  if let Some(dev) = streams.get_mut(device_id) {
    match kind {
      StreamKind::Fft => {
        if let Some(h) = dev.fft.take() {
          h.abort();
        }
      }
      StreamKind::Audio => {
        if let Some(h) = dev.audio.take() {
          h.abort();
        }
      }
    }
  }

  drop(streams);
  stop_soapy_reader_if_idle(state, device_id).await;
}

async fn validate_stream_start(
  state: &Arc<DaemonState>,
  device_id: &str,
  kind: StreamKind,
) -> anyhow::Result<()> {
  let radio = state.radio.lock().await;
  let device = radio
    .device(device_id)
    .ok_or_else(|| anyhow::anyhow!("Device not found: {device_id}"))?;
  let connected = radio
    .state(device_id)
    .is_some_and(|radio_state| radio_state.connected);
  if !connected {
    return Err(anyhow::anyhow!("Device is not connected: {device_id}"));
  }
  let supported = match kind {
    StreamKind::Fft => device.capabilities.can_stream_fft,
    StreamKind::Audio => device.capabilities.can_stream_audio,
  };
  if !supported {
    return Err(anyhow::anyhow!("Requested stream is not supported by {device_id}"));
  }
  Ok(())
}

async fn stop_device_streams_if_any(state: &Arc<DaemonState>, device_id: &str) {
  let mut streams = state.streams.lock().await;
  if let Some(dev) = streams.get_mut(device_id) {
    if let Some(h) = dev.fft.take() {
      h.abort();
    }
    if let Some(h) = dev.audio.take() {
      h.abort();
    }
  }
}

async fn remove_client_and_cleanup(state: &Arc<DaemonState>, client_id: &str) {
  let removed = {
    let mut clients = state.clients.lock().await;
    clients.remove(client_id)
  };

  let Some(removed) = removed else {
    return;
  };

  let owns_ptt = state.ptt_safety.is_owned_by(client_id).await;
  if owns_ptt {
    release_all_ptt(state, "PTT owner disconnected").await;
  }

  // If this client was the last subscriber for any stream, stop the stream.
  for device_id in removed.fft_subs {
    stop_stream_if_no_subscribers(state, StreamKind::Fft, &device_id).await;
  }
  for device_id in removed.audio_subs {
    stop_stream_if_no_subscribers(state, StreamKind::Audio, &device_id).await;
  }
}

async fn build_status(state: &Arc<DaemonState>) -> DaemonStatusEvent {
  let uptime_secs = state.started_at.elapsed().as_secs();
  let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);

  let connected_radios = {
    let radio = state.radio.lock().await;
    radio
      .devices()
      .iter()
      .filter_map(|d| radio.state(&d.device_id))
      .filter(|s| s.connected)
      .count()
  };

  let active_streams = {
    let streams = state.streams.lock().await;
    streams
      .values()
      .map(|s| usize::from(s.fft.is_some()) + usize::from(s.audio.is_some()))
      .sum()
  };

  let mut sys = System::new();
  sys.refresh_cpu_usage();
  sys.refresh_memory();
  let cpu_percent = sys.global_cpu_usage();
  let memory_mb = sys.used_memory() / 1024 / 1024;

  DaemonStatusEvent {
    kind: "daemon:status".to_string(),
    version: env!("CARGO_PKG_VERSION").to_string(),
    uptime_secs,
    platform,
    connected_radios,
    active_streams,
    cpu_percent,
    memory_mb,
  }
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn frequency_to_band_hz(freq_hz: u64) -> String {
  let mhz = (freq_hz as f64) / 1_000_000.0;

  if (1.8..=2.0).contains(&mhz) {
    return "160m".to_string();
  }
  if (3.5..=4.0).contains(&mhz) {
    return "80m".to_string();
  }
  if (5.3..=5.4).contains(&mhz) {
    return "60m".to_string();
  }
  if (7.0..=7.3).contains(&mhz) {
    return "40m".to_string();
  }
  if (10.1..=10.15).contains(&mhz) {
    return "30m".to_string();
  }
  if (14.0..=14.35).contains(&mhz) {
    return "20m".to_string();
  }
  if (18.068..=18.168).contains(&mhz) {
    return "17m".to_string();
  }
  if (21.0..=21.45).contains(&mhz) {
    return "15m".to_string();
  }
  if (24.89..=24.99).contains(&mhz) {
    return "12m".to_string();
  }
  if (28.0..=29.7).contains(&mhz) {
    return "10m".to_string();
  }
  if (50.0..=54.0).contains(&mhz) {
    return "6m".to_string();
  }
  if (144.0..=148.0).contains(&mhz) {
    return "2m".to_string();
  }
  if (420.0..=450.0).contains(&mhz) {
    return "70cm".to_string();
  }

  "?".to_string()
}

async fn handle_bridge_message(
  state: &Arc<DaemonState>,
  client_id: &str,
  msg: &serde_json::Value,
) -> anyhow::Result<()> {
  let Some(msg_type) = msg.get("type").and_then(|v| v.as_str()) else {
    return Ok(());
  };
  let msg_id = msg.get("id").and_then(|v| v.as_str());
  let payload = msg.get("payload").cloned().unwrap_or(serde_json::Value::Null);

  match msg_type {
    "hello" => {
      let presented = payload
        .get("auth_token")
        .and_then(|value| value.as_str())
        .unwrap_or("");
      let valid = state
        .auth_token
        .as_deref()
        .is_none_or(|expected| presented == expected);
      {
        let mut clients = state.clients.lock().await;
        if let Some(client) = clients.get_mut(client_id) {
          client.authenticated = valid;
        }
      }
      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        valid,
        if valid {
          serde_json::json!({ "authenticated": true })
        } else {
          serde_json::json!({ "message": "Invalid token" })
        },
      )
      .await?;
    }

    "bridge.ping" => {
      send_bridge_envelope(
        state,
        client_id,
        msg_id,
        "bridge.pong",
        serde_json::json!({ "timestamp": now_ms() }),
      )
      .await?;
    }

    "bridge.subscribe" | "bridge.unsubscribe" => {
      send_bridge_ack(state, client_id, msg_id, msg_type, true, serde_json::json!({})).await?;
    }

    "devices:scan" => {
      send_bridge_envelope(
        state,
        client_id,
        msg_id,
        "error",
        serde_json::json!({
          "code": "DEVICE_SCAN_UNSUPPORTED",
          "message": "ICOM USB probing is provided by the Node bridge; the Rust daemon cannot identify CI-V radios from serial metadata alone",
        }),
      )
      .await?;
    }

    "safety.configure" => {
      let lockout = payload
        .get("ptt_lockout")
        .or_else(|| payload.get("pttLockout"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
      configure_ptt_safety(state, lockout).await;
      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        true,
        serde_json::json!({ "pttLockout": lockout }),
      )
      .await?;
    }

    "rig.connect" => {
      let requested = payload
        .get("backend")
        .and_then(|value| value.as_str())
        .unwrap_or("auto")
        .to_lowercase();
      let backend = match requested.as_str() {
        "auto" => RigBackendKind::Auto,
        "hamlib" => RigBackendKind::Hamlib,
        "flrig" => RigBackendKind::Flrig,
        "icom-serial" | "icom-network" => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_CONNECT_UNSUPPORTED",
              "message": format!("{requested} control is provided by the Node bridge, not the Rust daemon"),
            }),
          )
          .await?;
          return Ok(());
        }
        _ => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_CONNECT_INVALID_BACKEND",
              "message": format!("Unknown rig backend: {requested}"),
            }),
          )
          .await?;
          return Ok(());
        }
      };
      let host = payload
        .get("host")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
      let port = payload
        .get("port")
        .and_then(|value| value.as_u64())
        .and_then(|value| u16::try_from(value).ok());
      let rig = ensure_rig_service(state).await;
      let cfg = RigConnectConfig {
        backend,
        host,
        port,
        poll_interval_ms: Some(200),
      };
      match rig.connect(cfg).await {
        Ok(st) if st.connected => {
          send_bridge_ack(
            state,
            client_id,
            msg_id,
            msg_type,
            true,
            serde_json::json!({ "backend": st.backend }),
          )
          .await?;
          broadcast_rig_from_status(state, &st).await?;
        }
        Ok(st) => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_CONNECT_FAILED",
              "message": format!("No {requested} backend responded"),
            }),
          )
          .await?;
          broadcast_rig_from_status(state, &st).await?;
        }
        Err(err) => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_CONNECT_FAILED",
              "message": err.to_string(),
            }),
          )
          .await?;
        }
      }
    }

    "rig.disconnect" => {
      release_all_ptt(state, "rig disconnect").await;
      let rig = ensure_rig_service(state).await;
      let st = rig.disconnect().await.unwrap_or(RigStatus {
        connected: false,
        frequency: None,
        mode: None,
        ptt: None,
        backend: Some("none".to_string()),
      });
      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        true,
        serde_json::json!({ "stopped": true }),
      )
      .await?;
      broadcast_rig_from_status(state, &st).await?;
    }

    "rig:test" | "rig.test" => {
      let requested = payload
        .get("backend")
        .and_then(|value| value.as_str())
        .unwrap_or("auto")
        .to_lowercase();
      let backend = match requested.as_str() {
        "auto" => RigBackendKind::Auto,
        "hamlib" => RigBackendKind::Hamlib,
        "flrig" => RigBackendKind::Flrig,
        "icom-serial" | "icom-network" => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_TEST_UNSUPPORTED",
              "message": format!("{requested} testing is not implemented by the Rust daemon"),
            }),
          )
          .await?;
          return Ok(());
        }
        _ => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_TEST_INVALID_BACKEND",
              "message": format!("Unknown rig backend: {requested}"),
            }),
          )
          .await?;
          return Ok(());
        }
      };
      let host = payload
        .get("host")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
      let port = payload
        .get("port")
        .and_then(|value| value.as_u64())
        .and_then(|value| u16::try_from(value).ok());
      let (probe, handle) = RigService::start(|_| {});
      let result = probe
        .connect(RigConnectConfig {
          backend,
          host,
          port,
          poll_interval_ms: Some(200),
        })
        .await;

      match result {
        Ok(status) if status.connected => {
          let resolved = status.backend.clone().unwrap_or_else(|| "none".to_string());
          if requested != "auto" && resolved != requested {
            send_bridge_envelope(
              state,
              client_id,
              msg_id,
              "error",
              serde_json::json!({
                "code": "RIG_TEST_WRONG_BACKEND",
                "message": format!("Requested {requested}, but only {resolved} responded"),
              }),
            )
            .await?;
          } else {
            let ack_type = format!("{msg_type}.ack");
            send_bridge_envelope(
              state,
              client_id,
              msg_id,
              &ack_type,
              serde_json::json!({
                "success": true,
                "connected": true,
                "backend": resolved,
                "frequency": status.frequency,
                "mode": status.mode,
                "hasSpectrum": false,
                "hasAudio": false,
              }),
            )
            .await?;
          }
          let _ = probe.disconnect().await;
        }
        Ok(_) => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_TEST_FAILED",
              "message": format!("No {requested} backend responded"),
            }),
          )
          .await?;
        }
        Err(err) => {
          send_bridge_envelope(
            state,
            client_id,
            msg_id,
            "error",
            serde_json::json!({
              "code": "RIG_TEST_FAILED",
              "message": err.to_string(),
            }),
          )
          .await?;
        }
      }
      handle.abort();
    }

    "rig.status" => {
      let rig = ensure_rig_service(state).await;
      let st = rig.status().await.unwrap_or(RigStatus {
        connected: false,
        frequency: None,
        mode: None,
        ptt: None,
        backend: Some("none".to_string()),
      });

      // Send to the requesting client only (legacy expects rig.update).
      if st.connected {
      send_bridge_envelope(
        state,
        client_id,
        msg_id,
        "rig.update",
        rig_payload_from_rig_status(&st),
      )
      .await?;
      } else if let Some((_dev_id, radio_st)) = connected_radio_snapshot(state).await {
        send_bridge_envelope(
          state,
          client_id,
          msg_id,
          "rig.update",
          rig_payload_from_radio_state(&radio_st),
        )
        .await?;
      } else {
        send_bridge_envelope(
          state,
          client_id,
          msg_id,
          "rig.update",
          serde_json::json!({
            "connected": false,
            "frequency": 0,
            "mode": "UNKNOWN",
            "band": "?",
            "ptt": false,
            "catControlled": false,
            "backend": "none",
            "lastUpdate": now_ms(),
          }),
        )
        .await?;
      }
    }

    "rig.setFrequency" => {
      let freq = payload.get("frequency").and_then(|v| v.as_u64());
      if freq.is_none() {
        send_bridge_ack(
          state,
          client_id,
          msg_id,
          msg_type,
          false,
          serde_json::json!({ "message": "payload.frequency required" }),
        )
        .await?;
        return Ok(());
      }
      let freq = freq.unwrap();

      let rig = ensure_rig_service(state).await;
      let st = rig.status().await.unwrap_or(RigStatus {
        connected: false,
        frequency: None,
        mode: None,
        ptt: None,
        backend: Some("none".to_string()),
      });

      if st.connected {
        if let Err(err) = rig.set_frequency(freq).await {
          send_bridge_ack(
            state,
            client_id,
            msg_id,
            msg_type,
            false,
            serde_json::json!({ "message": err.to_string() }),
          )
          .await?;
          return Ok(());
        }
        send_bridge_ack(
          state,
          client_id,
          msg_id,
          msg_type,
          true,
          serde_json::json!({ "frequency": freq }),
        )
        .await?;
      } else {
        let tuned = async {
          let mut radio = state.radio.lock().await;
          let device_id = radio
            .devices()
            .iter()
            .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
            .map(|d| d.device_id.clone())
            .ok_or_else(|| anyhow::anyhow!("No connected radio"))?;
          let new_state = radio.tune(&device_id, freq)?;
          Ok::<_, anyhow::Error>((device_id, new_state))
        }
        .await;

        match tuned {
          Ok((device_id, new_state)) => {
            broadcast_json(
              state,
              &RadioStateEvent {
                kind: "radio:state".to_string(),
                device_id: device_id.clone(),
                state: new_state.clone(),
              },
            )
            .await?;
            broadcast_rig_from_radio_state(state, &new_state).await?;
            send_bridge_ack(
              state,
              client_id,
              msg_id,
              msg_type,
              true,
              serde_json::json!({ "frequency": freq }),
            )
            .await?;
          }
          Err(err) => {
            send_bridge_ack(
              state,
              client_id,
              msg_id,
              msg_type,
              false,
              serde_json::json!({ "message": err.to_string() }),
            )
            .await?;
          }
        }
      }
    }

    "rig.setMode" => {
      let mode = payload.get("mode").and_then(|v| v.as_str());
      if mode.is_none() {
        send_bridge_ack(
          state,
          client_id,
          msg_id,
          msg_type,
          false,
          serde_json::json!({ "message": "payload.mode required" }),
        )
        .await?;
        return Ok(());
      }
      let mode = mode.unwrap();
      let rig = ensure_rig_service(state).await;
      let st = rig.status().await.unwrap_or(RigStatus {
        connected: false,
        frequency: None,
        mode: None,
        ptt: None,
        backend: Some("none".to_string()),
      });

      if st.connected {
        if let Err(err) = rig.set_mode(mode).await {
          send_bridge_ack(
            state,
            client_id,
            msg_id,
            msg_type,
            false,
            serde_json::json!({ "message": err.to_string() }),
          )
          .await?;
          return Ok(());
        }
        send_bridge_ack(
          state,
          client_id,
          msg_id,
          msg_type,
          true,
          serde_json::json!({ "mode": mode }),
        )
        .await?;
      } else {
        let updated = async {
          let mut radio = state.radio.lock().await;
          let device_id = radio
            .devices()
            .iter()
            .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
            .map(|d| d.device_id.clone())
            .ok_or_else(|| anyhow::anyhow!("No connected radio"))?;
          let new_state = radio.set_mode(&device_id, mode)?;
          Ok::<_, anyhow::Error>((device_id, new_state))
        }
        .await;

        match updated {
          Ok((device_id, new_state)) => {
            broadcast_json(
              state,
              &RadioStateEvent {
                kind: "radio:state".to_string(),
                device_id: device_id.clone(),
                state: new_state.clone(),
              },
            )
            .await?;
            broadcast_rig_from_radio_state(state, &new_state).await?;
            send_bridge_ack(
              state,
              client_id,
              msg_id,
              msg_type,
              true,
              serde_json::json!({ "mode": mode }),
            )
            .await?;
          }
          Err(err) => {
            send_bridge_ack(
              state,
              client_id,
              msg_id,
              msg_type,
              false,
              serde_json::json!({ "message": err.to_string() }),
            )
            .await?;
          }
        }
      }
    }

    "rig.setPTT" => {
      let enabled = payload
        .get("enabled")
        .or_else(|| payload.get("ptt"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

      if enabled {
        if let Some(error) = state.ptt_safety.key_down_error() {
          send_bridge_ack(
            state,
            client_id,
            msg_id,
            msg_type,
            false,
            serde_json::json!({ "message": error }),
          )
          .await?;
          return Ok(());
        }
      }

      let rig = ensure_rig_service(state).await;
      let st = rig.status().await.unwrap_or(RigStatus {
        connected: false,
        frequency: None,
        mode: None,
        ptt: None,
        backend: Some("none".to_string()),
      });

      if st.connected {
        if let Err(err) = rig.set_ptt(enabled).await {
          send_bridge_ack(
            state,
            client_id,
            msg_id,
            msg_type,
            false,
            serde_json::json!({ "message": err.to_string() }),
          )
          .await?;
          return Ok(());
        }

        track_manual_ptt(state, client_id, enabled).await;

        send_bridge_ack(
          state,
          client_id,
          msg_id,
          msg_type,
          true,
          serde_json::json!({ "ptt": enabled }),
        )
        .await?;
      } else {
        let updated = async {
          let mut radio = state.radio.lock().await;
          let device_id = radio
            .devices()
            .iter()
            .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
            .map(|d| d.device_id.clone())
            .ok_or_else(|| anyhow::anyhow!("No connected radio"))?;
          let new_state = radio.set_ptt(&device_id, enabled)?;
          Ok::<_, anyhow::Error>((device_id, new_state))
        }
        .await;

        match updated {
          Ok((device_id, new_state)) => {
            track_manual_ptt(state, client_id, enabled).await;
            broadcast_json(
              state,
              &RadioStateEvent {
                kind: "radio:state".to_string(),
                device_id: device_id.clone(),
                state: new_state.clone(),
              },
            )
            .await?;
            broadcast_rig_from_radio_state(state, &new_state).await?;
            send_bridge_ack(
              state,
              client_id,
              msg_id,
              msg_type,
              true,
              serde_json::json!({ "ptt": enabled }),
            )
            .await?;
          }
          Err(err) => {
            send_bridge_ack(
              state,
              client_id,
              msg_id,
              msg_type,
              false,
              serde_json::json!({ "message": err.to_string() }),
            )
            .await?;
          }
        }
      }
    }

    "rig.set" => {
      let maybe_freq = payload.get("frequency").and_then(|v| v.as_u64());
      let maybe_mode = payload.get("mode").and_then(|v| v.as_str()).map(|s| s.to_string());

      let rig = ensure_rig_service(state).await;
      if let Some(freq) = maybe_freq {
        if let Err(err) = rig.set_frequency(freq).await {
          send_bridge_ack(
            state,
            client_id,
            msg_id,
            msg_type,
            false,
            serde_json::json!({ "message": err.to_string() }),
          )
          .await?;
          return Ok(());
        }
      }
      if let Some(mode) = maybe_mode.as_deref() {
        if let Err(err) = rig.set_mode(mode).await {
          send_bridge_ack(
            state,
            client_id,
            msg_id,
            msg_type,
            false,
            serde_json::json!({ "message": err.to_string() }),
          )
          .await?;
          return Ok(());
        }
      }

      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        true,
        serde_json::json!({ "success": true }),
      )
      .await?;
    }

    "cluster.connect" => {
      let nodes = payload.get("nodes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
      let callsign = payload.get("callsign").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let password = payload.get("password").and_then(|v| v.as_str()).map(|s| s.to_string());
      let filters = payload.get("filters").cloned();

      if callsign.trim().is_empty() || nodes.is_empty() {
        send_bridge_ack(
          state,
          client_id,
          msg_id,
          msg_type,
          false,
          serde_json::json!({ "message": "payload.nodes and payload.callsign required" }),
        )
        .await?;
        return Ok(());
      }

      for n in nodes {
        let Some(host) = n.get("host").and_then(|v| v.as_str()) else { continue; };
        let port = n.get("port").and_then(|v| v.as_u64()).unwrap_or(7300) as u16;

        let cfg = ClusterConnectConfig {
          host: host.to_string(),
          port,
          callsign: callsign.clone(),
          password: password.clone(),
          filters: parse_cluster_filters(filters.as_ref()),
        };
        start_cluster(state, cfg).await;
      }

      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        true,
        serde_json::json!({ "started": true }),
      )
      .await?;
    }

    "cluster.disconnect" => {
      stop_cluster(state, None).await;
      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        true,
        serde_json::json!({ "stopped": true }),
      )
      .await?;
    }

    "wsjtx.configure" => {
      let enabled = payload.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
      let port = payload.get("port").and_then(|v| v.as_u64()).unwrap_or(2237) as u16;
      if enabled {
        start_wsjtx(state, port).await;
      } else {
        stop_wsjtx(state).await;
      }

      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        true,
        serde_json::json!({ "configured": true }),
      )
      .await?;
    }

    _ => {
      // Stub for integrations not yet implemented in the Rust daemon.
      send_bridge_ack(
        state,
        client_id,
        msg_id,
        msg_type,
        false,
        serde_json::json!({ "message": format!("Unsupported bridge message: {msg_type}") }),
      )
      .await?;
    }
  }

  Ok(())
}

fn parse_cluster_filters(v: Option<&serde_json::Value>) -> Option<propulse_integrations::cluster::ClusterFilters> {
  let Some(v) = v else { return None; };

  let bands = v
    .get("bands")
    .and_then(|b| b.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|x| x.as_u64().map(|n| n as u32))
        .collect::<Vec<_>>()
    });

  let modes = v
    .get("modes")
    .and_then(|b| b.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.to_string()))
        .collect::<Vec<_>>()
    });

  let min_snr = v.get("minSNR").and_then(|x| x.as_i64()).map(|n| n as i32);

  Some(propulse_integrations::cluster::ClusterFilters {
    bands,
    modes,
    min_snr,
  })
}

async fn send_bridge_envelope(
  state: &Arc<DaemonState>,
  client_id: &str,
  msg_id: Option<&str>,
  msg_type: &str,
  payload: serde_json::Value,
) -> anyhow::Result<()> {
  let mut out = serde_json::json!({
    "type": msg_type,
    "timestamp": now_ms(),
    "payload": payload,
  });
  if let Some(id) = msg_id {
    out["id"] = serde_json::Value::String(id.to_string());
  }
  send_json(state, client_id, &out).await
}

async fn send_bridge_ack(
  state: &Arc<DaemonState>,
  client_id: &str,
  msg_id: Option<&str>,
  msg_type: &str,
  ok: bool,
  extra: serde_json::Value,
) -> anyhow::Result<()> {
  if !ok {
    return send_bridge_envelope(state, client_id, msg_id, "error", extra).await;
  }
  let payload = serde_json::json!({ "ok": true, "received": true, "data": extra });
  send_bridge_envelope(
    state,
    client_id,
    msg_id,
    &format!("{msg_type}.ack"),
    payload,
  )
  .await
}

fn rig_payload_from_state(st: &propulse_radio::types::RadioState) -> serde_json::Value {
  serde_json::json!({
    "connected": st.connected,
    "frequency": st.freq,
    "mode": st.mode,
    "band": frequency_to_band_hz(st.freq),
    "catControlled": true,
    "lastUpdate": now_ms(),
  })
}

async fn broadcast_rig_update(state: &Arc<DaemonState>, st: &propulse_radio::types::RadioState) -> anyhow::Result<()> {
  let msg = serde_json::json!({
    "type": "rig.update",
    "timestamp": now_ms(),
    "payload": rig_payload_from_state(st),
  });
  broadcast_json(state, &msg).await
}

#[cfg(test)]
mod tests {
  use super::PttSafetyState;

  #[tokio::test]
  async fn failed_release_state_retains_owner_and_blocks_rekey() {
    let safety = PttSafetyState::default();
    safety.track_manual("client-a", true).await;

    let release_generation = safety.begin_release();
    assert_eq!(
      safety.key_down_error(),
      Some("PTT release is pending after a hardware error")
    );
    assert_eq!(safety.owner.lock().await.as_deref(), Some("client-a"));

    // A failed hardware attempt deliberately does not complete the release.
    assert!(safety.generation_is(release_generation));
    assert_eq!(safety.owner.lock().await.as_deref(), Some("client-a"));

    assert!(safety.complete_release(release_generation).await);
    assert_eq!(safety.owner.lock().await.as_deref(), None);
    assert_eq!(safety.key_down_error(), None);
  }

  #[tokio::test]
  async fn stale_release_cannot_clear_a_new_owner() {
    let safety = PttSafetyState::default();
    safety.track_manual("client-a", true).await;
    let stale_release = safety.begin_release();

    safety.track_manual("client-b", true).await;

    assert!(!safety.complete_release(stale_release).await);
    assert_eq!(safety.owner.lock().await.as_deref(), Some("client-b"));
  }
}
