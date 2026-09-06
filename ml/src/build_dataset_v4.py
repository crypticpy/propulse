"""v4: mode-aware path-hour training table.

Differences vs v3 (build_dataset.py):
 - every cell carries a mode_class dimension (cw | digital | phone)
 - rx/tx activity conditioning is mode-class-specific (RBN skimmers hear CW,
   PSKReporter monitors hear digital — different receiver networks)
 - cross-mode lag feature: activity on the same path for the *other* mode class
 - lag windows partition by (pair, band, mode_class)

Output: ml/data/processed/train_cells_v4.parquet
"""

import math
import time

import duckdb
import numpy as np
import pandas as pd

SPOTS = "ml/data/processed/spots_slim.parquet"
SOLAR = "ml/data/raw/solar_snapshots.csv"
CENTROIDS = "ml/data/processed/field_centroids.parquet"
OUT = "ml/data/processed/train_cells_v4.parquet"

TRAIN_END = "2026-03-23"
MIN_PAIR_SPOTS = 300
DOMINANT_FIELD_FRAC = 0.8
MAX_CELLS = 30_000_000

DIGITAL = "'FT8','FT4','FT2','JS8','VARAC','WSPR','RTTY','FREEDV','PKT','DATA','OLIVIA','JT65','JT9','MSK144','Q65','FST4','FST4W','DIGITAL','DIG','DIGI','PSK','PSK31','PSK63','MFSK'"
PHONE = "'USB','LSB','SSB','AM','FM','PHONE','VOICE','DV','DSTAR','DMR','C4FM'"

t0 = time.time()
con = duckdb.connect()
con.execute("SET TimeZone='UTC'")
con.execute("SET memory_limit='20GB'")
con.execute("SET threads=10")
con.execute("SET preserve_insertion_order=false")
con.execute("SET temp_directory='ml/data/processed/duckdb_tmp'")


def log(msg):
    print(f"[{time.time() - t0:6.0f}s] {msg}", flush=True)


# ---------------------------------------------------------------- callsign map
con.execute(
    f"""
    CREATE TEMP TABLE call_field AS
    WITH sightings AS (
        SELECT tx_callsign AS callsign, tx_field AS field, count(*) AS n
        FROM '{SPOTS}' WHERE tx_field IS NOT NULL GROUP BY 1, 2
        UNION ALL
        SELECT rx_callsign, rx_field, count(*)
        FROM '{SPOTS}' WHERE rx_field IS NOT NULL GROUP BY 1, 2
    ),
    per_call AS (
        SELECT callsign, field, sum(n) AS n,
               sum(sum(n)) OVER (PARTITION BY callsign) AS total
        FROM sightings GROUP BY 1, 2
    )
    SELECT callsign, field
    FROM per_call
    QUALIFY row_number() OVER (PARTITION BY callsign ORDER BY n DESC) = 1
        AND n / total >= {DOMINANT_FIELD_FRAC}
    """
)
log(f"callsign map: {con.execute('SELECT count(*) FROM call_field').fetchone()[0]:,} callsigns")

# ------------------------------------------------------- backfilled spot view
con.execute(
    f"""
    CREATE TEMP VIEW spots AS
    SELECT * FROM (
        SELECT
            s.hour_utc, s.band, s.snr,
            -- PSK*: any PSKn variant (PSK, PSK31, PSK63, PSK125, ...) counts as
            -- digital, mirroring public.mode_class_of()'s regexp_matches predicate.
            CASE WHEN upper(s.mode) = 'CW' THEN 'cw'
                 WHEN upper(s.mode) IN ({DIGITAL})
                      OR regexp_matches(upper(s.mode), '^PSK[0-9]*$') THEN 'digital'
                 WHEN upper(s.mode) IN ({PHONE}) THEN 'phone'
            END AS mode_class,
            coalesce(s.tx_field, ct.field) AS tx_field,
            coalesce(s.rx_field, cr.field) AS rx_field
        FROM '{SPOTS}' s
        LEFT JOIN call_field ct ON ct.callsign = s.tx_callsign
        LEFT JOIN call_field cr ON cr.callsign = s.rx_callsign
    )
    WHERE tx_field IS NOT NULL AND rx_field IS NOT NULL AND mode_class IS NOT NULL
    """
)
stats = con.execute(
    "SELECT count(*), count(*) FILTER (mode_class='cw') FROM spots"
).fetchone()
log(f"usable path spots: {stats[0]:,} (cw: {stats[1]:,})")

