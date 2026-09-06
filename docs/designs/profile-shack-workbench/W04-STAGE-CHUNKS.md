# W04 deterministic stage chunks

Tracking: [W04 / #177](https://github.com/crypticpy/propulse/issues/177), under [parent #173](https://github.com/crypticpy/propulse/issues/173). This implements pure chunk planning and verification for the inactive staging work in [W04 remaining storage gates](W04-NEXT-STORAGE-GATES.md). It does not persist or activate a generation.

## Implemented APIs

[stageChunks.ts](../../../src/lib/station/workbench/storage/stageChunks.ts) exports:

- `prepareStationStageChunks({ stageId, candidate })`: verify a detached `StationGenerationCandidate`, then return a deeply frozen `{ plan, payloads }`.
- `verifyStationStageChunks(bundle)`: validate and reassemble the supplied chunks, verify the reconstructed candidate, and return that deeply frozen candidate.
- Strict standalone parser facades `stationStageChunkPlanSchema`, `stationStageChunkPayloadSchema`, `stationStageChunksSchema`, the corresponding types inferred from private schemas, and `STATION_STAGE_CHUNK_BYTES`.

The frozen facades expose `parse(input)` and `safeParse(input)` only; they are not composable Zod schema objects. `parse` returns detached typed data or throws a structured Zod validation error; `safeParse` returns the usual discriminated success/data or failure/error result. Descriptor and primitive checks run outside Zod, before its type detection could inspect `then`/`catch` accessors on untrusted input. This guarantee applies to these direct entry points, not to wrapping them in another validator that inspects input first.

Parsers check structural content; the async helpers establish digest and cross-record binding. Planning validates the request wrapper through own property descriptors, allowing only enumerable data properties `stageId` and `candidate` on a plain or null-prototype object. Accessors, hidden fields, symbols and custom prototypes reject. The candidate is detached before the first asynchronous verification step.

## Plan and payload bindings

The version-1 plan contains owner/stage/generation identities, nullable source generation, candidate `sealDigest`, full `candidateDigest`, `encoding: "canonical-workbench-json-utf8"`, `chunkByteLimit: 262144`, total `byteLength`, ordered `{ ordinal, byteLength, digest }` descriptors and `planDigest`.

Each payload contains `{ ownerId, stageId, generationId, planDigest, ordinal, bytesBase64 }`. Plan descriptors must have contiguous ordinals; payloads may arrive in any order but must provide exact unique coverage. Missing, extra, duplicate or differently bound payloads reject.

Chunk digests are SHA-256 over raw chunk bytes. `candidateDigest` hashes the complete canonical candidate bytes. `planDigest` hashes the canonical plan header without its own digest field. Verification recomputes all three, checks owner/generation/source-generation/seal bindings against the reconstructed candidate, and reruns `verifyStationGeneration()`.

Stage identity is caller-supplied. These bindings do not prove a stored stage is unused: collision detection and permanent stage/generation ownership still belong to the future durable repository.

## Canonical byte policy and preservation

The planner encodes the entire verified candidate with `canonicalWorkbenchJson()` and UTF-8, then splits it into fixed 256 KiB payloads, except for the final shorter payload.

Before canonical serialization/detachment of an untrusted bundle, a descriptor-only preflight checks exact wrapper/plan/payload fields and scalar metadata. Both array cardinalities must match the declared byte length before either inventory is enumerated; huge inconsistent sparse arrays therefore reject immediately. Dense data-only elements, bounded base64 length/padding, unique ordinals, scope bindings and aggregate encoded/decoded lengths are checked before copying the captured structure into canonical JSON. Standalone plan and payload parsers use the same preflight boundaries. No getters are invoked.

Base64 decoding and full candidate reassembly happen only after those checks. Exact payload inventory and actual lengths are verified before allocating the joined candidate buffer.

Reassembly joins bytes before strict UTF-8 decoding, preserving multibyte characters split at a chunk boundary. The decoded JSON must reproduce exactly the same canonical bytes. Duplicate JSON keys, added whitespace, a leading byte-order mark and other alternate encodings reject even if their transport hashes have been recomputed.

This retains supplied archive collection order, manifest record order, nested arrays, raw recovery payloads, source mappings, media observations, zero/false/null, literal reserved keys and escaped lone UTF-16 surrogates. The candidate keeps its full 128-container depth allowance; the planning wrapper adds no depth charge. There is no Unicode normalization.

Canonical candidate bytes are **not original external backup bytes**. Backup references, encodings and digests remain provenance metadata, and candidate seals retain `legacyCutoverAuthorized: false` and `externalArtifactsVerified: false`.

Memory remains **O(full candidate)**. The preflight rejects inconsistent inventories and oversized individual payloads before full copying; it does not impose a total byte/chunk cap or narrow the existing opaque-ID domain. Consistent large candidates retain the existing behavior. The chunk limit bounds each encoded payload and eventual write size; it does not bound total verification memory, provide streaming verification, or guarantee browser quota.

## Verification and remaining gates

The [92 focused tests](../../../src/lib/station/workbench/storage/stageChunks.test.ts) pass, as does scoped ESLint. Reproduce the tests with:

```sh
./node_modules/.bin/vitest run src/lib/station/workbench/storage/stageChunks.test.ts
```

Coverage includes deterministic/order-sensitive round trips, new-empty seals, oversized raw records, split Unicode, reserved keys and unknown values, exact depth boundaries, malformed wrappers without getter invocation, asynchronous caller mutation, scope/digest mismatches, inventory errors, invalid base64, noncanonical JSON with recomputed hashes and forged authorization flags. Spies additionally establish that inconsistent/oversized inputs, huge sparse inventories and unsafe shallow structures reject before canonical serialization or decoding. Outer parser and nested scalar `then`/`catch` accessors remain uninvoked; structured failures, frozen parser facades and detached successes are covered. Final CI, browser and delivery evidence will be recorded separately; this checkpoint makes no browser or deployment claim.

No IndexedDB writes, completion markers, record materialization, sender, external artifact checks or activation API are implemented here. Durable staging must bind an immutable stage plan, write chunks and markers atomically, reread and verify complete coverage, and compare that exact audited state inside the sealing transaction. If it materializes canonical records, heads or recovery rows, it must separately prove their full coverage against the verified candidate. Complete byte chunks alone do not establish complete materialization or authorize legacy replacement.
