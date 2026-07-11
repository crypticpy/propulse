"""Validate Madrigal data against our own collector for an overlapping day.

Checks:
1. Source (ssrc) + mode composition of the Madrigal day — is RBN in there?
2. Digital path-hour cells: overlap/coverage both directions, spot-count
   correlation, per-cell median SNR agreement (our PSKReporter rows carry
   grids natively, so no backfill asymmetry on the digital slice).
3. CW volume comparison (ours is RBN-dominated; Madrigal's CW content tells
   us whether RBN made it into their merge).
"""

import sys
import time

import duckdb

DAY = sys.argv[1] if len(sys.argv) > 1 else "2026-03-01"
MAD = f"ml/data/processed/madrigal/{DAY}.parquet"
OURS = "ml/data/processed/spots_slim.parquet"
DIGITAL = ("'FT8','FT4','FT2','JS8','VARAC','WSPR','RTTY','FREEDV','PKT',"
           "'DATA','OLIVIA','JT65','JT9','MSK144','Q65','FST4','FST4W'")

con = duckdb.connect()
con.execute("SET TimeZone='UTC'")
t0 = time.time()


def log(msg):
    print(f"[{time.time() - t0:5.0f}s] {msg}", flush=True)


log(f"=== Madrigal {DAY} composition ===")
for row in con.execute(f"""
    SELECT ssrc, mode_class, count(*) n, round(avg(snr),1) avg_snr,
           count(DISTINCT tx_callsign) tx_calls
    FROM '{MAD}' GROUP BY 1,2 ORDER BY n DESC
""").fetchall():
    log(f"  ssrc={row[0]!r} {row[1]}: {row[2]:,} spots, avg_snr={row[3]}, "
        f"{row[4]:,} tx calls")

log("=== ours same day composition ===")
for row in con.execute(f"""
    SELECT source,
           CASE WHEN mode='CW' THEN 'cw'
                WHEN mode IN ({DIGITAL}) THEN 'digital' END mc,
           count(*) n, count(tx_field) with_grid
    FROM '{OURS}'
    WHERE hour_utc >= '{DAY}' AND hour_utc < TIMESTAMP '{DAY}' + INTERVAL 1 DAY
    GROUP BY 1,2 ORDER BY n DESC
""").fetchall():
    log(f"  source={row[0]} {row[1]}: {row[2]:,} spots ({row[3]:,} with grid)")

log("=== digital cell cross-check ===")
con.execute(f"""
    CREATE TEMP TABLE mad_cells AS
    SELECT hour_utc, band, tx_field, rx_field,
           count(*) n, median(snr) med_snr
    FROM '{MAD}' WHERE mode_class = 'digital'
    GROUP BY 1,2,3,4
""")
con.execute(f"""
    CREATE TEMP TABLE our_cells AS
    SELECT hour_utc, band, tx_field, rx_field,
           count(*) n, median(snr) med_snr
    FROM '{OURS}'
    WHERE hour_utc >= '{DAY}' AND hour_utc < TIMESTAMP '{DAY}' + INTERVAL 1 DAY
      AND mode IN ({DIGITAL})
      AND tx_field IS NOT NULL AND rx_field IS NOT NULL
    GROUP BY 1,2,3,4
""")
m_cells, o_cells = (con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
                    for t in ("mad_cells", "our_cells"))
log(f"  digital cells: madrigal {m_cells:,} | ours {o_cells:,}")

both, ours_only, mad_only, corr, snr_corr, snr_mae = con.execute("""
    WITH j AS (
        SELECT m.n m_n, o.n o_n, m.med_snr m_snr, o.med_snr o_snr,
               (m.n IS NOT NULL AND o.n IS NOT NULL) AS in_both
        FROM mad_cells m FULL OUTER JOIN our_cells o USING (hour_utc, band, tx_field, rx_field)
    )
    SELECT sum(CASE WHEN in_both THEN 1 ELSE 0 END),
           sum(CASE WHEN m_n IS NULL THEN 1 ELSE 0 END),
           sum(CASE WHEN o_n IS NULL THEN 1 ELSE 0 END),
           corr(ln(1 + m_n), ln(1 + o_n)) FILTER (WHERE in_both),
           corr(m_snr, o_snr) FILTER (WHERE in_both),
           avg(abs(m_snr - o_snr)) FILTER (WHERE in_both)
    FROM j
""").fetchone()
log(f"  shared cells: {both:,} | ours-only {ours_only:,} | madrigal-only {mad_only:,}")
log(f"  our-cell coverage by madrigal: {both/(both+ours_only):.1%}")
log(f"  log-count corr on shared: {corr:.3f}")
log(f"  median-SNR corr: {snr_corr:.3f}, MAE {snr_mae:.2f} dB")

log("=== CW volume ===")
mad_cw = con.execute(f"SELECT count(*) FROM '{MAD}' WHERE mode_class='cw'").fetchone()[0]
our_cw = con.execute(f"""
    SELECT count(*) FROM '{OURS}'
    WHERE hour_utc >= '{DAY}' AND hour_utc < TIMESTAMP '{DAY}' + INTERVAL 1 DAY
      AND mode = 'CW'
""").fetchone()[0]
log(f"  madrigal cw: {mad_cw:,} | ours (RBN-fed): {our_cw:,} "
    f"-> ratio {mad_cw/max(our_cw,1):.2f}")
log("done")