# ------------------------------------------------------------------ positives
con.execute(
    """
    CREATE TEMP TABLE pos AS
    SELECT hour_utc, band, mode_class, tx_field, rx_field,
           count(*) AS spot_count,
           median(snr) AS median_snr
    FROM spots GROUP BY 1, 2, 3, 4, 5
    """
)
log(f"positive cells: {con.execute('SELECT count(*) FROM pos').fetchone()[0]:,}")

# pos summed across all mode classes for a (hour, band, path) key - one row
# per key, so the join below can never fan out a `cells` row. Used to derive
# xmode_path_prev1 (activity on the *other* mode class(es)) as
# total-for-all-classes minus this-cell's-own-class (already available via
# the p1 join), which reproduces the exact two-class semantics ("the other
# class's count") now that there are three classes and a plain
# mode_class != c.mode_class join would match 2 rows and duplicate the cell.
con.execute(
    """
    CREATE TEMP TABLE pos_total AS
    SELECT hour_utc, band, tx_field, rx_field, sum(spot_count) AS spot_count
    FROM pos GROUP BY 1, 2, 3, 4
    """
)

# ---------------------------------------------------------------- pair universe
con.execute(
    f"""
    CREATE TEMP TABLE pairs AS
    SELECT tx_field, rx_field, count(*) AS pair_spots
    FROM spots
    WHERE hour_utc < TIMESTAMPTZ '{TRAIN_END}'
    GROUP BY 1, 2
    HAVING count(*) >= {MIN_PAIR_SPOTS}
    """
)
log(f"pair universe: {con.execute('SELECT count(*) FROM pairs').fetchone()[0]:,} pairs")

# --------------------------------------- region activity/hour per mode class
con.execute(
    """
    CREATE TEMP TABLE tx_active AS
    SELECT hour_utc, mode_class, tx_field AS field, count(*) AS tx_spots
    FROM spots GROUP BY 1, 2, 3;
    """
)
con.execute(
    """
    CREATE TEMP TABLE rx_active AS
    SELECT hour_utc, mode_class, rx_field AS field, count(*) AS rx_spots
    FROM spots GROUP BY 1, 2, 3;
    """
)

# ------------------------------------------------- per-band region activity
con.execute(
    """
    CREATE TEMP TABLE tx_band_act AS
    SELECT hour_utc, tx_field AS field, band, count(*) AS n
    FROM spots GROUP BY 1, 2, 3;
    """
)
con.execute(
    """
    CREATE TEMP TABLE rx_band_act AS
    SELECT hour_utc, rx_field AS field, band, count(*) AS n
    FROM spots GROUP BY 1, 2, 3;
    """
)

adj_rows = []
for lo in range(18):
    for la in range(18):
        f = chr(65 + lo) + chr(65 + la)
        for dlo in (-1, 0, 1):
            for dla in (-1, 0, 1):
                if dlo == 0 and dla == 0:
                    continue
                nla = la + dla
                if not 0 <= nla <= 17:
                    continue
                nf = chr(65 + (lo + dlo) % 18) + chr(65 + nla)
                adj_rows.append((f, nf))
