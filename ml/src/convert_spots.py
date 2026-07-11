"""One-pass conversion: spot_history.csv.gz -> slim Parquet staging table.

The export is CSV (comma-delimited) with two `SET` preamble lines before the
header, unlike the aggregate exports which are tab-delimited COPY dumps.
"""

import duckdb
import time

RAW = "ml/data/raw/spot_history.csv.gz"
OUT = "ml/data/processed/spots_slim.parquet"

HF_BANDS = [
    "160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m",
]

con = duckdb.connect()
con.execute("SET TimeZone='UTC'")
con.execute("SET memory_limit='20GB'")
con.execute("SET threads=10")
con.execute("SET preserve_insertion_order=false")
con.execute(f"SET temp_directory='ml/data/processed/duckdb_tmp'")

t0 = time.time()
con.execute(
    f"""
    COPY (
        SELECT
            date_trunc('hour', spotted_at) AS hour_utc,
            band,
            mode,
            source,
            snr,
            CASE WHEN upper(tx_grid[1:1]) BETWEEN 'A' AND 'R'
                  AND upper(tx_grid[2:2]) BETWEEN 'A' AND 'R'
                 THEN upper(tx_grid[1:2]) END AS tx_field,
            CASE WHEN upper(rx_grid[1:1]) BETWEEN 'A' AND 'R'
                  AND upper(rx_grid[2:2]) BETWEEN 'A' AND 'R'
                 THEN upper(rx_grid[1:2]) END AS rx_field,
            tx_callsign,
            rx_callsign
        FROM read_csv(
            '{RAW}',
            delim=',',
            header=false,
            skip=3,
            nullstr='',
            columns={{
                'id': 'BIGINT',
                'source': 'VARCHAR',
                'spotted_at': 'TIMESTAMPTZ',
                'ingested_at': 'VARCHAR',
                'tx_callsign': 'VARCHAR',
                'tx_grid': 'VARCHAR',
                'tx_lat': 'DOUBLE',
                'tx_lon': 'DOUBLE',
                'rx_callsign': 'VARCHAR',
                'rx_grid': 'VARCHAR',
                'rx_lat': 'DOUBLE',
                'rx_lon': 'DOUBLE',
                'frequency_khz': 'DOUBLE',
                'band': 'VARCHAR',
                'mode': 'VARCHAR',
                'snr': 'DOUBLE',
                'wpm': 'VARCHAR',
                'comment': 'VARCHAR',
                'dxcc': 'VARCHAR',
                'continent': 'VARCHAR'
            }},
            ignore_errors=true
        )
        WHERE band IN ({",".join(f"'{b}'" for b in HF_BANDS)})
    ) TO '{OUT}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """
)
print(f"done in {time.time() - t0:.0f}s")
print(con.execute(f"SELECT COUNT(*), MIN(hour_utc), MAX(hour_utc) FROM '{OUT}'").fetchall())
