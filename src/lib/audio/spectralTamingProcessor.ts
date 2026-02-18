// ---------------------------------------------------------------------------
// spectralTamingProcessor — AudioWorkletProcessor source (inlined as a string)
// ---------------------------------------------------------------------------
// Gullfoss/DSEEQ-inspired intelligent dynamic EQ that automatically tames
// spectral resonances and boosts deficient frequencies for ham radio audio.
// This code is loaded via Blob URL by spectralTaming.ts to avoid
// bundler/module resolution issues with AudioWorklet addModule().
// ---------------------------------------------------------------------------

export const SPECTRAL_TAMING_PROCESSOR_CODE = /* js */ `
// ---------------------------------------------------------------------------
// Radix-2 Cooley-Tukey FFT (in-place, complex)
// ---------------------------------------------------------------------------
function fft(real, imag, inverse) {
  var N = real.length;

  // Bit-reversal permutation
  for (var i = 1, j = 0; i < N; i++) {
    var bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      var tmpR = real[i]; real[i] = real[j]; real[j] = tmpR;
      var tmpI = imag[i]; imag[i] = imag[j]; imag[j] = tmpI;
    }
  }

  // Butterfly stages
  for (var len = 2; len <= N; len *= 2) {
    var angle = (inverse ? 2 : -2) * Math.PI / len;
    var wR = Math.cos(angle);
    var wI = Math.sin(angle);
    for (var i = 0; i < N; i += len) {
      var tR = 1, tI = 0;
      var half = len >> 1;
      for (var k = 0; k < half; k++) {
        var uR = real[i + k], uI = imag[i + k];
        var vR = real[i + k + half] * tR - imag[i + k + half] * tI;
        var vI = real[i + k + half] * tI + imag[i + k + half] * tR;
        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + half] = uR - vR;
        imag[i + k + half] = uI - vI;
        var newTR = tR * wR - tI * wI;
        tI = tR * wI + tI * wR;
        tR = newTR;
      }
    }
  }

  if (inverse) {
    for (var i = 0; i < N; i++) {
      real[i] /= N;
      imag[i] /= N;
    }
  }
}

// ---------------------------------------------------------------------------
// SpectralTamingProcessor
// ---------------------------------------------------------------------------
class SpectralTamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._fftSize = 1024;
    this._hopSize = 512; // 50% overlap

    // Input accumulation ring buffer
    this._inputBuffer = new Float32Array(this._fftSize);
    this._inputWritePos = 0;

    // Overlap-add output buffer (double size for safe overlap accumulation)
    this._outputBuffer = new Float32Array(this._fftSize * 2);
    this._outputReadPos = 0;
    this._outputWritePos = 0;

    // FFT scratch (Float64 for precision)
    this._fftReal = new Float64Array(this._fftSize);
    this._fftImag = new Float64Array(this._fftSize);

    // Pre-compute Hann window: 0.5 * (1 - cos(2 * PI * n / (N - 1)))
    this._window = new Float32Array(this._fftSize);
    for (var n = 0; n < this._fftSize; n++) {
      this._window[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (this._fftSize - 1)));
    }

    // Half-spectrum + DC
    var halfSpectrum = this._fftSize / 2 + 1; // 513 bins

    // Running spectral envelope (exponential smoothing), init to 0
    this._envelope = new Float64Array(halfSpectrum);

    // Inter-frame gain smoothing, init to 1.0
    this._smoothedGains = new Float64Array(halfSpectrum);
    for (var i = 0; i < halfSpectrum; i++) {
      this._smoothedGains[i] = 1.0;
    }

    // Speech-weighted target curve (precomputed)
    this._targetCurve = new Float64Array(halfSpectrum);
    this._buildTargetCurve();

    // Previous overlap frame for overlap-add
    this._overlapBuffer = new Float32Array(this._fftSize);

    // Track whether we have accumulated enough input for the first frame
    this._samplesAccumulated = 0;

    // Envelope warmup
    this._envelopeInitialised = false;
    this._warmupFrames = 8;
    this._frameCount = 0;
  }
}

SpectralTamingProcessor.parameterDescriptors = [
  { name: "tameAmount", defaultValue: 0.5, minValue: 0, maxValue: 1 },
  { name: "recoverAmount", defaultValue: 0.3, minValue: 0, maxValue: 1 },
  { name: "speed", defaultValue: 0.03, minValue: 0.005, maxValue: 0.2 },
];

// ---------------------------------------------------------------------------
// Build speech-weighted target curve
// ---------------------------------------------------------------------------
SpectralTamingProcessor.prototype._buildTargetCurve = function () {
  var halfSpectrum = this._fftSize / 2 + 1;
  var maxVal = 0;

  for (var i = 0; i < halfSpectrum; i++) {
    var freqHz = i * sampleRate / this._fftSize;
    var val = 1.0;

    if (freqHz < 300) {
      // Gentle highpass roll-off below 300 Hz
      val = 0.3 + 0.7 * (freqHz / 300);
    } else if (freqHz >= 300 && freqHz < 800) {
      // Flat 300-800 Hz
      val = 1.0;
    } else if (freqHz >= 800 && freqHz <= 3500) {
      // Gentle emphasis 800-3500 Hz, +3dB peak around 2500 Hz
      // Map 800-3500 to a raised cosine peaking at 2500
      var center = 2500;
      var halfWidth = 1350; // 2500-800=1700, 3500-2500=1000; use avg ~1350
      var dist = Math.abs(freqHz - center) / halfWidth;
      if (dist > 1) dist = 1;
      // +3dB ~= 1.413x linear; peak boost of ~0.413 above 1.0
      val = 1.0 + 0.413 * (0.5 * (1 + Math.cos(Math.PI * dist)));
    } else {
      // Roll off above 3500 Hz
      var rolloff = 3500 / (freqHz + 1);
      if (rolloff > 1) rolloff = 1;
      val = rolloff;
    }

    this._targetCurve[i] = val;
    if (val > maxVal) maxVal = val;
  }

  // Normalize so the curve peaks at 1.0
  if (maxVal > 0) {
    for (var i = 0; i < halfSpectrum; i++) {
      this._targetCurve[i] /= maxVal;
    }
  }
};

// ---------------------------------------------------------------------------
// process() — called every render quantum (128 samples)
// ---------------------------------------------------------------------------
SpectralTamingProcessor.prototype.process = function (inputs, outputs, parameters) {
  var input = inputs[0];
  var output = outputs[0];

  // No input connected — output silence and keep alive
  if (!input || input.length === 0 || !input[0]) {
    if (output) {
      for (var ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
    }
    return true;
  }

  var inChannel = input[0];   // mono: use first channel
  var outChannel = output[0];
  var blockSize = inChannel.length; // typically 128

  // Read parameters (k-rate — use first sample)
  var tameAmount = parameters.tameAmount[0];
  var recoverAmount = parameters.recoverAmount[0];
  var speed = parameters.speed[0];

  var fftSize = this._fftSize;
  var hopSize = this._hopSize;
  var halfSpectrum = fftSize / 2 + 1;

  // --- Accumulate input samples ---
  for (var s = 0; s < blockSize; s++) {
    this._inputBuffer[this._inputWritePos] = inChannel[s];
    this._inputWritePos++;
    this._samplesAccumulated++;

    // When we've filled a full FFT frame, process it
    if (this._inputWritePos >= fftSize) {
      // --- Apply analysis window and load into FFT arrays ---
      for (var i = 0; i < fftSize; i++) {
        this._fftReal[i] = this._inputBuffer[i] * this._window[i];
        this._fftImag[i] = 0;
      }

      // --- Forward FFT ---
      fft(this._fftReal, this._fftImag, false);

      // --- Compute magnitudes and phases ---
      var magnitudes = new Float64Array(halfSpectrum);
      var phases = new Float64Array(halfSpectrum);

      for (var i = 0; i < halfSpectrum; i++) {
        var re = this._fftReal[i];
        var im = this._fftImag[i];
        magnitudes[i] = Math.sqrt(re * re + im * im);
        phases[i] = Math.atan2(im, re);
      }

      // --- Update running spectral envelope ---
      this._frameCount++;

      if (!this._envelopeInitialised) {
        if (this._frameCount === 1) {
          // First frame: seed envelope directly
          for (var i = 0; i < halfSpectrum; i++) {
            this._envelope[i] = magnitudes[i];
          }
        } else {
          // Running average during warmup
          for (var i = 0; i < halfSpectrum; i++) {
            this._envelope[i] += (magnitudes[i] - this._envelope[i]) / this._frameCount;
          }
        }
        if (this._frameCount >= this._warmupFrames) {
          this._envelopeInitialised = true;
        }
      } else {
        // Exponential smoothing: envelope[i] = envelope[i] * (1 - speed) + magnitude[i] * speed
        for (var i = 0; i < halfSpectrum; i++) {
          this._envelope[i] = this._envelope[i] * (1 - speed) + magnitudes[i] * speed;
        }
      }

      // --- Compute per-bin corrective gain ---
      var gains = new Float64Array(halfSpectrum);

      if (this._envelopeInitialised) {
        for (var i = 0; i < halfSpectrum; i++) {
          var ratio = this._targetCurve[i] / (this._envelope[i] + 1e-10);

          if (ratio < 1.0) {
            // Resonance: tame it
            gains[i] = 1.0 + (ratio - 1.0) * tameAmount; // lerp(1.0, ratio, tameAmount)
          } else {
            // Deficiency: boost it (cap ratio at 4.0)
            var cappedRatio = ratio < 4.0 ? ratio : 4.0;
            gains[i] = 1.0 + (cappedRatio - 1.0) * recoverAmount; // lerp(1.0, cappedRatio, recoverAmount)
          }

          // Clamp gain to [0.1, 6.0]
          if (gains[i] < 0.1) gains[i] = 0.1;
          if (gains[i] > 6.0) gains[i] = 6.0;
        }
      } else {
        // During warmup, pass through with unity gain
        for (var i = 0; i < halfSpectrum; i++) {
          gains[i] = 1.0;
        }
      }

      // --- Smooth gains between frames ---
      for (var i = 0; i < halfSpectrum; i++) {
        this._smoothedGains[i] = this._smoothedGains[i] * 0.7 + gains[i] * 0.3;
      }

      // --- Apply smoothed gains to magnitude, preserve phase ---
      for (var i = 0; i < halfSpectrum; i++) {
        var newMag = magnitudes[i] * this._smoothedGains[i];
        this._fftReal[i] = newMag * Math.cos(phases[i]);
        this._fftImag[i] = newMag * Math.sin(phases[i]);
      }

      // --- Mirror conjugate for negative frequencies ---
      for (var i = halfSpectrum; i < fftSize; i++) {
        this._fftReal[i] = this._fftReal[fftSize - i];
        this._fftImag[i] = -this._fftImag[fftSize - i];
      }

      // --- Inverse FFT ---
      fft(this._fftReal, this._fftImag, true);

      // --- Apply synthesis window with COLA normalization ---
      // Hann window with 50% overlap: sum of squared windows = 0.5,
      // so multiply by 2.0 to achieve unity gain at perfect reconstruction.
      for (var i = 0; i < fftSize; i++) {
        this._fftReal[i] *= this._window[i] * 2.0;
      }

      // --- Overlap-add into output buffer ---
      for (var i = 0; i < fftSize; i++) {
        this._overlapBuffer[i] += this._fftReal[i];
      }

      // The first hopSize samples of overlapBuffer are now complete
      // (they've been added to by both the previous and current frame).
      // Copy them to the output ring buffer.
      var outBufLen = this._outputBuffer.length;
      for (var i = 0; i < hopSize; i++) {
        this._outputBuffer[this._outputWritePos % outBufLen] = this._overlapBuffer[i];
        this._outputWritePos++;
      }

      // Shift the overlap buffer: move the second half to the first half
      for (var i = 0; i < hopSize; i++) {
        this._overlapBuffer[i] = this._overlapBuffer[i + hopSize];
      }
      // Clear the second half
      for (var i = hopSize; i < fftSize; i++) {
        this._overlapBuffer[i] = 0;
      }

      // --- Slide input buffer: keep last hopSize samples for overlap ---
      for (var i = 0; i < hopSize; i++) {
        this._inputBuffer[i] = this._inputBuffer[i + hopSize];
      }
      this._inputWritePos = hopSize;
    }
  }

  // --- Output samples from the output ring buffer ---
  var outBufLen = this._outputBuffer.length;
  if (this._samplesAccumulated >= fftSize) {
    // We have processed at least one full frame — output from ring buffer
    for (var i = 0; i < blockSize; i++) {
      outChannel[i] = this._outputBuffer[this._outputReadPos % outBufLen];
      this._outputBuffer[this._outputReadPos % outBufLen] = 0; // clear after read
      this._outputReadPos++;
    }
  } else {
    // Not enough input accumulated yet — output silence to avoid garbage
    outChannel.fill(0);
  }

  // Copy mono output to any additional output channels
  for (var ch = 1; ch < output.length; ch++) {
    output[ch].set(outChannel);
  }

  return true;
};

registerProcessor("spectral-taming", SpectralTamingProcessor);
`;