con.execute("CREATE TEMP TABLE adjacency (field VARCHAR, neighbor VARCHAR)")
con.executemany("INSERT INTO adjacency VALUES (?, ?)", adj_rows)
con.execute(
    """
    CREATE TEMP TABLE tx_nbr_act AS
    SELECT a.field, t.band, t.hour_utc, sum(t.n) AS n
    FROM tx_band_act t JOIN adjacency a ON a.neighbor = t.field
    GROUP BY 1, 2, 3
    """
)
con.execute(
    """
    CREATE TEMP TABLE rx_nbr_act AS
    SELECT a.field, t.band, t.hour_utc, sum(t.n) AS n
    FROM rx_band_act t JOIN adjacency a ON a.neighbor = t.field
    GROUP BY 1, 2, 3
    """
)
log("activity + neighbor tables built")

# ----------------------------------------------------------------- solar hourly
con.execute(
    f"""
    CREATE TEMP TABLE solar AS
    SELECT date_trunc('hour', captured_at) AS hour_utc,
           avg(kp_index) AS kp, avg(sfi) AS sfi, avg(bz_gsm) AS bz,
           avg(by_gsm) AS by, avg(bt) AS bt,
           avg(solar_wind_speed) AS wind_speed,
           avg(xray_flux) AS xray, avg(dst_index) AS dst,
           avg(proton_flux_10mev) AS proton
    FROM read_csv('{SOLAR}', delim='\t', header=false, skip=1, nullstr='\\N',
        columns={{'id':'BIGINT','captured_at':'TIMESTAMPTZ','kp_index':'DOUBLE',
                 'sfi':'DOUBLE','bz_gsm':'DOUBLE','by_gsm':'DOUBLE','bt':'DOUBLE',
                 'solar_wind_speed':'DOUBLE','sunspot_number':'DOUBLE','xray_flux':'DOUBLE',
                 'proton_flux_10mev':'DOUBLE','dst_index':'DOUBLE','solar_wind_density':'DOUBLE'}})
    GROUP BY 1
    """
)
con.execute(
    """
    CREATE OR REPLACE TEMP TABLE solar AS
    SELECT *,
        kp - lag(kp, 3) OVER w AS kp_delta_3h,
        max(kp) OVER (w ROWS BETWEEN 24 PRECEDING AND 1 PRECEDING) AS kp_max_24h,
        min(bz) OVER (w ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS bz_min_3h,
        max(xray) OVER (w ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS xray_max_6h
    FROM solar
    WINDOW w AS (ORDER BY hour_utc)
    """
)
log(f"solar hours: {con.execute('SELECT count(*) FROM solar').fetchone()[0]:,}")

# ------------------------------------------------------------- candidate cells
BANDS = "'160m','80m','60m','40m','30m','20m','17m','15m','12m','10m','6m'"
con.execute(
    f"""
    CREATE TEMP TABLE cells AS
    SELECT
        ta.hour_utc,
        b.band,
        ta.mode_class,
        p.tx_field, p.rx_field,
        coalesce(pos.spot_count, 0) AS spot_count,
        pos.median_snr,
        (pos.spot_count IS NOT NULL)::INT AS open,
        ta.tx_spots, ra.rx_spots
    FROM pairs p
    JOIN tx_active ta ON ta.field = p.tx_field
    JOIN rx_active ra ON ra.field = p.rx_field AND ra.hour_utc = ta.hour_utc
        AND ra.mode_class = ta.mode_class
    CROSS JOIN (SELECT unnest([{BANDS}]) AS band) b
    LEFT JOIN pos ON pos.hour_utc = ta.hour_utc AND pos.band = b.band
                 AND pos.mode_class = ta.mode_class
                 AND pos.tx_field = p.tx_field AND pos.rx_field = p.rx_field
    """
)
n_cells, n_open = con.execute("SELECT count(*), sum(open) FROM cells").fetchone()
log(f"candidate cells: {n_cells:,} | open: {n_open:,} ({n_open / n_cells:.1%})")

