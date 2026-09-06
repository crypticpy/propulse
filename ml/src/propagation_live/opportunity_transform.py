"""Frozen DuckDB transform for exposure-aware WSPR path opportunities."""

from __future__ import annotations

import re
from typing import Literal

import duckdb


TRANSFORM_VERSION = "wspr-opportunity-duckdb-v1"
FIELD_RECENCY_TRANSFORM_VERSION = "wspr-field-recency-v2"
FIELD_RECENCY_GRAIN = "maidenhead_field"
RECEIVER_SAMPLES_PER_TX_SLOT = 4
SUPPORTED_DUCKDB_MAJOR_MINOR = (1, 5)
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def validate_duckdb_runtime() -> str:
    version = duckdb.__version__
    numbers = tuple(int(item) for item in version.split(".")[:2])
    if numbers != SUPPORTED_DUCKDB_MAJOR_MINOR:
        expected = ".".join(map(str, SUPPORTED_DUCKDB_MAJOR_MINOR))
        raise RuntimeError(
            f"{TRANSFORM_VERSION} requires DuckDB {expected}.x hash semantics; got {version}"
        )
    return version


def checked_identifier(value: str) -> str:
    if not _IDENTIFIER.fullmatch(value):
        raise ValueError(f"unsafe DuckDB relation identifier: {value!r}")
    return value


def materialize_opportunity_cells(
    connection: duckdb.DuckDBPyConnection,
    *,
    source_relation: str,
    task: Literal["hf", "6m"],
    receiver_samples: int = RECEIVER_SAMPLES_PER_TX_SLOT,
    destination_relation: str = "opportunity_cells",
) -> None:
    """Materialize the exact opportunity transform used by the trained core."""
    validate_duckdb_runtime()
    source = checked_identifier(source_relation)
    destination = checked_identifier(destination_relation)
    if receiver_samples < 1:
        raise ValueError("receiver_samples must be positive")
    band_filter = "band = '6m'" if task == "6m" else "band <> '6m'"
    connection.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE positives AS
        SELECT DISTINCT slot_epoch, target_hour, band,
               tx_call, tx_grid4, rx_call, rx_grid4, power_bin_dbm,
               min(snr_db) OVER (
                 PARTITION BY slot_epoch, band, tx_call, rx_call
               ) AS snr_db
        FROM {source}
        WHERE {band_filter};

        CREATE OR REPLACE TEMP TABLE tx_active AS
        SELECT slot_epoch, target_hour, band, tx_call, tx_grid4, power_bin_dbm,
               min(snr_db) AS best_any_snr
        FROM positives GROUP BY ALL;

        CREATE OR REPLACE TEMP TABLE rx_active AS
        SELECT slot_epoch, band, rx_call, rx_grid4,
               row_number() OVER (
                 PARTITION BY slot_epoch, band ORDER BY rx_call, rx_grid4
               ) AS rx_number,
               count(*) OVER (PARTITION BY slot_epoch, band) AS receiver_count
        FROM (SELECT DISTINCT slot_epoch, band, rx_call, rx_grid4 FROM positives);

        CREATE OR REPLACE TEMP TABLE tx_with_receiver_count AS
        SELECT tx.*, counts.receiver_count,
               least(counts.receiver_count, {int(receiver_samples)})::INTEGER
                 AS sample_count
        FROM tx_active tx
        JOIN (
          SELECT slot_epoch, band, max(receiver_count) AS receiver_count
          FROM rx_active GROUP BY 1, 2
        ) counts USING (slot_epoch, band);

        CREATE OR REPLACE TEMP TABLE sampled_negatives AS
        WITH candidate AS (
          SELECT tx.slot_epoch, tx.target_hour, tx.band,
                 tx.tx_call, tx.tx_grid4, tx.power_bin_dbm,
                 rx.rx_call, rx.rx_grid4,
                 tx.receiver_count::DOUBLE / tx.sample_count AS inclusion_weight
          FROM tx_with_receiver_count tx
          JOIN range(0, {int(receiver_samples)}) samples(sample_index)
            ON samples.sample_index < tx.sample_count
          JOIN rx_active rx
            ON rx.slot_epoch = tx.slot_epoch AND rx.band = tx.band
           AND rx.rx_number = 1 + (
             (hash(tx.slot_epoch, tx.band, tx.tx_call) + samples.sample_index)
             % tx.receiver_count
           )
          WHERE tx.tx_call <> rx.rx_call
        )
        SELECT DISTINCT candidate.*
        FROM candidate
        ANTI JOIN positives p
          ON p.slot_epoch = candidate.slot_epoch AND p.band = candidate.band
         AND p.tx_call = candidate.tx_call AND p.rx_call = candidate.rx_call;

        CREATE OR REPLACE TEMP TABLE {destination} AS
        WITH weighted AS (
          SELECT target_hour, band, tx_grid4, rx_grid4, power_bin_dbm,
                 1.0::DOUBLE AS inclusion_weight, 1::UTINYINT AS decoded,
                 snr_db
          FROM positives
          UNION ALL
          SELECT target_hour, band, tx_grid4, rx_grid4, power_bin_dbm,
                 inclusion_weight, 0::UTINYINT AS decoded,
                 NULL::FLOAT AS snr_db
          FROM sampled_negatives
        )
        SELECT target_hour, band, tx_grid4, rx_grid4, power_bin_dbm,
               sum(inclusion_weight * decoded)::DOUBLE AS successes,
               sum(inclusion_weight)::DOUBLE AS opportunities,
               sum(inclusion_weight * decoded) / sum(inclusion_weight)
                 AS success_rate,
               (sum(decoded) > 0)::UTINYINT AS any_success,
               count(*)::INTEGER AS sampled_rows,
               count(*) FILTER (decoded=1)::INTEGER AS positive_rows,
               avg(snr_db) FILTER (decoded=1)::FLOAT AS mean_positive_snr,
               min(snr_db) FILTER (decoded=1)::FLOAT AS min_positive_snr,
               max(snr_db) FILTER (decoded=1)::FLOAT AS max_positive_snr
        FROM weighted
        WHERE tx_grid4 <> rx_grid4
        GROUP BY ALL;
        """
    )


def materialize_path_hour_cells(
    connection: duckdb.DuckDBPyConnection,
    *,
    source_relation: str = "opportunity_cells",
    destination_relation: str = "path_hour_cells",
) -> None:
    """Aggregate the frozen per-power opportunity cells into model lag cells."""
    source = checked_identifier(source_relation)
    destination = checked_identifier(destination_relation)
    connection.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {destination} AS
        SELECT target_hour, band, tx_grid4, rx_grid4,
               sum(successes)::DOUBLE AS successes,
               sum(opportunities)::DOUBLE AS opportunities,
               sum(successes) / sum(opportunities) AS success_rate,
               sum(sampled_rows)::INTEGER AS sampled_rows,
               sum(positive_rows)::INTEGER AS positive_rows
        FROM {source}
        GROUP BY 1, 2, 3, 4;
        """
    )


