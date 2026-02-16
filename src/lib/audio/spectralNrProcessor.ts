// ---------------------------------------------------------------------------
// SpectralNrProcessor — AudioWorkletProcessor for spectral subtraction NR
// ---------------------------------------------------------------------------
// This file serves as the TypeScript reference implementation for the
// spectral subtraction noise reduction algorithm.  The actual processor code
// that runs inside the AudioWorklet scope is exported as a plain JavaScript
// string constant (SPECTRAL_NR_PROCESSOR_CODE) so that the wrapper module
// (spectralNr.ts) can load it via a Blob URL.
//
// Algorithm: overlap-add spectral subtraction
//   1. Accumulate input samples into a 256-sample FFT frame (50% overlap,
//      128-sample hop).
//   2. Apply a Hann window.
//   3. Forward FFT (radix-2 Cooley-Tukey, in-place).
//   4. Compute magnitude spectrum.
//   5. Estimate noise floor via exponential smoothing on running minimums.
//   6. Spectral subtraction: subtract scaled noise floor from magnitude,
//      clamping to a spectral floor to prevent musical-noise artefacts.
//   7. Reconstruct complex spectrum with cleaned magnitudes + original phase.
//   8. Inverse FFT.
//   9. Apply Hann window again (synthesis window for overlap-add).
//  10. Overlap-add into output ring buffer; emit 128 samples per cycle.
//
// Parameters (AudioParam, k-rate):
//   nrLevel   — aggressiveness 0-10 (mapped to 0-3x subtraction factor)
//   adaptRate — noise floor adaptation speed 0.001-0.1
//
// The FFT is a standard radix-2 decimation-in-time implementation operating
// on Float64Arrays for numerical precision.  Everything is self-contained
// with zero imports — a hard requirement for AudioWorklet processors.
// ---------------------------------------------------------------------------

/** Spectral NR processor code (runs in AudioWorklet scope) */
export const SPECTRAL_NR_PROCESSOR_CODE = `
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
// SpectralNrProcessor
// ---------------------------------------------------------------------------
class SpectralNrProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._fftSize = 256;
    this._hopSize = 128; // 50% overlap

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

    // Noise floor estimate (magnitude spectrum, half-spectrum + DC)
    this._noiseFloor = new Float64Array(this._fftSize / 2 + 1);
    this._magnitudes = new Float64Array(this._fftSize / 2 + 1);
    this._phases = new Float64Array(this._fftSize / 2 + 1);
    this._noiseFloorInitialised = false;
    this._noiseFrameCount = 0;
    this._noiseInitFrames = 8; // number of initial frames used for noise estimation

    // Previous overlap frame for overlap-add
    this._overlapBuffer = new Float32Array(this._fftSize);

    // Track whether we have accumulated enough input for the first frame
    this._samplesAccumulated = 0;
  }
}

SpectralNrProcessor.parameterDescriptors = [
  { name: "nrLevel", defaultValue: 3, minValue: 0, maxValue: 10 },
  { name: "adaptRate", defaultValue: 0.01, minValue: 0.001, maxValue: 0.1 },
];

SpectralNrProcessor.prototype.process = function (inputs, outputs, parameters) {
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
  var nrLevelRaw = parameters.nrLevel.length > 1 ? parameters.nrLevel[0] : parameters.nrLevel[0];
  var adaptRate = parameters.adaptRate.length > 1 ? parameters.adaptRate[0] : parameters.adaptRate[0];

  // Map nrLevel 0-10 to subtraction factor 0-3
  var subtractionFactor = (nrLevelRaw / 10) * 3;

  // Spectral floor prevents musical noise (minimum gain applied to each bin)
  var spectralFloor = 0.03;

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
      var magnitudes = this._magnitudes;
      var phases = this._phases;

      for (var i = 0; i < halfSpectrum; i++) {
        var re = this._fftReal[i];
        var im = this._fftImag[i];
        magnitudes[i] = Math.sqrt(re * re + im * im);
        phases[i] = Math.atan2(im, re);
      }

      // --- Update noise floor estimate ---
      this._noiseFrameCount++;

      if (!this._noiseFloorInitialised) {
        // During initial frames, accumulate average noise magnitude
        if (this._noiseFrameCount === 1) {
          // First frame: seed noise floor directly
          for (var i = 0; i < halfSpectrum; i++) {
            this._noiseFloor[i] = magnitudes[i];
          }
        } else {
          // Running average during initial estimation
          for (var i = 0; i < halfSpectrum; i++) {
            this._noiseFloor[i] += (magnitudes[i] - this._noiseFloor[i]) / this._noiseFrameCount;
          }
        }
        if (this._noiseFrameCount >= this._noiseInitFrames) {
          this._noiseFloorInitialised = true;
        }
      } else {
        // Ongoing noise floor tracking: exponential smoothing towards minimum
        for (var i = 0; i < halfSpectrum; i++) {
          // Track the minimum: if current magnitude is below noise floor,
          // snap down quickly; otherwise adapt slowly upward
          if (magnitudes[i] < this._noiseFloor[i]) {
            this._noiseFloor[i] = magnitudes[i];
          } else {
            this._noiseFloor[i] = this._noiseFloor[i] * (1 - adaptRate) + magnitudes[i] * adaptRate;
          }
        }
      }

      // --- Spectral subtraction ---
      if (nrLevelRaw > 0 && this._noiseFloorInitialised) {
        for (var i = 0; i < halfSpectrum; i++) {
          var cleanMag = magnitudes[i] - subtractionFactor * this._noiseFloor[i];
          var floor = spectralFloor * magnitudes[i];
          if (cleanMag < floor) {
            cleanMag = floor;
          }
          magnitudes[i] = cleanMag;
        }
      }

      // --- Reconstruct complex spectrum with cleaned magnitudes + original phase ---
      for (var i = 0; i < halfSpectrum; i++) {
        this._fftReal[i] = magnitudes[i] * Math.cos(phases[i]);
        this._fftImag[i] = magnitudes[i] * Math.sin(phases[i]);
      }
      // Mirror conjugate for negative frequencies
      for (var i = halfSpectrum; i < fftSize; i++) {
        this._fftReal[i] = this._fftReal[fftSize - i];
        this._fftImag[i] = -this._fftImag[fftSize - i];
      }

      // --- Inverse FFT ---
      fft(this._fftReal, this._fftImag, true);

      // --- Apply synthesis window ---
      for (var i = 0; i < fftSize; i++) {
        this._fftReal[i] *= this._window[i];
      }

      // --- Overlap-add into output buffer ---
      // The overlap region is the first hopSize samples of the new frame,
      // which overlap with the last hopSize samples of the previous frame.
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

registerProcessor("spectral-nr", SpectralNrProcessor);
`;
