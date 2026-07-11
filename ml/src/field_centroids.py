"""Activity-weighted centroid per Maidenhead field, from raw spot lat/lons.

Hams cluster inside their 2-degree fields (e.g. "FN" activity is mostly the
Boston-NYC corridor, not the field's geometric center). Using real centroids
sharpens every distance/bearing/sun-elevation feature.

Train window only (< 2026-03-23) to stay leak-consistent, though geography is
effectively static.
"""

import duckdb

RAW = "ml/data/raw/spot_history.csv.gz"
OUT = "ml/data/processed/field_centroids.parquet"

con = duckdb.connect()
con.execute("SET TimeZone='UTC'")
con.execute("SET memory_limit='20GB'")
con.execute("SET threads=10")

con.execute(
    f"""
    COPY (
        WITH pts AS (
            SELECT upper(tx_grid[1:2]) AS field, tx_lat AS lat, tx_lon AS lon
            FROM read_csv('{RAW}', delim=',', header=false, skip=3,
                columns={{'id':'BIGINT','source':'VARCHAR','spotted_at':'TIMESTAMPTZ',
                'ingested_at':'VARCHAR','tx_callsign':'VARCHAR','tx_grid':'VARCHAR',
                'tx_lat':'DOUBLE','tx_lon':'DOUBLE','rx_callsign':'VARCHAR',
                'rx_grid':'VARCHAR','rx_lat':'DOUBLE','rx_lon':'DOUBLE',
                'frequency_khz':'DOUBLE','band':'VARCHAR','mode':'VARCHAR','snr':'DOUBLE',
                'wpm':'VARCHAR','comment':'VARCHAR','dxcc':'VARCHAR','continent':'VARCHAR'}},
                ignore_errors=true)
            WHERE spotted_at < TIMESTAMPTZ '2026-03-23'
              AND tx_grid IS NOT NULL AND length(tx_grid) >= 2
              AND upper(tx_grid[1:1]) BETWEEN 'A' AND 'R'
              AND upper(tx_grid[2:2]) BETWEEN 'A' AND 'R'
              AND tx_lat IS NOT NULL AND tx_lon IS NOT NULL
        )
        SELECT field, avg(lat) AS clat, avg(lon) AS clon, count(*) AS n
        FROM pts GROUP BY field
    ) TO '{OUT}' (FORMAT PARQUET)
    """
)
print(con.execute(f"SELECT count(*), sum(n) FROM '{OUT}'").fetchall())