def materialize_field_recency_cells(
    connection: duckdb.DuckDBPyConnection,
    *,
    source_relation: str = "opportunity_cells",
    destination_relation: str = "field_recency_cells",
) -> None:
    """Materialize the field-grain network-recency statistic from opportunity cells.

    Mirrors ``compute_path_recency_hourly`` in
    ``supabase/migrations/20260906210000_path_recency_v2.sql`` with WSPR
    positives standing in for live spots, so the offline lag features match
    the served ``path_recency_hourly`` rows:

    * ``heard``: one row per (hour, band, tx_field, rx_field) that had any
      positive opportunity row; rows exist only for heard pairs.
    * ``exposure``: distinct tx fields heard by ``rx_field`` in that hour/band.
    * ``recency_rate = 1.0 / exposure``.
    * ``recency_quantile``: ``percent_rank()`` of ``recency_rate`` over the
      hour/band's heard pairs (ties share a value; a lone pair scores 0).

    Known divergences from production (``psk-rbn-field-recency-v2``):

    * Opportunity cells exclude ``tx_grid4 = rx_grid4`` pairs, so same-field
      pairs whose grid4 squares coincide are absent here, whereas production
      counts same-field pairs.
    * ``spots`` here counts positive opportunity rows (distinct
      slot/tx/rx/power combinations), not raw spot counts.
    * The WSPR archive is single-mode, so the production ``digital_*``
      counterparts would equal the totals and are not emitted.
    """
    source = checked_identifier(source_relation)
    destination = checked_identifier(destination_relation)
    connection.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {destination} AS
        WITH heard AS (
          SELECT target_hour AS hour_utc, band,
                 substr(tx_grid4, 1, 2) AS tx_field,
                 substr(rx_grid4, 1, 2) AS rx_field,
                 sum(positive_rows)::BIGINT AS spots
          FROM {source}
          WHERE positive_rows > 0
          GROUP BY ALL
        ), exposure AS (
          SELECT hour_utc, band, rx_field,
                 count(*)::INTEGER AS exposure,
                 sum(spots)::BIGINT AS rx_spots
          FROM heard
          GROUP BY ALL
        )
        SELECT h.hour_utc, h.band, h.tx_field, h.rx_field,
               1::UTINYINT AS heard,
               e.exposure,
               1.0::DOUBLE / e.exposure AS recency_rate,
               h.spots, e.rx_spots,
               percent_rank() OVER (
                 PARTITION BY h.band, h.hour_utc ORDER BY 1.0::DOUBLE / e.exposure
               ) AS recency_quantile
        FROM heard h
        JOIN exposure e USING (hour_utc, band, rx_field);
        """
    )


def transform_metadata(receiver_samples: int) -> dict[str, str | int]:
    return {
        "transform_version": TRANSFORM_VERSION,
        "duckdb_version": validate_duckdb_runtime(),
        "hash_engine": "duckdb_hash",
        "lag_aggregation": "sum_across_power_bins",
        "receiver_samples_per_tx_slot": int(receiver_samples),
        "field_recency_transform_version": FIELD_RECENCY_TRANSFORM_VERSION,
        "field_recency_grain": FIELD_RECENCY_GRAIN,
    }
