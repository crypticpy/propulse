// ---------------------------------------------------------------------------
// psychoacousticLevelerProcessor — AudioWorkletProcessor source (inlined as a string)
// ---------------------------------------------------------------------------
// This code is loaded via Blob URL by psychoacousticLeveler.ts to avoid
// bundler/module resolution issues with AudioWorklet addModule().
// ---------------------------------------------------------------------------

export const PSYCHOACOUSTIC_LEVELER_PROCESSOR_CODE = /* js */ `
class PsychoacousticLevelerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "targetLevel", defaultValue: -20, minValue: -40, maxValue: -6 },
      { name: "speed", defaultValue: 0.03, minValue: 0.005, maxValue: 0.2 },
      { name: "maxGainDb", defaultValue: 12, minValue: 0, maxValue: 24 },
    ];
  }

  constructor() {
    super();

    // ---- A-weighting approximation biquad coefficients ----
    // Uses sampleRate global (available in AudioWorklet scope) for correct
    // filter characteristics at any sample rate (44.1k, 48k, 96k, etc.)
    var fs = sampleRate;

    // Section 1: 2nd-order Butterworth highpass at 150 Hz
    var wc1 = 2 * Math.PI * 150 / fs;
    var K1 = Math.tan(wc1 / 2);
    var Q1 = 0.7071;
    var norm1 = 1 / (1 + K1 / Q1 + K1 * K1);
    this._hp_b0 = norm1;
    this._hp_b1 = -2 * norm1;
    this._hp_b2 = norm1;
    this._hp_a1 = 2 * (K1 * K1 - 1) * norm1;
    this._hp_a2 = (1 - K1 / Q1 + K1 * K1) * norm1;

    // Section 2: 2nd-order peaking at 2500 Hz, +4dB gain, Q = 1.0
    var wc2 = 2 * Math.PI * 2500 / fs;
    var K2 = Math.tan(wc2 / 2);
    var Q2 = 1.0;
    var V2 = Math.pow(10, 4 / 20);
    var norm2 = 1 / (1 + K2 / Q2 + K2 * K2);
    this._pk_b0 = (1 + V2 * K2 / Q2 + K2 * K2) * norm2;
    this._pk_b1 = 2 * (K2 * K2 - 1) * norm2;
    this._pk_b2 = (1 - V2 * K2 / Q2 + K2 * K2) * norm2;
    this._pk_a1 = 2 * (K2 * K2 - 1) * norm2;
    this._pk_a2 = (1 - K2 / Q2 + K2 * K2) * norm2;

    // Biquad filter state (Direct Form II Transposed)
    // Section 1 (highpass)
    this._hp_z1 = 0;
    this._hp_z2 = 0;
    // Section 2 (peaking)
    this._pk_z1 = 0;
    this._pk_z2 = 0;

    // ---- RMS circular buffer (400ms at actual sample rate) ----
    var rmsSamples = Math.round(0.4 * fs);
    this._rmsBuffer = new Float64Array(rmsSamples);
    this._rmsWritePos = 0;
    this._rmsSum = 0;
    this._bufferFilled = false;

    // ---- AGC state ----
    this._currentGainDb = 0;
  }

  process(inputs, outputs, parameters) {
    var input = inputs[0];
    var output = outputs[0];

    if (!input || input.length === 0) {
      for (var ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    var blockSize = input[0].length;
    var targetLevel = parameters.targetLevel[0];
    var speed = parameters.speed[0];
    var maxGainDb = parameters.maxGainDb[0];

    var bufLen = this._rmsBuffer.length;

    // Local references for filter coefficients
    var hp_b0 = this._hp_b0;
    var hp_b1 = this._hp_b1;
    var hp_b2 = this._hp_b2;
    var hp_a1 = this._hp_a1;
    var hp_a2 = this._hp_a2;

    var pk_b0 = this._pk_b0;
    var pk_b1 = this._pk_b1;
    var pk_b2 = this._pk_b2;
    var pk_a1 = this._pk_a1;
    var pk_a2 = this._pk_a2;

    // Local references for filter state
    var hp_z1 = this._hp_z1;
    var hp_z2 = this._hp_z2;
    var pk_z1 = this._pk_z1;
    var pk_z2 = this._pk_z2;

    var rmsBuffer = this._rmsBuffer;
    var writePos = this._rmsWritePos;
    var rmsSum = this._rmsSum;
    var bufferFilled = this._bufferFilled;
    var currentGainDb = this._currentGainDb;

    // Process each sample
    for (var i = 0; i < blockSize; i++) {
      // Sum across channels for mono analysis
      var monoSample = 0;
      for (var ch = 0; ch < input.length; ch++) {
        monoSample += input[ch][i];
      }
      monoSample /= input.length;

      // ---- A-weighting filter (two cascaded biquads, DF-II Transposed) ----

      // Section 1: highpass at 150 Hz
      var hp_out = hp_b0 * monoSample + hp_z1;
      hp_z1 = hp_b1 * monoSample - hp_a1 * hp_out + hp_z2;
      hp_z2 = hp_b2 * monoSample - hp_a2 * hp_out;

      // Section 2: peaking at 2500 Hz
      var weighted = pk_b0 * hp_out + pk_z1;
      pk_z1 = pk_b1 * hp_out - pk_a1 * weighted + pk_z2;
      pk_z2 = pk_b2 * hp_out - pk_a2 * weighted;

      // ---- RMS measurement with circular buffer ----
      var squaredSample = weighted * weighted;

      // Subtract the old value being overwritten
      rmsSum -= rmsBuffer[writePos];
      // Write the new squared sample
      rmsBuffer[writePos] = squaredSample;
      // Add the new value
      rmsSum += squaredSample;

      writePos++;
      if (writePos >= bufLen) {
        writePos = 0;
        bufferFilled = true;
        // Recompute sum from scratch to prevent floating-point drift
        // (once per buffer rotation ≈ every 400ms, negligible cost)
        rmsSum = 0;
        for (var j = 0; j < bufLen; j++) rmsSum += rmsBuffer[j];
      }

      // Compute RMS in dB
      var effectiveLength = bufferFilled ? bufLen : writePos;
      if (effectiveLength < 1) effectiveLength = 1;
      var rmsDb = 10 * Math.log10(rmsSum / effectiveLength + 1e-20);

      // ---- Gain computation ----
      var errorDb = targetLevel - rmsDb;
      var desiredGainDb = errorDb;
      if (desiredGainDb > maxGainDb) desiredGainDb = maxGainDb;
      if (desiredGainDb < -maxGainDb) desiredGainDb = -maxGainDb;

      // Exponential smoothing with asymmetric attack/release
      var coeff;
      if (desiredGainDb > currentGainDb) {
        // Signal got quieter, increase gain — slower (attack)
        coeff = speed * 0.3;
      } else {
        // Signal got louder, decrease gain — faster (release)
        coeff = speed * 1.5;
      }
      currentGainDb += coeff * (desiredGainDb - currentGainDb);

      // ---- Apply gain + hard limiter ----
      var linearGain = Math.pow(10, currentGainDb / 20);

      for (var ch = 0; ch < input.length; ch++) {
        var sample = input[ch][i] * linearGain;
        // Brick-wall limiter
        if (sample > 1) sample = 1;
        else if (sample < -1) sample = -1;
        output[ch][i] = sample;
      }
    }

    // Write back filter state
    this._hp_z1 = hp_z1;
    this._hp_z2 = hp_z2;
    this._pk_z1 = pk_z1;
    this._pk_z2 = pk_z2;
    this._rmsWritePos = writePos;
    this._rmsSum = rmsSum;
    this._bufferFilled = bufferFilled;
    this._currentGainDb = currentGainDb;

    return true;
  }
}

registerProcessor("psychoacoustic-leveler", PsychoacousticLevelerProcessor);
`;
