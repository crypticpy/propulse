use std::{net::SocketAddr, sync::Arc};

use async_trait::async_trait;
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  net::{TcpListener, TcpStream},
  task::JoinHandle,
};

#[async_trait]
pub trait CatBackend: Send + Sync {
  async fn get_frequency(&self) -> anyhow::Result<u64>;
  async fn set_frequency(&self, hz: u64) -> anyhow::Result<()>;

  async fn get_mode(&self) -> anyhow::Result<(String, i32)>;
  async fn set_mode(&self, mode: &str, passband: i32) -> anyhow::Result<()>;

  async fn get_ptt(&self) -> anyhow::Result<bool>;
  async fn set_ptt(&self, enabled: bool) -> anyhow::Result<()>;

  async fn get_smeter(&self) -> anyhow::Result<i32> {
    // Hamlib rigctld returns integer strength for `l STRENGTH`.
    Ok(0)
  }
}

pub fn start_cat_server(
  addr: SocketAddr,
  backend: Arc<dyn CatBackend>,
) -> JoinHandle<anyhow::Result<()>> {
  tokio::spawn(async move {
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "CAT server listening (rigctl)");

    loop {
      let (stream, remote) = listener.accept().await?;
      let backend = Arc::clone(&backend);
      tokio::spawn(async move {
        if let Err(err) = handle_client(stream, backend).await {
          tracing::debug!(%remote, error = %err, "CAT client disconnected");
        }
      });
    }
  })
}

async fn handle_client(stream: TcpStream, backend: Arc<dyn CatBackend>) -> anyhow::Result<()> {
  let (read_half, mut write_half) = stream.into_split();
  let mut reader = BufReader::new(read_half);
  let mut line = String::new();

  loop {
    line.clear();
    let n = reader.read_line(&mut line).await?;
    if n == 0 {
      break;
    }
    let cmd = line.trim();
    if cmd.is_empty() {
      continue;
    }

    // rigctld commands are line-oriented. We implement a tiny subset:
    //   f           -> get freq
    //   F <hz>      -> set freq
    //   m           -> get mode (2 lines: mode, passband)
    //   M <m> <pb>  -> set mode
    //   t           -> get ptt
    //   T <0|1>     -> set ptt
    //   l STRENGTH  -> get s-meter
    match cmd {
      "f" => {
        let hz = backend.get_frequency().await.unwrap_or(0);
        write_half.write_all(format!("{hz}\n").as_bytes()).await?;
      }
      "m" => {
        let (mode, passband) = backend.get_mode().await.unwrap_or(("UNKNOWN".to_string(), 0));
        write_half.write_all(format!("{mode}\n{passband}\n").as_bytes()).await?;
      }
      "t" => {
        let ptt = backend.get_ptt().await.unwrap_or(false);
        write_half.write_all(if ptt { b"1\n" } else { b"0\n" }).await?;
      }
      _ if cmd.starts_with("F ") => {
        let hz = cmd[2..].trim().parse::<u64>().unwrap_or(0);
        let _ = backend.set_frequency(hz).await;
        write_half.write_all(b"RPRT 0\n").await?;
      }
      _ if cmd.starts_with("M ") => {
        let rest = cmd[2..].trim();
        let mut parts = rest.split_whitespace();
        let mode = parts.next().unwrap_or("UNKNOWN");
        let passband = parts.next().and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);
        let _ = backend.set_mode(mode, passband).await;
        write_half.write_all(b"RPRT 0\n").await?;
      }
      _ if cmd.starts_with("T ") => {
        let v = cmd[2..].trim().parse::<i32>().unwrap_or(0);
        let enabled = v != 0;
        let _ = backend.set_ptt(enabled).await;
        write_half.write_all(b"RPRT 0\n").await?;
      }
      _ if cmd.eq_ignore_ascii_case("l STRENGTH") => {
        let v = backend.get_smeter().await.unwrap_or(0);
        write_half.write_all(format!("{v}\n").as_bytes()).await?;
      }
      _ => {
        write_half.write_all(b"RPRT -1\n").await?;
      }
    }

    write_half.flush().await?;
  }

  Ok(())
}