# ---------------------------------------------------- temporal lag features
con.execute(
    """
    CREATE OR REPLACE TEMP TABLE cells AS
    SELECT
        c.*,
        coalesce(p1.spot_count, 0) AS path_prev1,
        coalesce(p24.spot_count, 0) AS path_prev24,
        coalesce(pxt.spot_count, 0) - coalesce(p1.spot_count, 0) AS xmode_path_prev1,
        coalesce(pr.spot_count, 0) AS rev_path_prev1,
        coalesce(tba.n, 0) AS tx_band_prev1,
        coalesce(rba.n, 0) AS rx_band_prev1,
        coalesce(tna.n, 0) AS tx_nbr_prev1,
        coalesce(rna.n, 0) AS rx_nbr_prev1,
        coalesce(
            sum(c.spot_count) OVER (
                wpath RANGE BETWEEN INTERVAL 3 HOURS PRECEDING
                            AND INTERVAL 1 HOUR PRECEDING), 0) AS path_prev3h,
        avg(c.open) OVER (
            wpath RANGE BETWEEN INTERVAL 168 HOURS PRECEDING
                        AND INTERVAL 1 HOUR PRECEDING) AS path_open_rate_7d
    FROM cells c
    LEFT JOIN pos p1 ON p1.hour_utc = c.hour_utc - INTERVAL 1 HOUR
        AND p1.band = c.band AND p1.mode_class = c.mode_class
        AND p1.tx_field = c.tx_field AND p1.rx_field = c.rx_field
    LEFT JOIN pos p24 ON p24.hour_utc = c.hour_utc - INTERVAL 24 HOUR
        AND p24.band = c.band AND p24.mode_class = c.mode_class
        AND p24.tx_field = c.tx_field AND p24.rx_field = c.rx_field
    LEFT JOIN pos_total pxt ON pxt.hour_utc = c.hour_utc - INTERVAL 1 HOUR
        AND pxt.band = c.band
        AND pxt.tx_field = c.tx_field AND pxt.rx_field = c.rx_field
    LEFT JOIN pos pr ON pr.hour_utc = c.hour_utc - INTERVAL 1 HOUR
        AND pr.band = c.band AND pr.mode_class = c.mode_class
        AND pr.tx_field = c.rx_field AND pr.rx_field = c.tx_field
    LEFT JOIN tx_band_act tba ON tba.hour_utc = c.hour_utc - INTERVAL 1 HOUR
        AND tba.field = c.tx_field AND tba.band = c.band
    LEFT JOIN rx_band_act rba ON rba.hour_utc = c.hour_utc - INTERVAL 1 HOUR
        AND rba.field = c.rx_field AND rba.band = c.band
    LEFT JOIN tx_nbr_act tna ON tna.hour_utc = c.hour_utc - INTERVAL 1 HOUR
        AND tna.field = c.tx_field AND tna.band = c.band
    LEFT JOIN rx_nbr_act rna ON rna.hour_utc = c.hour_utc - INTERVAL 1 HOUR
        AND rna.field = c.rx_field AND rna.band = c.band
    WINDOW wpath AS (
        PARTITION BY c.tx_field, c.rx_field, c.band, c.mode_class
        ORDER BY c.hour_utc)
    """
)
log("lag features attached")

