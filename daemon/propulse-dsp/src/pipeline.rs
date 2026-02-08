use crate::{
  agc::{Agc, AgcMode},
  demod::{demodulate, DemodMode},
  fft::{FftConfig, FftProcessor},
  filter::{design_bandpass, FirFilter},
  nb::NoiseBlanker,
  nr::NoiseReduction,
  resample::LinearResampler,
  Complex32,
};

#[derive(Debug, Clone)]
pub struct PipelineConfig {
  pub iq_sample_rate: u32,
  pub audio_sample_rate: u32,
  pub mode: DemodMode,
  pub filter_low_hz: f32,
  pub filter_high_hz: f32,
  pub agc: AgcMode,
  pub nr_level: u8,
  pub nb_enabled: bool,
  pub nb_threshold: f32,
}

impl Default for PipelineConfig {
  fn default() -> Self {
    Self {
      iq_sample_rate: 2_048_000,
      audio_sample_rate: 48_000,
      mode: DemodMode::Usb,
      filter_low_hz: 300.0,
      filter_high_hz: 2700.0,
      agc: AgcMode::Medium,
      nr_level: 0,
      nb_enabled: false,
      nb_threshold: 0.9,
    }
  }
}

pub struct DspPipeline {
  cfg: PipelineConfig,
  fft: FftProcessor,
  resampler: LinearResampler,
  filter: FirFilter,
  agc: Agc,
  nr: NoiseReduction,
  nb: NoiseBlanker,
}

impl DspPipeline {
  pub fn new(cfg: PipelineConfig) -> Self {
    let fft = FftProcessor::new(FftConfig::default());
    let resampler = LinearResampler::new(cfg.iq_sample_rate, cfg.audio_sample_rate);
    let taps = design_bandpass(
      cfg.audio_sample_rate as f32,
      cfg.filter_low_hz,
      cfg.filter_high_hz,
      257,
    );
    let filter = FirFilter::new(taps);
    let agc = Agc::new(cfg.agc, cfg.audio_sample_rate);
    let mut nr = NoiseReduction::new();
    nr.level = cfg.nr_level;
    let mut nb = NoiseBlanker::new();
    nb.enabled = cfg.nb_enabled;
    nb.threshold = cfg.nb_threshold;
    Self {
      cfg,
      fft,
      resampler,
      filter,
      agc,
      nr,
      nb,
    }
  }

  pub fn config(&self) -> &PipelineConfig {
    &self.cfg
  }

  pub fn set_sample_rates(&mut self, iq_sample_rate: u32, audio_sample_rate: u32) {
    let iq_sample_rate = iq_sample_rate.max(1);
    let audio_sample_rate = audio_sample_rate.max(1);
    if self.cfg.iq_sample_rate == iq_sample_rate && self.cfg.audio_sample_rate == audio_sample_rate {
      return;
    }

    self.cfg.iq_sample_rate = iq_sample_rate;
    self.cfg.audio_sample_rate = audio_sample_rate;
    self.resampler.set_rates(iq_sample_rate, audio_sample_rate);
    self.agc.set_mode(self.cfg.agc, audio_sample_rate);
    self.rebuild_filter();
  }

  pub fn set_mode(&mut self, mode: DemodMode) {
    self.cfg.mode = mode;
    // update default passbands
    match mode {
      DemodMode::Usb | DemodMode::Lsb => {
        self.cfg.filter_low_hz = 300.0;
        self.cfg.filter_high_hz = 2700.0;
      }
      DemodMode::Cw => {
        self.cfg.filter_low_hz = 450.0;
        self.cfg.filter_high_hz = 950.0;
      }
      DemodMode::Am => {
        self.cfg.filter_low_hz = 0.0;
        self.cfg.filter_high_hz = 5000.0;
      }
      DemodMode::Fm => {
        self.cfg.filter_low_hz = 0.0;
        self.cfg.filter_high_hz = 15000.0;
      }
    }
    self.rebuild_filter();
  }

  pub fn set_filter(&mut self, low_hz: f32, high_hz: f32) {
    self.cfg.filter_low_hz = low_hz.max(0.0);
    self.cfg.filter_high_hz = high_hz.max(self.cfg.filter_low_hz);
    self.rebuild_filter();
  }

  pub fn set_nr(&mut self, enabled: bool, level: u8) {
    self.nr.level = if enabled { level.min(5).max(1) } else { 0 };
    self.cfg.nr_level = self.nr.level;
  }

  pub fn set_nb(&mut self, enabled: bool, threshold: f32) {
    self.nb.enabled = enabled;
    self.nb.threshold = threshold.clamp(0.0, 1.0);
    self.cfg.nb_enabled = enabled;
    self.cfg.nb_threshold = self.nb.threshold;
  }

  pub fn set_agc(&mut self, mode: AgcMode) {
    self.cfg.agc = mode;
    self.agc.set_mode(mode, self.cfg.audio_sample_rate);
  }

  pub fn set_fft_config(&mut self, cfg: FftConfig) {
    self.fft.set_config(cfg);
  }

  pub fn process_fft(&mut self, iq: &[Complex32]) -> anyhow::Result<Vec<f32>> {
    self.fft.process_db(iq)
  }

  pub fn process_audio_i16(&mut self, iq: &[Complex32]) -> Vec<i16> {
    let audio = demodulate(iq, self.cfg.mode);
    let mut audio = self.resampler.process(&audio);
    audio = self.filter.process(&audio);
    audio = self.nb.process(&audio);
    audio = self.nr.process(&audio);
    audio = self.agc.process(&audio);

    audio
      .into_iter()
      .map(|s| (s.clamp(-1.0, 1.0) * (i16::MAX as f32)) as i16)
      .collect()
  }

  fn rebuild_filter(&mut self) {
    let taps = design_bandpass(
      self.cfg.audio_sample_rate as f32,
      self.cfg.filter_low_hz,
      self.cfg.filter_high_hz,
      257,
    );
    self.filter.set_taps(taps);
  }
}
