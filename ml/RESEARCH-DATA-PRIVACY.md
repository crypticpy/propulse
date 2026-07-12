# Propulse ML Research Data, Consent, and Privacy Contract

> Status: V4 preregistration policy, 2026-07-12. This engineering policy must
> receive organizational/legal review before public beta; it is not legal advice.

## Principles

1. The open propagation core does not use callsigns, user IDs, exact home
   coordinates, raw shack inventories, credentials, or private messages as
   prediction features.
2. Public-network observations and private Propulse operator outcomes are
   separate datasets with separate provenance and permitted uses.
3. A displayed prediction is not a failed attempt. Only a declared or
   objectively observed attempt can receive a success/failure outcome.
4. Research participation is opt-in, versioned, revocable, and independent of
   paid/donation status. Refusing research consent cannot reduce core service.
5. Public artifacts contain aggregate evidence with coarse geography and
   minimum cohort sizes, never station-level rows.

## Data classes

| Class | Examples | Default handling |
|---|---|---|
| Public upstream observation | WSPR, RBN, PSK Reporter | Preserve source terms; raw data ignored; publish hashes/aggregate results only |
| Private operational profile | Exact QTH, station chain, equipment serial/notes | RLS-protected; derive a bounded feature envelope for inference; never public |
| Research-consented derived profile | Coarse EIRP/noise/mode bands, chain fingerprint | Opt-in only; pseudonymous; minimum-support aggregation |
| Attempt/outcome | Attempt start, band/mode, success/failure, evidence grade | Opt-in; link only to prediction/model version and coarse path |
| Credential/secret | API keys, passwords, Bridge credentials | Never enters ML storage, logs, manifests, or research exports |

## Consent record

`ml_research_consents` must store policy version, allowed uses, granted time,
withdrawn time, retention acknowledgement, and the user responsible. Consent is
not inferred from accepting product terms or from equipment synchronization.

Allowed uses are independently selectable:

- anonymous quality metrics;
- model training on derived equipment features;
- model training on attempt/outcome data;
- contact for research follow-up.

## Location and equipment minimization

- Use grid4/coarser geography for shared caches and research aggregates unless
  a private path request needs greater precision.
- Compute station-chain envelopes locally or in a private authenticated service.
- Do not send equipment names, notes, photos, serials, or full inventories to
  the open inference core.
- Use a versioned, salted chain fingerprint for cache invalidation; never use it
  as a public identity or a memorized model feature.

## Retention and withdrawal

- Raw operational prediction logs: 90 days unless an incident requires a
  documented hold.
- Consented derived training snapshots: retain by model-version manifest; stop
  including them in future training after withdrawal.
- Attempts/outcomes: retain while consent is active, then delete or irreversibly
  aggregate according to the reviewed deletion workflow.
- Published aggregate research cannot be retracted from already released model
  versions, which must be stated before consent.

## Publication thresholds

- No public cell contains fewer than 20 distinct consenting operators.
- Public geography is grid4 or coarser and timestamps are hourly or coarser.
- Suppress slices that could be combined to identify one station.
- Synthetic shack fixtures, not real user records, are used in screenshots and
  equipment explainers.

## Security and verification

- Supabase RLS isolates each user's consent, prediction, attempt, outcome, and
  surface cache rows.
- Service-role ingestion is inaccessible to browser clients.
- Logs exclude request bodies containing station envelopes and exact QTH.
- Automated privacy tests assert that public responses and shared cache keys do
  not contain user IDs, callsigns, exact coordinates, or raw equipment JSON.
- A documented incident process suspends outcome collection and training export
  on any suspected privacy leak.
