use std::{
  net::{IpAddr, SocketAddr},
  collections::{HashMap, HashSet},
  path::PathBuf,
  sync::atomic::{AtomicBool, Ordering},
  sync::Arc,
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

use crate::config::{AppConfig, Cli};
use crate::protocol::{
  build_audio_frame, build_fft_frame, DaemonStatusEvent, DevicesList, Hello,
  PROTOCOL_VERSION, RadioSmeterEvent, RadioStateEvent, Response,
};

use propulse_radio::manager::RadioManager;
use sysinfo::System;

use propulse_integrations::{
  cat_server::{start_cat_server, CatBackend},
  cluster::{ClusterClient, ClusterConnectConfig, ClusterEvent},
  n1mm::{broadcast_n1mm_xml, run_n1mm_listener, wsjtx_qso_to_n1mm_contact_xml, N1mmEvent},
  rig::{RigBackendKind, RigConnectConfig, RigService, RigStatus},
  wsjtx::{run_wsjtx_listener, WSJTXEvent},
};
use propulse_discovery::mdns::MdnsAdvertiser;
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
  device_idx_by_id: HashMap<String, u8>,
  clients: Mutex<HashMap<String, ClientState>>,
  streams: Mutex<HashMap<String, DeviceStreams>>,
  integrations: Mutex<IntegrationsState>,
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
    device_idx_by_id,
    clients: Mutex::new(HashMap::new()),
    streams: Mutex::new(HashMap::new()),
    integrations: Mutex::new(IntegrationsState::default()),
  });

  apply_runtime_config(&state, &effective_config).await;
  spawn_config_reload_watcher(Arc::clone(&state), config_path);

  loop {
    let (stream, remote) = listener.accept().await?;
    let state = Arc::clone(&state);
    tokio::spawn(async move {
      if let Err(err) = handle_client(stream, remote, state).await {
        warn!(error = %err, %remote, "client handler error");
      }
    });
  }
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

  // Bridge compatibility: messages that use { type, payload, ... } are treated as
  // legacy bridge messages.
  if state.compat_bridge && value.get("payload").is_some() {
    handle_bridge_message(state, client_id, &value).await?;
    return Ok(());
  }

  let Some(msg_type) = value.get("type").and_then(|v| v.as_str()) else {
    return Ok(());
  };
  let id = value.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());

  // Auth gate (if enabled)
  {
    let token_required = state.auth_token.is_some();
    if token_required {
      let mut clients = state.clients.lock().await;
      let Some(client) = clients.get_mut(client_id) else {
        return Ok(());
      };

      if !client.authenticated && msg_type != "hello" {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "Not authenticated")).await?;
        }
        return Ok(());
      }
    }
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

    "radio:connect" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };

      let mut radio = state.radio.lock().await;
      match radio.connect(device_id) {
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

    "radio:disconnect" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };

      stop_device_streams_if_any(state, device_id).await;

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

      let mut radio = state.radio.lock().await;
      match radio.set_agc(device_id, enabled) {
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

    "radio:ptt" => {
      let Some(device_id) = value.get("device_id").and_then(|v| v.as_str()) else {
        if let Some(id) = id {
          send_json(state, client_id, &Response::err(id, "device_id required")).await?;
        }
        return Ok(());
      };
      let active = value.get("active").and_then(|v| v.as_bool()).unwrap_or(false);

      let mut radio = state.radio.lock().await;
      match radio.set_ptt(device_id, active) {
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

    let mut radio = self.state.radio.lock().await;
    let device_id = radio
      .devices()
      .iter()
      .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
      .map(|d| d.device_id.clone())
      .ok_or_else(|| anyhow::anyhow!("No connected device"))?;
    let _ = radio.tune(&device_id, hz)?;
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

    let mut radio = self.state.radio.lock().await;
    let device_id = radio
      .devices()
      .iter()
      .find(|d| radio.state(&d.device_id).map(|s| s.connected).unwrap_or(false))
      .map(|d| d.device_id.clone())
      .ok_or_else(|| anyhow::anyhow!("No connected device"))?;
    let _ = radio.set_mode(&device_id, mode)?;
    Ok(())
  }

  async fn get_ptt(&self) -> anyhow::Result<bool> {
    let rig = ensure_rig_service(&self.state).await;
    let st = rig.status().await?;
    Ok(st.ptt.unwrap_or(false))
  }

  async fn set_ptt(&self, enabled: bool) -> anyhow::Result<()> {
    let rig = ensure_rig_service(&self.state).await;
    rig.set_ptt(enabled).await
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

      let iq = generate_dummy_iq(fft_size, iq_rate, t);
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
        *state2.device_idx_by_id.get(&device_id2).unwrap_or(&0)
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

      let t = 0.0f32;
      let (mode, filter, nr, nb, agc_enabled) = {
        let radio = state2.radio.lock().await;
        let st = radio.state(&device_id2).cloned();
        match st {
          Some(st) => (st.mode, st.filter, st.nr, st.nb, st.agc),
          None => ("USB".to_string(), None, None, None, false),
        }
      };

      let iq = generate_dummy_iq(iq_frame, iq_rate, t);
      let samples = {
        let mut p = pipeline_task.lock().await;
        apply_pipeline_controls(&mut p, &mode, filter.as_ref(), nr.as_ref(), nb.as_ref(), agc_enabled);
        p.process_audio_i16(&iq)
      };

      let dev_idx = {
        *state2.device_idx_by_id.get(&device_id2).unwrap_or(&0)
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

  let cfg = PipelineConfig {
    iq_sample_rate: 2_048_000,
    audio_sample_rate: 48_000,
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

    "rig.connect" => {
      let rig = ensure_rig_service(state).await;
      let cfg = RigConnectConfig {
        backend: RigBackendKind::Auto,
        host: None,
        port: None,
        poll_interval_ms: Some(200),
      };
      let st = rig.connect(cfg).await.unwrap_or(RigStatus {
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
        st.connected,
        serde_json::json!({ "backend": st.backend }),
      )
      .await?;
      broadcast_rig_from_status(state, &st).await?;
    }

    "rig.disconnect" => {
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

    "rig.test" => {
      let rig = ensure_rig_service(state).await;
      let st = rig.status().await.unwrap_or(RigStatus {
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
        st.connected,
        serde_json::json!({ "backend": st.backend }),
      )
      .await?;
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
      send_bridge_envelope(
        state,
        client_id,
        msg_id,
        "rig.update",
        rig_payload_from_rig_status(&st),
      )
      .await?;
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
    }

    "rig.setPTT" => {
      let enabled = payload
        .get("enabled")
        .or_else(|| payload.get("ptt"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

      let rig = ensure_rig_service(state).await;
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
  let payload = if ok {
    serde_json::json!({ "ok": true, "received": true, "data": extra })
  } else {
    serde_json::json!({ "ok": false, "received": true, "error": extra })
  };
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
