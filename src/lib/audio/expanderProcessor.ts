// ---------------------------------------------------------------------------
// expanderProcessor — AudioWorkletProcessor source (inlined as a string)
// ---------------------------------------------------------------------------
// This code is loaded via Blob URL by expander.ts to avoid bundler/module
// resolution issues with AudioWorklet addModule().
// ---------------------------------------------------------------------------

export const EXPANDER_PROCESSOR_CODE = /* js */ `
class ExpanderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: -45, minValue: -80, maxValue: 0 },
      { name: "ratio", defaultValue: 2, minValue: 1, maxValue: 10 },
      { name: "attack", defaultValue: 5, minValue: 0.1, maxValue: 100 },
      { name: "release", defaultValue: 80, minValue: 1, maxValue: 500 },
      { name: "rangeDb", defaultValue: 30, minValue: 0, maxValue: 60 },
    ];
  }

  constructor() {
    super();
    this.envelope = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    const blockSize = input[0].length;
    const thresholdDb = parameters.threshold[0];
    const ratio = parameters.ratio[0];
    const attackMs = parameters.attack[0];
    const releaseMs = parameters.release[0];
    const rangeDb = parameters.rangeDb[0];

    const attackCoeff = 1 - Math.exp(-1 / (sampleRate * (attackMs / 1000)));
    const releaseCoeff = 1 - Math.exp(-1 / (sampleRate * (releaseMs / 1000)));

    let sumOfSquares = 0;
    let totalSamples = 0;
    for (let ch = 0; ch < input.length; ch++) {
      const channelData = input[ch];
      for (let i = 0; i < blockSize; i++) {
        const s = channelData[i];
        sumOfSquares += s * s;
      }
      totalSamples += blockSize;
    }

    const rms = Math.sqrt(sumOfSquares / (totalSamples || 1));
    const levelDb = 20 * Math.log10(rms + 1e-10);

    // Downward expander gain (only below threshold).
    // desiredOutDb = threshold + (inDb - threshold) * ratio
    // gainDb = desiredOutDb - inDb = (inDb - threshold) * (ratio - 1)
    let gainDb = 0;
    if (levelDb < thresholdDb && ratio > 1) {
      gainDb = (levelDb - thresholdDb) * (ratio - 1);
    }

    const minGain = Math.pow(10, -Math.max(0, rangeDb) / 20);
    let targetGain = Math.pow(10, gainDb / 20);
    if (targetGain < minGain) targetGain = minGain;
    if (targetGain > 1) targetGain = 1;

    for (let i = 0; i < blockSize; i++) {
      const coeff = targetGain > this.envelope ? attackCoeff : releaseCoeff;
      this.envelope += coeff * (targetGain - this.envelope);
      if (this.envelope < minGain) this.envelope = minGain;
      if (this.envelope > 1) this.envelope = 1;

      for (let ch = 0; ch < input.length; ch++) {
        output[ch][i] = input[ch][i] * this.envelope;
      }
    }

    return true;
  }
}

registerProcessor("expander", ExpanderProcessor);
`;

