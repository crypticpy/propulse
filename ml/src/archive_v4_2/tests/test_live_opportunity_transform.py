from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

import duckdb


LIVE = Path(__file__).resolve().parents[2] / "propagation_live"
sys.path.insert(0, str(LIVE))

from opportunity_transform import (  # noqa: E402
    FIELD_RECENCY_TRANSFORM_VERSION,
    RECEIVER_SAMPLES_PER_TX_SLOT,
    TRANSFORM_VERSION,
    materialize_field_recency_cells,
    materialize_opportunity_cells,
    materialize_path_hour_cells,
    transform_metadata,
)


EXPECTED_HF_DIGEST = "1938f20d1a37b573b919d8e507fa287f1689bb6f588b04ade3a6a7fd45b02ad7"


def fixture_connection() -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect()
    connection.execute(
        """
        CREATE TABLE wspr_source (
          slot_epoch BIGINT,
          target_hour TIMESTAMPTZ,
          band VARCHAR,
          tx_call VARCHAR,
          tx_grid4 VARCHAR,
          rx_call VARCHAR,
          rx_grid4 VARCHAR,
          power_bin_dbm SMALLINT,
          snr_db FLOAT
        )
        """
    )
    grids = ["EM10", "FN31", "QF56", "DM79", "GG66", "PL05"]
    receivers = ["IO91", "JN18", "PM95", "FK68", "JO62", "AA00"]
    rows = [
        (1000, "2024-10-01T01:00:00Z", "20m", f"TX{i}", grids[i], f"RX{i}", receivers[i], 7, -20 + i)
        for i in range(6)
    ]
    rows.append((1000, "2024-10-01T01:00:00Z", "20m", "TX0", "EM10", "RX0", "IO91", 7, -30))
    rows.extend([
        (2000, "2024-10-01T01:00:00Z", "6m", "SIXTX", "EM10", "SIXRX", "IO91", 10, -12),
        (2000, "2024-10-01T01:00:00Z", "6m", "SIXT2", "FN31", "SIXR2", "JN18", 10, -18),
    ])
    connection.executemany(
        "INSERT INTO wspr_source VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    return connection


def canonical_digest(connection: duckdb.DuckDBPyConnection) -> str:
    rows = connection.execute(
        "SELECT * FROM opportunity_cells ORDER BY ALL"
    ).fetchall()
    payload = json.dumps(rows, default=str, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


class LiveOpportunityTransformTests(unittest.TestCase):
    def test_hf_transform_matches_pinned_duckdb_hash_fixture(self):
        connection = fixture_connection()
        materialize_opportunity_cells(
            connection,
            source_relation="wspr_source",
            task="hf",
        )
        self.assertEqual(canonical_digest(connection), EXPECTED_HF_DIGEST)
        audit = connection.execute(
            """
            SELECT count(*),
                   count(*) FILTER (successes > opportunities),
                   count(*) FILTER (success_rate < 0 OR success_rate > 1),
                   count(*) FILTER (tx_grid4 = rx_grid4),
                   sum(positive_rows)
            FROM opportunity_cells
            """
        ).fetchone()
        self.assertGreater(audit[0], 6)
        self.assertEqual(audit[1:4], (0, 0, 0))
        self.assertEqual(audit[4], 6)
        materialize_path_hour_cells(connection)
        path_audit = connection.execute(
            """
            SELECT count(*),
                   count(*) FILTER (success_rate <> successes / opportunities),
                   count(*) FILTER (tx_grid4 = rx_grid4)
            FROM path_hour_cells
            """
        ).fetchone()
        self.assertGreater(path_audit[0], 0)
        self.assertEqual(path_audit[1:], (0, 0))

    def test_transform_is_repeatable_and_keeps_6m_separate(self):
        connection = fixture_connection()
        materialize_opportunity_cells(
            connection,
            source_relation="wspr_source",
            task="hf",
        )
        first = canonical_digest(connection)
        materialize_opportunity_cells(
            connection,
            source_relation="wspr_source",
            task="hf",
        )
        self.assertEqual(first, canonical_digest(connection))
        materialize_opportunity_cells(
            connection,
            source_relation="wspr_source",
            task="6m",
        )
        bands = connection.execute(
            "SELECT DISTINCT band FROM opportunity_cells"
        ).fetchall()
        self.assertEqual(bands, [("6m",)])

    def test_transform_metadata_freezes_engine_and_sampler(self):
        metadata = transform_metadata(RECEIVER_SAMPLES_PER_TX_SLOT)
        self.assertEqual(metadata["transform_version"], TRANSFORM_VERSION)
        self.assertEqual(metadata["hash_engine"], "duckdb_hash")
        self.assertEqual(metadata["lag_aggregation"], "sum_across_power_bins")
        self.assertEqual(metadata["receiver_samples_per_tx_slot"], 4)
        self.assertTrue(str(metadata["duckdb_version"]).startswith("1.5."))
        self.assertEqual(
            metadata["field_recency_transform_version"], FIELD_RECENCY_TRANSFORM_VERSION
        )
        self.assertEqual(metadata["field_recency_grain"], "maidenhead_field")

    def test_field_recency_mirrors_path_recency_hourly(self):
        connection = duckdb.connect()
        connection.execute("SET TimeZone='UTC'")
        connection.execute(
            """
            CREATE TABLE cells (
              target_hour TIMESTAMPTZ, band VARCHAR,
              tx_grid4 VARCHAR, rx_grid4 VARCHAR, power_bin_dbm DOUBLE,
              positive_rows INTEGER, sampled_rows INTEGER
            )
            """
        )
        hour = "2024-10-01T01:00:00Z"
        later = "2024-10-01T02:00:00Z"
        rows = [
            # IO field hears three tx fields (EM twice via two grid4/power cells).
            (hour, "20m", "EM10", "IO91", 37, 2, 5),
            (hour, "20m", "EM12", "IO92", 30, 1, 3),
            (hour, "20m", "FN31", "IO91", 37, 1, 4),
            (hour, "20m", "JN18", "IO91", 37, 1, 1),
            # JN field hears one tx field; a sampled-only cell must not count.
            (hour, "20m", "EM10", "JN18", 37, 1, 2),
            (hour, "20m", "PM95", "JN18", 37, 0, 4),
            # Same field, different grid4: allowed by the source and heard.
            (hour, "20m", "EM10", "EM12", 37, 1, 1),
            # Another band in the same hour ranks independently.
            (hour, "40m", "EM10", "IO91", 37, 1, 1),
            # A later hour with nothing heard contributes no rows.
            (later, "20m", "EM10", "IO91", 37, 0, 4),
        ]
        connection.executemany("INSERT INTO cells VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
        materialize_field_recency_cells(connection, source_relation="cells")
        cells = {
            (str(hour_utc), band, tx, rx): (heard, exposure, rate, spots, rx_spots, quantile)
            for hour_utc, band, tx, rx, heard, exposure, rate, spots, rx_spots, quantile
            in connection.execute(
                """
                SELECT hour_utc, band, tx_field, rx_field, heard, exposure,
                       recency_rate, spots, rx_spots, recency_quantile
                FROM field_recency_cells
                """
            ).fetchall()
        }
        first = "2024-10-01 01:00:00+00:00"
        self.assertEqual(len(cells), 6)
        self.assertNotIn((first, "20m", "PM", "JN"), cells)
        self.assertTrue(all(key[0] == first for key in cells))
        io_em = cells[(first, "20m", "EM", "IO")]
        self.assertEqual(io_em[:5], (1, 3, 1.0 / 3, 3, 5))
        self.assertEqual(cells[(first, "20m", "FN", "IO")][:5], (1, 3, 1.0 / 3, 1, 5))
        self.assertEqual(cells[(first, "20m", "JN", "IO")][:5], (1, 3, 1.0 / 3, 1, 5))
        self.assertEqual(cells[(first, "20m", "EM", "JN")][:5], (1, 1, 1.0, 1, 1))
        self.assertEqual(cells[(first, "20m", "EM", "EM")][:5], (1, 1, 1.0, 1, 1))
        self.assertEqual(cells[(first, "40m", "EM", "IO")][:5], (1, 1, 1.0, 1, 1))
        # Quantile is percent_rank over the hour/band's pairs: ties share a
        # value, the lowest rate scores 0, a lone pair scores 0.
        for value in cells.values():
            self.assertGreaterEqual(value[5], 0.0)
            self.assertLessEqual(value[5], 1.0)
        self.assertEqual(io_em[5], 0.0)
        self.assertEqual(cells[(first, "20m", "FN", "IO")][5], 0.0)
        self.assertEqual(cells[(first, "20m", "JN", "IO")][5], 0.0)
        self.assertEqual(cells[(first, "20m", "EM", "JN")][5], 0.75)
        self.assertEqual(cells[(first, "20m", "EM", "EM")][5], 0.75)
        self.assertEqual(cells[(first, "40m", "EM", "IO")][5], 0.0)
        invariants = connection.execute(
            """
            SELECT count(*) FILTER (heard <> 1),
                   count(*) FILTER (recency_rate <> 1.0 / exposure),
                   count(*) FILTER (tx_field = rx_field)
            FROM field_recency_cells
            """
        ).fetchone()
        self.assertEqual(invariants[:2], (0, 0))
        # The frozen opportunity transform drops tx_grid4 = rx_grid4 cells, so
        # a source built by it cannot contain same-grid4 pairs; same-field
        # pairs from different grid4 squares (EM10 -> EM12) still appear.
        self.assertEqual(invariants[2], 1)
        source = fixture_connection()
        materialize_opportunity_cells(source, source_relation="wspr_source", task="hf")
        materialize_field_recency_cells(source)
        same_field = source.execute(
            "SELECT count(*) FILTER (tx_field = rx_field), count(*) FROM field_recency_cells"
        ).fetchone()
        self.assertEqual(same_field[0], 0)
        self.assertGreater(same_field[1], 0)


if __name__ == "__main__":
    unittest.main()
