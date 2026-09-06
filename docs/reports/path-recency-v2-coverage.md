# Path recency v2 — backfill coverage report

**Template.** Fill every `TBD` from the output of
`scripts/sql/path-recency-coverage.sql` after the 53-day backfill, then keep
this file as the acceptance record for issue #297 (NowCast N2).

| Field                | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| Run date (UTC)       | TBD                                                      |
| Migration applied    | `supabase/migrations/20260906210000_path_recency_v2.sql` |
| Transform version    | `psk-rbn-field-recency-v2`                               |
| Backfill range (UTC) | TBD `--from` .. TBD `--to`                               |
| Hours processed      | TBD of TBD                                               |
| Rows written         | TBD                                                      |
| Wall clock           | TBD                                                      |
| Table size on disk   | TBD (section 3)                                          |

## What this data is

`path_recency_hourly` is a **network-recency statistic, never a WSPR
opportunity rate**. It is derived from our own PSK Reporter / RBN spot
aggregate `path_hourly_stats`; nothing in this pipeline reads or rebuilds
anything WSPR — that pipeline was decommissioned on 2026-07-21 and stays
decommissioned.

Grain: `(hour_utc, band, tx_field, rx_field)` at 2-character Maidenhead field
resolution. Grid4 grain was measured at 1.06 spots per cell-hour, too sparse
to serve; field grain gives about five.

### Denominator (decision D1, option B, owner-confirmed)

For one `(hour, band, rx_field)`:

- `exposure` = the number of **distinct tx fields heard by any receiver in
  that rx_field** on that band-hour. It stands in for "how many transmitting
  fields a receiver sitting in `rx_field` could plausibly have logged this
  hour" — the only exposure proxy a positives-only feed allows.
- `heard` = 1 when that specific `tx_field -> rx_field` pair had at least one
  spot in the band-hour (any `mode_class`).
- `recency_rate` = `heard / exposure`.

Rows exist only for pairs that were heard, so `heard` is always 1 and
`recency_rate` is always `1 / exposure`: the magnitude is a per-receiving-field
inverse-breadth weight, and the genuinely per-pair signal is carried by the
four availability flags (was the pair present at H-1 / H-2 / H-3 / H-24). A
busy receiving field dilutes every path into it. The typed columns
`digital_heard`, `digital_exposure`, `spots`, and `rx_spots` are on every row, so
a digital-only rate or a spot-share rate can be derived in N3 **without
re-running this backfill**.

The served values are not comparable in level to the WSPR-trained feature.
Per-band-hour quantile normalisation in the N3 retrain is what makes the two
commensurable; the provider stays inactive
(`PROPULSE_PATH_HISTORY_PROVIDER=unavailable`) until N4.

## Acceptance gate — lag-1 availability

Section 2 of the coverage SQL. Over every `(band, hour, active field pair)` —
"active" meaning the pair had at least one spot in `path_hourly_stats` that
hour — what fraction had a readable lag-1 row.

**Target: >= 70%.**

| Band      | Lookups | Lag-1 available | %       |
| --------- | ------- | --------------- | ------- |
| ALL BANDS | TBD     | TBD             | **TBD** |
| 160m      | TBD     | TBD             | TBD     |
| 80m       | TBD     | TBD             | TBD     |
| 60m       | TBD     | TBD             | TBD     |
| 40m       | TBD     | TBD             | TBD     |
| 30m       | TBD     | TBD             | TBD     |
| 20m       | TBD     | TBD             | TBD     |
| 17m       | TBD     | TBD             | TBD     |
| 15m       | TBD     | TBD             | TBD     |
| 12m       | TBD     | TBD             | TBD     |
| 10m       | TBD     | TBD             | TBD     |

Verdict: TBD (pass / fail, and what happens next if it fails).

## Coverage by band x UTC hour x continent

Section 1 of the coverage SQL, summarised. Continent is derived from the
receiving field via `public.continent_for_field`. Note the expected shape:
sparse night-side rows on the high bands and thin `AN`/`OC` coverage are the
network, not a bug.

| Continent (rx) | Rows | Bands covered | Weakest UTC hours |
| -------------- | ---- | ------------- | ----------------- |
| NA             | TBD  | TBD           | TBD               |
| EU             | TBD  | TBD           | TBD               |
| AS             | TBD  | TBD           | TBD               |
| SA             | TBD  | TBD           | TBD               |
| AF             | TBD  | TBD           | TBD               |
| OC             | TBD  | TBD           | TBD               |
| AN             | TBD  | TBD           | TBD               |

Hours present in `path_hourly_stats` but missing from `path_recency_hourly`
(section 4): TBD — this should be empty; anything listed needs a targeted
re-run of `scripts/backfill-path-recency.mjs --from ... --to ...`.

## Hand check

One hour, one pair, recomputed straight from `path_hourly_stats` with
`scripts/sql/path-recency-handcheck.sql` and compared to the stored row.

```text
psql "$DATABASE_URL" -v hour='TBD' -v band=TBD -v tx=TBD -v rx=TBD \
  -f scripts/sql/path-recency-handcheck.sql

TBD (paste the two-row output; hand-computed and stored must match)
```

Result: TBD.
