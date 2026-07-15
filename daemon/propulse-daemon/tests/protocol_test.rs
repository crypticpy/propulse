use std::net::TcpListener;
use std::path::PathBuf;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::oneshot;
use tokio_tungstenite::tungstenite::Message;

use propulse_daemon::config::{AppConfig, Cli};

fn pick_free_port() -> u16 {
  let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
  listener.local_addr().expect("local_addr").port()
}

async fn connect_with_retry(url: &str) -> anyhow::Result<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>> {
  for _ in 0..50 {
    match tokio_tungstenite::connect_async(url).await {
      Ok((ws, _)) => return Ok(ws),
      Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
    }
  }
  anyhow::bail!("Failed to connect to daemon: {url}");
}

async fn next_json(
  ws: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
) -> anyhow::Result<serde_json::Value> {
  while let Some(msg) = ws.next().await {
    let msg = msg?;
    if let Message::Text(text) = msg {
      return Ok(serde_json::from_str(&text)?);
    }
  }
  anyhow::bail!("WebSocket closed");
}

async fn response_for(
  ws: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
  expected_id: &str,
) -> anyhow::Result<serde_json::Value> {
  tokio::time::timeout(Duration::from_secs(3), async {
    loop {
      let message = next_json(ws).await?;
      if message.get("type").and_then(|value| value.as_str()) == Some("response")
        && message.get("id").and_then(|value| value.as_str()) == Some(expected_id)
      {
        return Ok(message);
      }
    }
  })
  .await
  .map_err(|_| anyhow::anyhow!("Timed out waiting for response {expected_id}"))?
}

#[tokio::test]
async fn protocol_lifecycle_dummy_radio() -> anyhow::Result<()> {
  let port = pick_free_port();
  let url = format!("ws://127.0.0.1:{port}");

  let mut config = AppConfig::default();
  config.server.bind = "127.0.0.1".to_string();
  config.server.port = port;
  config.radio.dummy_enabled = true;

  let cli = Cli {
    config: None,
    bind: None,
    port: Some(port),
    localhost_only: true,
    auth_token: None,
    compat_bridge: true,
    log_level: None,
    log_file: None,
  };

  let config_path = PathBuf::from(format!("/tmp/propulse-daemon-test-{port}.toml"));
  let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

  let server_task = tokio::spawn(async move {
    propulse_daemon::server::run_until_shutdown(
      config,
      cli,
      config_path,
      async move {
        let _ = shutdown_rx.await;
      },
    )
    .await
  });

  let mut ws = connect_with_retry(&url).await?;

  // Server hello
  let hello = next_json(&mut ws).await?;
  assert_eq!(hello.get("type").and_then(|v| v.as_str()), Some("hello"));
  assert_eq!(hello.get("version").and_then(|v| v.as_str()), Some("1.1.0"));
  let features = hello
    .get("features")
    .and_then(|value| value.as_array())
    .expect("hello features");
  assert!(features.iter().any(|value| value.as_str() == Some("command-capabilities")));

  // Enumerate
  ws.send(Message::Text(r#"{"id":"1","type":"devices:enumerate"}"#.into()))
    .await?;

  // Expect response + devices:list (order not guaranteed)
  let mut devices: Option<Vec<serde_json::Value>> = None;
  for _ in 0..5 {
    let m = next_json(&mut ws).await?;
    match m.get("type").and_then(|v| v.as_str()) {
      Some("devices:list") => {
        devices = m
          .get("devices")
          .and_then(|v| v.as_array())
          .map(|arr| arr.to_vec());
        break;
      }
      _ => continue,
    }
  }
  let devices = devices.expect("devices:list");
  assert!(!devices.is_empty(), "expected at least one device (dummy)");
  let capabilities = devices[0]
    .get("capabilities")
    .expect("device capabilities");
  assert_eq!(
    capabilities
      .get("commands")
      .and_then(|value| value.get("ptt"))
      .and_then(|value| value.as_bool()),
    Some(false),
  );
  let device_id = devices[0]
    .get("device_id")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  assert!(!device_id.is_empty());

  // Connect
  ws.send(Message::Text(
    serde_json::json!({ "id": "2", "type": "radio:connect", "device_id": device_id }).to_string(),
  ))
  .await?;

  // Wait for radio:state
  let mut connected = false;
  for _ in 0..10 {
    let m = next_json(&mut ws).await?;
    if m.get("type").and_then(|v| v.as_str()) == Some("radio:state") {
      connected = m
        .get("state")
        .and_then(|s| s.get("connected"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      break;
    }
  }
  assert!(connected, "expected radio to connect");

  // Safety lockout must reject transmit before backend capability handling.
  ws.send(Message::Text(
    serde_json::json!({ "id": "safety-on", "type": "safety:configure", "ptt_lockout": true }).to_string(),
  ))
  .await?;
  assert_eq!(
    response_for(&mut ws, "safety-on")
      .await?
      .get("success")
      .and_then(|value| value.as_bool()),
    Some(true),
  );

  ws.send(Message::Text(
    serde_json::json!({ "id": "ptt-blocked", "type": "radio:ptt", "device_id": device_id, "active": true }).to_string(),
  ))
  .await?;
  let blocked = response_for(&mut ws, "ptt-blocked").await?;
  assert_eq!(blocked.get("success").and_then(|value| value.as_bool()), Some(false));
  assert!(blocked
    .get("error")
    .and_then(|value| value.as_str())
    .is_some_and(|message| message.contains("lockout")));

  ws.send(Message::Text(
    serde_json::json!({ "id": "safety-off", "type": "safety:configure", "ptt_lockout": false }).to_string(),
  ))
  .await?;
  let _ = response_for(&mut ws, "safety-off").await?;

  // Start FFT stream
  ws.send(Message::Text(
    serde_json::json!({ "id": "3", "type": "stream:fft:start", "device_id": device_id, "fft_size": 1024, "fps": 10, "averaging": 1 }).to_string(),
  ))
  .await?;

  // Expect a binary FFT frame
  let mut got_fft = false;
  for _ in 0..50 {
    if let Some(msg) = ws.next().await {
      match msg? {
        Message::Binary(bin) => {
          if bin.first().copied() == Some(0x01) {
            got_fft = true;
            break;
          }
        }
        _ => {}
      }
    }
  }
  assert!(got_fft, "expected at least one FFT binary frame");

  // Disconnect
  ws.send(Message::Text(
    serde_json::json!({ "id": "4", "type": "radio:disconnect", "device_id": device_id }).to_string(),
  ))
  .await?;

  let _ = shutdown_tx.send(());
  let _ = server_task.await?;
  Ok(())
}
