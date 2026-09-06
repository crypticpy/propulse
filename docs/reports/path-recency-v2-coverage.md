# Path recency v2 — backfill coverage report

Acceptance record for issue #297 (NowCast N2), filled from the output of
`scripts/sql/path-recency-coverage.sql` after the 53-day backfill.

| Field                | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Run date (UTC)       | 2026-09-06                                                  |
| Migration applied    | `supabase/migrations/20260906210000_path_recency_v2.sql`    |
| Transform version    | `psk-rbn-field-recency-v2`                                  |
| Backfill range (UTC) | 2026-07-16T00:00 .. 2026-09-06T17:00 (script defaults)      |
| Hours processed      | 1266 of 1266 (12 empty hours before spot data began)        |
| Rows written         | 3,471,371                                                   |
| Wall clock           | 183 s                                                       |
| Table size on disk   | 863 MB incl. indexes, 1254 hours, 2026-07-16T10 .. 09-06T16 |

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

| Band      | Lookups | Lag-1 available | %         |
| --------- | ------- | --------------- | --------- |
| ALL BANDS | 3471371 | 1990190         | **57.33** |
| 160m      | 16737   | 7335            | 43.83     |
| 80m       | 102949  | 55300           | 53.72     |
| 60m       | 36530   | 15826           | 43.32     |
| 40m       | 469511  | 278136          | 59.24     |
| 30m       | 369753  | 210931          | 57.05     |
| 20m       | 984094  | 600127          | 60.98     |
| 17m       | 549492  | 313971          | 57.14     |
| 15m       | 666685  | 378044          | 56.71     |
| 12m       | 132094  | 60138           | 45.53     |
| 10m       | 143526  | 70382           | 49.04     |

Verdict: **FAIL against the 70% target** (57.33% overall; 20m best at 60.98%,
160m/60m/12m/10m in the 43-49% range). Section 4 is empty and the hand check
matches, so this is not a pipeline hole: at field grain roughly 57% of the
pairs heard in an hour were also heard the hour before. The number is the
statistic's persistence, not missing data. Escalated to the owner on #297
with the options: accept the flags as-is (absence at H-1 is informative, not
missing), widen the lag buckets, or lower the gate. No activation until
decided.

## Coverage by band x UTC hour x continent

Section 1 of the coverage SQL, summarised. Continent is derived from the
receiving field via `public.continent_for_field`. Note the expected shape:
sparse night-side rows on the high bands and thin `AN`/`OC` coverage are the
network, not a bug.

| Continent (rx) | Rows      | Bands covered | Weakest UTC hours |
| -------------- | --------- | ------------- | ----------------- |
| NA             | 1,197,086 | 10            | 08z, 09z, 07z     |
| EU             | 1,095,772 | 10            | 01z, 02z, 00z     |
| AS             | 535,162   | 10            | 00z, 23z, 01z     |
| SA             | 114,104   | 10            | 08z, 07z, 06z     |
| AF             | 289,028   | 10            | 01z, 00z, 02z     |
| OC             | 238,779   | 10            | 18z, 19z, 17z     |
| AN             | 1,440     | 5             | 17z, 18z, 19z     |

Hours present in `path_hourly_stats` but missing from `path_recency_hourly`
(section 4): **none** (0 rows).

## Hand check

One hour, one pair, recomputed straight from `path_hourly_stats` with
`scripts/sql/path-recency-handcheck.sql` and compared to the stored row.

```text
psql "$DATABASE_URL" -v hour='2026-09-05T14:00:00+00' -v band=20m -v tx=EM -v rx=FN \
  -f scripts/sql/path-recency-handcheck.sql

    source     | heard | exposure | recency_rate | digital_exposure | pair_spots | rx_spots
---------------+-------+----------+--------------+------------------+------------+----------
 hand-computed |     1 |       32 |      0.03125 |               32 |        254 |      803
 stored        |     1 |       32 |      0.03125 |               32 |        254 |      803
```

Result: exact match.
