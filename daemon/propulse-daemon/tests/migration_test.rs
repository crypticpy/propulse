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

async fn next_text(
  ws: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
) -> anyhow::Result<String> {
  while let Some(msg) = ws.next().await {
    let msg = msg?;
    if let Message::Text(text) = msg {
      return Ok(text);
    }
  }
  anyhow::bail!("WebSocket closed");
}

#[tokio::test]
async fn legacy_bridge_messages_are_accepted() -> anyhow::Result<()> {
  let port = pick_free_port();
  let url = format!("ws://127.0.0.1:{port}");

  let mut config = AppConfig::default();
  config.server.bind = "127.0.0.1".to_string();
  config.server.port = port;

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
  let _hello = next_text(&mut ws).await?;

  // legacy rig.status -> rig.update (requesting client only)
  ws.send(Message::Text(
    serde_json::json!({
      "type": "rig.status",
      "id": "legacy-1",
      "timestamp": 0,
      "payload": {}
    })
    .to_string(),
  ))
  .await?;

  let mut saw_rig_update = false;
  for _ in 0..25 {
    let text = next_text(&mut ws).await?;
    let msg: serde_json::Value = serde_json::from_str(&text)?;
    if msg.get("type").and_then(|v| v.as_str()) == Some("rig.update") {
      saw_rig_update = true;
      break;
    }
  }
  assert!(saw_rig_update, "expected rig.update from legacy rig.status");

  let _ = shutdown_tx.send(());
  let _ = server_task.await?;
  Ok(())
}

