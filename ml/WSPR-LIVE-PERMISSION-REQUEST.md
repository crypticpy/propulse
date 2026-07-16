# WSPR.live permission request

Status: draft ready to send. Recipient: `admin@wspr.live` (the contact published
on [WSPR.live](https://wspr.live/)). Record the sent date, response, and any
conditions here before enabling subscriber-facing use.

## Exact request

Send [`WSPR-LIVE-PERMISSION-EMAIL.txt`](WSPR-LIVE-PERMISSION-EMAIL.txt)
unchanged. That standalone file is the immutable request hashed by the release
validator. The rendering below is retained for review.

Subject: Permission request for nonprofit Propulse propagation research

Hello,

I am requesting written permission to use the WSPR.live read-only ClickHouse
service in Propulse, an open-source amateur-radio propagation research project.
Propulse is operated as a nonprofit. Its propagation model, training method,
aggregate research results, and core prediction engine are published free of
charge. Optional registration, virtual-shack, equipment-sharing, and content
features are donation/subscription supported to cover operating costs; the
project is not operated for profit.

The proposed WSPR.live use is:

- one GET query per completed UTC hour, normally after a ten-minute settlement
  delay;
- one exact one-hour time predicate covering the ten HF bands, with no joins;
- archive-matching validity filters for grids, callsigns, power, and SNR;
- a descriptive Propulse Research user agent and immediate backoff on errors;
- private rolling storage of spot IDs, callsigns, grid locators, event time,
  receipt time, power, and SNR for at most 30 hours;
- conversion into aggregate grid-to-grid hourly path features; no raw WSPR.live
  rows, callsigns, or station-level data are exposed or redistributed;
- identity-free model outputs and aggregate open research only; and
- explicit WSPR.live/WSPRnet/contributing-station attribution.

A read-only compatibility test on 2026-07-16 queried one settled hour in one
request and returned 287,694 valid HF rows. It took 23.1 seconds and the
streaming client used 57.6 MiB peak memory. A private, research-only 30-day
receipt audit began afterward under the same one-request-per-hour, bounded
retention, and identity-free-output limits. It is not exposed to subscribers
and cannot enable the learned model while permission is unresolved. WSPR.live
would not be the only operational dependency: an outage or stale hour makes
the model fall back to its physics/weather profile rather than retrying
aggressively or fabricating data.

Would you permit this internal research/shadow use and eventual
subscriber-facing nonprofit use under those limits? Please also let us know if
you prefer a different query interval, settlement delay, retention period,
attribution, contact user agent, or other condition. We will record and enforce
any conditions in the public repository.

Repository: https://github.com/crypticpy/propulse

Thank you.

## Authorization record

| Field | Value |
|---|---|
| Sent at (UTC) | pending |
| Sender | pending |
| Response at (UTC) | pending |
| Decision | pending |
| Allowed roles | pending |
| Query/rate conditions | pending |
| Retention conditions | pending |
| Attribution conditions | pending |
| Response archive/checksum | pending; keep private correspondence out of Git |

Do not place private email contents or credentials in this repository. Record a
short permission decision and checksum/reference to the privately retained
message.

## Machine-verifiable release receipt

The public terms allow non-profit-oriented research/projects whose results stay
free, but that language does not unambiguously cover personalized features in a
donation/subscription-supported product. Public terms alone therefore cannot
open the subscriber gate. The exact request above must be sent and the service
operator must explicitly approve both `internal_research` and
`subscriber_recent_path_features` under the listed limits.

Keep the reply, a snapshot of `https://wspr.live/`, and the authorization input
outside the repository in an owner-only directory. Start from
[`config/wspr_live_authorization_input.example.json`](config/wspr_live_authorization_input.example.json),
record the exact email-file SHA-256 and reply SHA-256 rather than message contents,
and preserve the complete reply headers. Capture the public page directly rather
than copying rendered text:

```bash
mkdir -p "$PROPULSE_AUTH_DIR"
chmod 700 "$PROPULSE_AUTH_DIR"
curl --fail --silent --show-error --location https://wspr.live/ \
  --output "$PROPULSE_AUTH_DIR/wspr-live-terms.html"
shasum -a 256 ml/WSPR-LIVE-PERMISSION-EMAIL.txt \
  "$PROPULSE_AUTH_DIR/wspr-live-terms.html"
ml/.venv/bin/python ml/src/archive_v4_2/prepare_wspr_permission_request.py \
  --profile m5 \
  --public-terms-snapshot "$PROPULSE_AUTH_DIR/wspr-live-terms.html"
```

The preparation receipt must say `prepared_not_sent`, `email_sent: false`, and
`subscriber_facing_authorized: false`; it does not open a release gate. After a
reply arrives, save the complete message and headers as
`wspr-live-reply.eml`, verify the sender independently, hash it with
`shasum -a 256`, and record the hashes plus offset-qualified UTC timestamps in
the private input. Then run the validator on the M5:

```bash
chmod 600 "$PROPULSE_AUTH_DIR/wspr-live-authorization.json"
ml/.venv/bin/python ml/src/archive_v4_2/validate_wspr_source_authorization.py \
  --profile m5 \
  --authorization-input "$PROPULSE_AUTH_DIR/wspr-live-authorization.json" \
  --public-terms-snapshot "$PROPULSE_AUTH_DIR/wspr-live-terms.html"
```

The validator fails closed on proposal drift, a mismatched terms snapshot,
changed terms content, expired or non-operator approval, altered conditions,
extra fields, malformed types, non-M5 execution, or any authorization scope
short of the two required roles. Its repository-safe output contains hashes and
decisions only; it never copies the correspondence. The receipt is an auditable
operator attestation bound to privately retained evidence, not cryptographic
proof that the email sender controls WSPR.live; independently verify the sender
and retain complete headers before recording `service_operator` approval.
