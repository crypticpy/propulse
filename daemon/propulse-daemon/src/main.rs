mod config;
mod protocol;
mod server;

use clap::Parser;
use tracing::level_filters::LevelFilter;
use tracing_subscriber::fmt::writer::MakeWriterExt;
use tracing_subscriber::EnvFilter;

use crate::config::{AppConfig, Cli};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
  let cli = Cli::parse();

  let mut log_filter = EnvFilter::builder()
    .with_default_directive(LevelFilter::INFO.into())
    .from_env_lossy();
  if let Some(level) = cli.log_level.as_deref() {
    if let Ok(f) = EnvFilter::try_new(level) {
      log_filter = f;
    }
  }

  let _log_guard = if let Some(path) = cli.log_file.clone() {
    let parent = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    if !parent.as_os_str().is_empty() {
      std::fs::create_dir_all(&parent)?;
    }
    let file = std::fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(&path)?;
    let (non_blocking, guard) = tracing_appender::non_blocking(file);
    tracing_subscriber::fmt()
      .with_env_filter(log_filter)
      .with_writer(std::io::stdout.and(non_blocking))
      .json()
      .init();
    Some(guard)
  } else {
    tracing_subscriber::fmt()
      .with_env_filter(log_filter)
      .json()
      .init();
    None
  };

  let (config, config_path) = AppConfig::load_or_create_with_path(&cli)?;
  server::run(config, cli, config_path).await?;
  Ok(())
}