n_cells, n_open = con.execute("SELECT count(*), sum(open) FROM cells").fetchone()
con.execute("ALTER TABLE cells ADD COLUMN weight DOUBLE DEFAULT 1.0")
if n_cells > MAX_CELLS:
    neg_keep = max(0.05, (MAX_CELLS - n_open) / max(n_cells - n_open, 1))
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE cells AS
        SELECT * EXCLUDE (weight),
               CASE WHEN open = 0 AND hour_utc < TIMESTAMPTZ '{TRAIN_END}'
                    THEN {1.0 / neg_keep} ELSE 1.0 END AS weight
        FROM cells
        WHERE open = 1
           OR hour_utc >= TIMESTAMPTZ '{TRAIN_END}'
           OR random() < {neg_keep}
        """
    )
    n_cells, n_open = con.execute("SELECT count(*), sum(open) FROM cells").fetchone()
    log(f"downsampled train negatives (keep={neg_keep:.3f}) -> {n_cells:,} cells")

# --------------------------------------------------------------- geometry in pd
df = con.execute(
    """
    SELECT c.*, s.kp, s.sfi, s.bz, s.by, s.bt, s.wind_speed, s.xray, s.dst, s.proton,
           s.kp_delta_3h, s.kp_max_24h, s.bz_min_3h, s.xray_max_6h
    FROM cells c LEFT JOIN solar s ON s.hour_utc = c.hour_utc
    """
).df()
log(f"pulled to pandas: {df.shape}")


def field_center(f):
    lon = (ord(f[0]) - ord("A")) * 20 - 180 + 10
    lat = (ord(f[1]) - ord("A")) * 10 - 90 + 5
    return lat, lon


fields = sorted(set(df["tx_field"]) | set(df["rx_field"]))
centers = {f: field_center(f) for f in fields}
try:
    cent = pd.read_parquet(CENTROIDS)
    for row in cent.itertuples():
        if row.field in centers and row.n >= 100:
            centers[row.field] = (row.clat, row.clon)
    log(f"applied {len(cent)} activity centroids")
except FileNotFoundError:
    log("WARN: no centroid file, using geometric field centers")

tx_lat = df["tx_field"].map(lambda f: centers[f][0]).to_numpy()
tx_lon = df["tx_field"].map(lambda f: centers[f][1]).to_numpy()
rx_lat = df["rx_field"].map(lambda f: centers[f][0]).to_numpy()
rx_lon = df["rx_field"].map(lambda f: centers[f][1]).to_numpy()

la1, lo1, la2, lo2 = map(np.radians, (tx_lat, tx_lon, rx_lat, rx_lon))
dlon = lo2 - lo1
central = np.arccos(
    np.clip(np.sin(la1) * np.sin(la2) + np.cos(la1) * np.cos(la2) * np.cos(dlon), -1, 1)
)
df["dist_km"] = central * 6371.0
brg = np.arctan2(
    np.sin(dlon) * np.cos(la2),
    np.cos(la1) * np.sin(la2) - np.sin(la1) * np.cos(la2) * np.cos(dlon),
)
df["bearing_sin"] = np.sin(brg)
df["bearing_cos"] = np.cos(brg)

bx = np.cos(la2) * np.cos(dlon)
by_ = np.cos(la2) * np.sin(dlon)
mid_lat = np.arctan2(
    np.sin(la1) + np.sin(la2), np.sqrt((np.cos(la1) + bx) ** 2 + by_**2)
)
mid_lon = lo1 + np.arctan2(by_, np.cos(la1) + bx)

ts = pd.to_datetime(df["hour_utc"], utc=True)
doy = ts.dt.dayofyear.to_numpy()
frac_hour = ts.dt.hour.to_numpy() + 0.5
gamma = 2 * math.pi / 365 * (doy - 1 + (frac_hour - 12) / 24)
decl = (
    0.006918 - 0.399912 * np.cos(gamma) + 0.070257 * np.sin(gamma)
    - 0.006758 * np.cos(2 * gamma) + 0.000907 * np.sin(2 * gamma)
    - 0.002697 * np.cos(3 * gamma) + 0.00148 * np.sin(3 * gamma)
)
eqtime = 229.18 * (
    0.000075 + 0.001868 * np.cos(gamma) - 0.032077 * np.sin(gamma)
    - 0.014615 * np.cos(2 * gamma) - 0.040849 * np.sin(2 * gamma)
)


def sun_elev(lat_rad, lon_rad):
    tst = frac_hour * 60 + eqtime + 4 * np.degrees(lon_rad)
    ha = np.radians(tst / 4 - 180)
    return np.degrees(
        np.arcsin(
            np.clip(
                np.sin(lat_rad) * np.sin(decl) + np.cos(lat_rad) * np.cos(decl) * np.cos(ha),
                -1, 1,
            )
        )
    )


df["sun_elev_tx"] = sun_elev(la1, lo1)
df["sun_elev_rx"] = sun_elev(la2, lo2)
df["sun_elev_mid"] = sun_elev(mid_lat, mid_lon)
df["hod_sin"] = np.sin(2 * np.pi * frac_hour / 24)
df["hod_cos"] = np.cos(2 * np.pi * frac_hour / 24)

v1 = np.stack([np.cos(la1) * np.cos(lo1), np.cos(la1) * np.sin(lo1), np.sin(la1)], axis=1)
v2 = np.stack([np.cos(la2) * np.cos(lo2), np.cos(la2) * np.sin(lo2), np.sin(la2)], axis=1)
omega = central[:, None]
sin_omega = np.where(np.sin(omega) < 1e-9, 1e-9, np.sin(omega))
elevs = []
for tfrac in np.linspace(0.0, 1.0, 7):
    w1 = np.sin((1 - tfrac) * omega) / sin_omega
    w2 = np.sin(tfrac * omega) / sin_omega
    p = w1 * v1 + w2 * v2
    norm = np.linalg.norm(p, axis=1, keepdims=True)
    p = np.where(norm > 1e-9, p / np.where(norm > 1e-9, norm, 1.0), v1)
    plat = np.arcsin(np.clip(p[:, 2], -1, 1))
    plon = np.arctan2(p[:, 1], p[:, 0])
    elevs.append(sun_elev(plat, plon))
elevs = np.stack(elevs, axis=1)
df["dark_frac"] = (elevs < 0).mean(axis=1)
df["min_abs_elev_ends"] = np.minimum(np.abs(elevs[:, 0]), np.abs(elevs[:, -1]))
df["path_min_elev"] = elevs.min(axis=1)
df["path_max_elev"] = elevs.max(axis=1)

BAND_MHZ = {"160m": 1.9, "80m": 3.6, "60m": 5.35, "40m": 7.1, "30m": 10.12,
            "20m": 14.15, "17m": 18.1, "15m": 21.2, "12m": 24.9, "10m": 28.4, "6m": 50.3}
cos_zen = np.clip(np.sin(np.radians(df["sun_elev_mid"].to_numpy())), 0.03, 1.0)
sfi_arr = df["sfi"].fillna(df["sfi"].median()).to_numpy()
fof2_proxy = 0.9 * (180 + 1.44 * sfi_arr) ** 0.25 * cos_zen**0.25
R_E, H_F2 = 6371.0, 300.0
n_hops = np.ceil(df["dist_km"].to_numpy() / 3500.0).clip(min=1)
half_hop = df["dist_km"].to_numpy() / n_hops / (2 * R_E)
half_hop = np.clip(half_hop, 1e-4, None)
elev_ang = np.arctan((np.cos(half_hop) - R_E / (R_E + H_F2)) / np.sin(half_hop))
sin_i = np.clip(R_E * np.cos(elev_ang) / (R_E + H_F2), 0, 0.9999)
muf_proxy = fof2_proxy / np.sqrt(1 - sin_i**2)
df["band_mhz"] = df["band"].map(BAND_MHZ).astype(float)
df["muf_proxy"] = muf_proxy
df["freq_muf_ratio"] = df["band_mhz"] / muf_proxy

df["is_weekend"] = (ts.dt.dayofweek >= 5).astype(int)
CONTEST_DATES = {
    "2026-02-14", "2026-02-15", "2026-02-21", "2026-02-22",
    "2026-03-07", "2026-03-08", "2026-03-28", "2026-03-29",
}
df["is_contest"] = ts.dt.strftime("%Y-%m-%d").isin(CONTEST_DATES).astype(int)

df.to_parquet(OUT, index=False)
log(f"wrote {OUT}: {df.shape}, open rate {df['open'].mean():.1%}")
