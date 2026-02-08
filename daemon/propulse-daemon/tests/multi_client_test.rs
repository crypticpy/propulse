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

async fn connect_with_retry(
  url: &str,
) -> anyhow::Result<
  tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
  >,
> {
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

#[tokio::test]
async fn multi_client_receives_broadcast_and_fft_frames() -> anyhow::Result<()> {
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

  let mut ws1 = connect_with_retry(&url).await?;
  let mut ws2 = connect_with_retry(&url).await?;

  // Drain hello messages
  let hello1 = next_json(&mut ws1).await?;
  let hello2 = next_json(&mut ws2).await?;
  assert_eq!(hello1.get("type").and_then(|v| v.as_str()), Some("hello"));
  assert_eq!(hello2.get("type").and_then(|v| v.as_str()), Some("hello"));

  // Enumerate from ws1
  ws1
    .send(Message::Text(r#"{"id":"1","type":"devices:enumerate"}"#.into()))
    .await?;

  let mut devices: Option<Vec<serde_json::Value>> = None;
  for _ in 0..10 {
    let m = next_json(&mut ws1).await?;
    if m.get("type").and_then(|v| v.as_str()) == Some("devices:list") {
      devices = m
        .get("devices")
        .and_then(|v| v.as_array())
        .map(|arr| arr.to_vec());
      break;
    }
  }
  let devices = devices.expect("devices:list");
  let device_id = devices[0]
    .get("device_id")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  assert!(!device_id.is_empty());

  // Connect from ws1; ws2 should see radio:state broadcast
  ws1
    .send(Message::Text(
      serde_json::json!({ "id": "2", "type": "radio:connect", "device_id": device_id }).to_string(),
    ))
    .await?;

  let mut ws2_saw_state = false;
  for _ in 0..25 {
    let m = next_json(&mut ws2).await?;
    if m.get("type").and_then(|v| v.as_str()) == Some("radio:state") {
      ws2_saw_state = true;
      break;
    }
  }
  assert!(ws2_saw_state, "expected ws2 to receive radio:state broadcast");

  // Subscribe both clients to FFT stream
  ws1
    .send(Message::Text(
      serde_json::json!({ "id": "3", "type": "stream:fft:start", "device_id": device_id, "fft_size": 1024, "fps": 10, "averaging": 1 }).to_string(),
    ))
    .await?;
  ws2
    .send(Message::Text(
      serde_json::json!({ "id": "4", "type": "stream:fft:start", "device_id": device_id, "fft_size": 1024, "fps": 10, "averaging": 1 }).to_string(),
    ))
    .await?;

  async fn wait_for_fft(
    ws: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
  ) -> anyhow::Result<bool> {
    for _ in 0..100 {
      if let Some(msg) = ws.next().await {
        match msg? {
          Message::Binary(bin) => {
            if bin.first().copied() == Some(0x01) {
              return Ok(true);
            }
          }
          _ => {}
        }
      }
    }
    Ok(false)
  }

  let got1 = wait_for_fft(&mut ws1).await?;
  let got2 = wait_for_fft(&mut ws2).await?;
  assert!(got1, "ws1 should receive FFT frames");
  assert!(got2, "ws2 should receive FFT frames");

  let _ = shutdown_tx.send(());
  let _ = server_task.await?;
  Ok(())
}

