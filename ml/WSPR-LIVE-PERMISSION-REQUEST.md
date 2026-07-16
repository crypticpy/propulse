# WSPR.live permission request

Status: draft ready to send. Recipient: `admin@wspr.live` (the contact published
on [WSPR.live](https://wspr.live/)). Record the sent date, response, and any
conditions here before enabling subscriber-facing use.

## Draft

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
streaming client used 57.6 MiB peak memory. Continuous ingest is disabled while
we confirm permission. WSPR.live would not be the only operational dependency:
an outage or stale hour makes the model fall back to its physics/weather profile
rather than retrying aggressively or fabricating data.

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
