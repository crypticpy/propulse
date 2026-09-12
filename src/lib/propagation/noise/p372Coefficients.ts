/**
 * ITU-R P.372 atmospheric-noise coefficient asset: provenance, integrity and
 * decoding.
 *
 * The numbers themselves live in the sibling `p372Coefficients.json`. They are
 * the four arrays the ITU-R Study Group 3 reference implementation reads out of
 * the harmonized monthly coefficient files (`COEFF01W.txt` .. `COEFF12W.txt`)
 * for the atmospheric-noise calculation:
 *
 *   fakp(29,16,6)   the CCIR Report 322 numerical world map of Fam at 1 MHz,
 *                   as a double Fourier series in longitude and latitude, one
 *                   set per four-hour local-time block
 *   fakabp(2,6)     the linear normalisation terms of that series
 *   fam(14,12)      the frequency-variation polynomials, per time block and
 *                   hemisphere (Lucas & Harper, NBS Technical Note 318,
 *                   "A Numerical Representation of CCIR Report 322 High
 *                   Frequency (3-30 Mc/s) Atmospheric Radio Noise Data")
 *   dud(5,12,5)     the decile and standard-deviation polynomials
 *                   (Du, Dl, sigma_Du, sigma_Dl, sigma_Fam)
 *
 * Source: https://github.com/ITU-R-Study-Group-3/ITU-R-HF at commit
 * cd172be56dc04b154e5d2fa91cbaa6ecf5284305, files `P372/Data/COEFF*W.txt`,
 * read by `P372/Src/P372/ReadFamDud.c`. That repository's `P372/Src/P372/Noise.c`
 * states of the software: "The ITURHFProp, P533 and P372 software has been
 * developed collaboratively by participants in ITU-R Study Group 3. It may be
 * used by implementers in their implementation of the Recommendation as well as
 * in revisions of the specific original Recommendation and in other ITU
 * Recommendations, free from any copyright assertions." The data files carry no
 * separate licence statement; `ReadFamDud.c` still carries the older ITU 2018
 * all-rights-reserved boilerplate. See `docs/plans.local/prop-02-948-notes.md`
 * for the verbatim statements.
 *
 * Regeneration: clone the repository at that commit, parse the `fakp(29,16,6)`,
 * `fakabp(2,6)`, `dud(5,12,5)` and `fam(14,12)` sections of each monthly
 * coefficient file in file order, concatenate months 1..12, and encode as
 * described by `P372_MANIFEST.encodings`. The manifest digests below pin the
 * result; `p372Noise.test.ts` fails if the asset and the manifest disagree.
 */

import rawCoefficients from "./p372Coefficients.json";

/** Values per month for each array, in the reference implementation's order. */
const COUNTS_PER_MONTH = {
  fakp: 6 * 16 * 29,
  fakabp: 6 * 2,
  dud: 5 * 12 * 5,
  fam: 12 * 14,
} as const;

export type P372ArrayName = keyof typeof COUNTS_PER_MONTH;

/**
 * Integrity and provenance record for the generated asset.
 *
 * `sha256` is the SHA-256 of the UTF-8 bytes of the base64 payload string for
 * that array, i.e. of exactly the characters stored in the JSON file. It is
 * checked in `p372Noise.test.ts`, so a silent edit or a truncated regeneration
 * of the asset is a failing test rather than a quietly wrong noise floor.
 */
