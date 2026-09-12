# Propagation contract candidates

This is the first reviewable slice of [PROP-01 / #947](https://github.com/crypticpy/propulse/issues/947),
under [#946](https://github.com/crypticpy/propulse/issues/946). It proposes technical
designs of record with the complete M01–M24 and A01–A24 inventory and explicit
corrections. It is not ratification, independent approval, a reference port, a
qualification result, or an activation instruction. Fable design approval is
required on the actual PR head before merge and before downstream build.

- [Mathematical contract](mathematical-contract-v0.1.md): events, reference boundaries,
  corrected PSD covariance, data/selection rules and parameter origins.
- [All-band contract](all-band-contract-v0.1.md): required families including 160 m,
  phasors, passive-wave residuals, conditioning, terrain/ephemeris limits and workload scope.
- [Source/readiness ledger](source-readiness-ledger.md): provenance, ownership and blocked inputs.
- [Protocol and check commands](../../../ml/propagation_validation/README.md): versioned
  definitions, initial coverage inventory and small synthetic fixtures.

Precedence: explicit corrections/status sections above inherited specification text;
versioned protocol for machine-readable candidate gate values; ownership ledger for
verified current-main/API facts. A discrepancy requires review, not silently choosing
whichever rule passes. `normative_candidate` describes a proposed requirement,
`schematic` an incomplete construction, and `experimental` an unqualified method.
None is a capability state of `validated`.

The source documents were read from the shared scratch review directory. Their
original bytes are identified below so a later review can distinguish provenance
from scientific approval. The analytic companions were inspected as design inputs;
this slice does not claim their assertions exercise a full solver.

| Input | SHA-256 of supplied bytes |
| --- | --- |
| `PROPAGATION-MATHEMATICAL-SPECIFICATION-2026-09-10.md` | `ac20b9f1bffc5697d774f6c04586cfbc23a042b7a8b553485f8bf693fdbdd0e7` |
| `PROPAGATION-ALL-BAND-DESIGN-2026-09-10.md` | `40c2973a3fb2655de68778e6dc1def9e9e1f5815ac17f8ed5261d8176e17c893` |
| `propagation_math_companion_20260910.py` | `eefc7e883c3a791d4ccd86811a7886519583a4af211834b2fd12f5c2c7012a18` |
| `propagation_allband_math_companion_20260910.py` | `177a7048aee578b9fcaa1709d4cfc89a39272ae4051787a430c0921f613702fc` |

Existing production solvers, shared APIs, UI, N5 gates/source cuts, frozen engine
hashes, sealed months, model assets and activation files are outside this slice.
The validator never reads them. No operational corpus is included or qualified.
The PR is `Refs #947`: source/license inspection, actual benchmark acquisition,
family-specific power/calibration/comparator protocols, numerical implementations,
full repository verification and independent/Fable review remain required.