export const P372_MANIFEST = {
  sourceRepository: "https://github.com/ITU-R-Study-Group-3/ITU-R-HF",
  sourceCommit: "cd172be56dc04b154e5d2fa91cbaa6ecf5284305",
  /** 12 monthly coefficient files, 235 275-235 276 bytes each. */
  sourceFileCount: 12,
  encodings: {
    /**
     * fakp and dud are stored as little-endian int16 scaled by `scale`. The
     * quantisation step is 1.4e-3 dB (fakp) and 5.8e-4 dB (dud); measured
     * against the double-precision reference over 4 000 random
     * month/hour/lat/lon/frequency cases this costs at most 0.013 dB of Fa
     * (mean 0.002 dB), which is three decades below the 0.5 dB fixture
     * tolerance.
     */
    int16le: ["fakp", "dud"],
    /**
     * fam and fakabp are stored as little-endian float64, i.e. bit-exact. They
     * drive a degree-6 Horner polynomial in u (up to ~2.8 at 30 MHz) whose
     * result is multiplied by the 1 MHz map value, so int16 quantisation there
     * amplified to 18 dB of Fa error in the same sweep and was rejected.
     */
    float64le: ["fam", "fakabp"],
  },
  arrays: {
    fakp: {
      count: 33408,
      sha256:
        "45f09bee8a8c072ebc62ca3eeaa1b4e26d6acb86faba1f3a6b550b11c2ba97cd",
    },
    fakabp: {
      count: 144,
      sha256:
        "3fda2a8070844edf2e1f18d0ab3166c34d6013bb06bd9a930642de5b57ad556e",
    },
    dud: {
      count: 3600,
      sha256:
        "c10f7650990b292220cdc445a978c19548458c775ba3a8b8244976ca0c1e41a2",
    },
    fam: {
      count: 2016,
      sha256:
        "b1623813ece701af8d2b4a7294a201d0a1fa925a9182b7efed70d9602721b2c9",
    },
  },
} as const;

interface RawArray {
  encoding: string;
  scale: number;
  count: number;
  base64: string;
}

interface RawCoefficients {
  sourceCommit: string;
  arrays: Record<P372ArrayName, RawArray>;
}

/** The raw base64 payload for one array, as stored in the JSON asset. */
export function p372Payload(name: P372ArrayName): string {
  return (rawCoefficients as unknown as RawCoefficients).arrays[name].base64;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decode(name: P372ArrayName): Float64Array {
  const raw = (rawCoefficients as unknown as RawCoefficients).arrays[name];
  const bytes = base64ToBytes(raw.base64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float64Array(raw.count);
  if (raw.encoding === "int16le") {
    for (let i = 0; i < raw.count; i++) {
      out[i] = view.getInt16(i * 2, true) * raw.scale;
    }
  } else if (raw.encoding === "float64le") {
    for (let i = 0; i < raw.count; i++) {
      out[i] = view.getFloat64(i * 8, true);
    }
  } else {
    throw new Error(`p372Coefficients: unknown encoding "${raw.encoding}"`);
  }
  return out;
}

export interface P372Coefficients {
  /** fakp[month][timeBlock][k][j], flattened; see `fakpAt`. */
  fakp: Float64Array;
  fakabp: Float64Array;
  dud: Float64Array;
  fam: Float64Array;
}

let cache: P372Coefficients | undefined;

/**
 * Decode the asset once per process. Decoding is ~39 000 typed-array writes and
 * takes well under a millisecond; the result is shared by every caller.
 */
export function getP372Coefficients(): P372Coefficients {
  if (!cache) {
    cache = {
      fakp: decode("fakp"),
      fakabp: decode("fakabp"),
      dud: decode("dud"),
      fam: decode("fam"),
    };
  }
  return cache;
}

/** fakp[timeBlock][k][j] for a zero-based month, k in 0..15, j in 0..28. */
export function fakpAt(
  c: P372Coefficients,
  month0: number,
  timeBlock: number,
  k: number,
  j: number,
): number {
  return c.fakp[
    month0 * COUNTS_PER_MONTH.fakp + timeBlock * 16 * 29 + k * 29 + j
  ];
}

/** fakabp[timeBlock][i] for a zero-based month, i in 0..1. */
export function fakabpAt(
  c: P372Coefficients,
  month0: number,
  timeBlock: number,
  i: number,
): number {
  return c.fakabp[month0 * COUNTS_PER_MONTH.fakabp + timeBlock * 2 + i];
}

/**
 * dud[parameter][block][k]; `block` is the time block, offset by 6 in the
 * southern hemisphere. parameter 0..4 = Du, Dl, sigma_Du, sigma_Dl, sigma_Fam.
 */
export function dudAt(
  c: P372Coefficients,
  month0: number,
  parameter: number,
  block: number,
  k: number,
): number {
  return c.dud[month0 * COUNTS_PER_MONTH.dud + parameter * 60 + block * 5 + k];
}

/** fam[block][k]; `block` is the hemisphere-offset time block, k in 0..13. */
export function famAt(
  c: P372Coefficients,
  month0: number,
  block: number,
  k: number,
): number {
  return c.fam[month0 * COUNTS_PER_MONTH.fam + block * 14 + k];
}
