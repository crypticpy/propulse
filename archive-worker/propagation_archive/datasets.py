"""Versioned, explicit Parquet schemas for every cold propagation dataset."""

from __future__ import annotations

from dataclasses import dataclass

import pyarrow as pa


UTC = "UTC"
TS = pa.timestamp("us", tz=UTC)


@dataclass(frozen=True)
class Dataset:
    name: str
    source_relation: str
    time_column: str
    key_column: str
    time_basis: str
    granularity: str
    schema_version: int
    select_expressions: tuple[str, ...]
    schema: pa.Schema
    source_count_column: str | None = None
    watermark_sql: str | None = None
    restore_casts: tuple[tuple[str, str], ...] = ()

    @property
    def select_sql(self) -> str:
        return ", ".join(self.select_expressions)


SPOT_SCHEMA = pa.schema([
    pa.field("id", pa.int64(), nullable=False),
    pa.field("source", pa.string(), nullable=False),
    pa.field("spotted_at", TS, nullable=False),
    pa.field("ingested_at", TS, nullable=False),
    pa.field("available_at", TS, nullable=False),
    pa.field("tx_callsign", pa.string(), nullable=False),
    pa.field("tx_grid", pa.string()),
    pa.field("tx_lat", pa.float64()),
    pa.field("tx_lon", pa.float64()),
    pa.field("rx_callsign", pa.string(), nullable=False),
    pa.field("rx_grid", pa.string()),
    pa.field("rx_lat", pa.float64()),
    pa.field("rx_lon", pa.float64()),
    pa.field("frequency_khz", pa.float64(), nullable=False),
    pa.field("band", pa.string(), nullable=False),
    pa.field("mode", pa.string()),
    pa.field("snr", pa.int16()),
    pa.field("wpm", pa.int16()),
    pa.field("comment", pa.string()),
    pa.field("dxcc", pa.int16()),
    pa.field("continent", pa.string()),
])

WSPR_OBSERVATION_SCHEMA = pa.schema([
    pa.field("id", pa.int64(), nullable=False),
    pa.field("source", pa.string(), nullable=False),
    pa.field("source_id", pa.string()),
    pa.field("observation_key_sha256", pa.string(), nullable=False),
    pa.field("event_time", TS, nullable=False),
    pa.field("received_at", TS, nullable=False),
    pa.field("slot_epoch", pa.int64(), nullable=False),
    pa.field("target_hour", TS, nullable=False),
    pa.field("band", pa.string(), nullable=False),
    pa.field("tx_call", pa.string(), nullable=False),
    pa.field("tx_grid4", pa.string(), nullable=False),
    pa.field("rx_call", pa.string(), nullable=False),
    pa.field("rx_grid4", pa.string(), nullable=False),
    pa.field("power_bin_dbm", pa.int16(), nullable=False),
    pa.field("snr_db", pa.float32(), nullable=False),
    pa.field("mode", pa.string(), nullable=False),
    pa.field("ingest_version", pa.string(), nullable=False),
    pa.field("created_at", TS, nullable=False),
])

WSPR_FEATURE_SCHEMA = pa.schema([
    pa.field("id", pa.string(), nullable=False),
    pa.field("target_hour", TS, nullable=False),
    pa.field("band", pa.string(), nullable=False),
    pa.field("tx_grid4", pa.string(), nullable=False),
    pa.field("rx_grid4", pa.string(), nullable=False),
    pa.field("successes", pa.float64(), nullable=False),
    pa.field("opportunities", pa.float64(), nullable=False),
    pa.field("success_rate", pa.float64(), nullable=False),
    pa.field("sampled_rows", pa.int32(), nullable=False),
    pa.field("positive_rows", pa.int32(), nullable=False),
    pa.field("available_at", TS, nullable=False),
    pa.field("source_watermark", TS, nullable=False),
    pa.field("provider", pa.string(), nullable=False),
    pa.field("transform_version", pa.string(), nullable=False),
    pa.field("quality_flags", pa.list_(pa.string()), nullable=False),
    pa.field("created_at", TS, nullable=False),
])

WSPR_COMPACT_FEATURE_SCHEMA = pa.schema([
    pa.field("id", pa.string(), nullable=False),
    pa.field("target_hour", TS, nullable=False),
    pa.field("band", pa.string(), nullable=False),
    pa.field("tx_grid4", pa.string(), nullable=False),
    pa.field("provider", pa.string(), nullable=False),
    pa.field("transform_version", pa.string(), nullable=False),
    pa.field("available_at", TS, nullable=False),
    pa.field("source_watermark", TS, nullable=False),
    pa.field("rx_grid4s", pa.list_(pa.string()), nullable=False),
    pa.field("success_rates", pa.list_(pa.float64()), nullable=False),
    pa.field("successes", pa.list_(pa.float64()), nullable=False),
    pa.field("opportunities", pa.list_(pa.float64()), nullable=False),
    pa.field("sampled_rows", pa.list_(pa.int32()), nullable=False),
    pa.field("positive_rows", pa.list_(pa.int32()), nullable=False),
    pa.field("cell_quality_flags", pa.string(), nullable=False),
    pa.field("created_at", TS, nullable=False),
])

PATH_HOURLY_SCHEMA = pa.schema([
    pa.field("id", pa.int64(), nullable=False),
    pa.field("hour_utc", TS, nullable=False),
    pa.field("band", pa.string(), nullable=False),
    pa.field("mode_class", pa.string(), nullable=False),
    pa.field("tx_field", pa.string(), nullable=False),
    pa.field("rx_field", pa.string(), nullable=False),
    pa.field("spot_count", pa.int32(), nullable=False),
    pa.field("unique_tx", pa.int32(), nullable=False),
    pa.field("unique_rx", pa.int32(), nullable=False),
    pa.field("avg_snr", pa.float32()),
    pa.field("median_snr", pa.float32()),
    pa.field("backfilled_count", pa.int32(), nullable=False),
])

SOLAR_SCHEMA = pa.schema([
    pa.field("id", pa.int64(), nullable=False),
    pa.field("captured_at", TS, nullable=False),
    pa.field("kp_index", pa.float32()),
    pa.field("sfi", pa.float32()),
    pa.field("bz_gsm", pa.float32()),
    pa.field("by_gsm", pa.float32()),
    pa.field("bt", pa.float32()),
    pa.field("solar_wind_speed", pa.float32()),
    pa.field("sunspot_number", pa.float32()),
    pa.field("xray_flux", pa.float32()),
    pa.field("proton_flux_10mev", pa.float32()),
    pa.field("dst_index", pa.float32()),
    pa.field("solar_wind_density", pa.float32()),
    pa.field("bx_gsm", pa.float32()),
    pa.field("solar_wind_temperature", pa.float32()),
    # GFZ Hp60 (#311). Added before any solar_snapshots_v1 manifest was
    # written, so the v1 schema is extended in place rather than versioned.
    pa.field("hp60", pa.float32()),
    pa.field("source_observed_at", pa.string(), nullable=False),
    pa.field("source_status", pa.string(), nullable=False),
])

FORECAST_PAYLOAD_SCHEMA = pa.schema([
    pa.field("payload_sha256", pa.string(), nullable=False),
    pa.field("source", pa.string(), nullable=False),
    pa.field("product", pa.string(), nullable=False),
    pa.field("issued_at", TS, nullable=False),
    pa.field("ingested_at", TS, nullable=False),
    pa.field("parser_version", pa.string(), nullable=False),
    pa.field("source_url", pa.string(), nullable=False),
    pa.field("raw_payload", pa.string(), nullable=False),
    pa.field("source_object_bucket", pa.string()),
    pa.field("source_object_path", pa.string()),
    pa.field("source_object_sha256", pa.string()),
    pa.field("source_object_bytes", pa.int64()),
    pa.field("source_object_verified_at", TS),
    pa.field("created_at", TS, nullable=False),
])

FORECAST_VALUE_SCHEMA = pa.schema([
    pa.field("id", pa.int64(), nullable=False),
    pa.field("payload_sha256", pa.string(), nullable=False),
    pa.field("source", pa.string(), nullable=False),
    pa.field("product", pa.string(), nullable=False),
    pa.field("issued_at", TS, nullable=False),
    pa.field("valid_at", TS, nullable=False),
    pa.field("available_at", TS, nullable=False),
    pa.field("lead_minutes", pa.int32(), nullable=False),
    pa.field("metric", pa.string(), nullable=False),
    pa.field("value", pa.float64(), nullable=False),
    pa.field("unit", pa.string()),
    pa.field("quality", pa.string(), nullable=False),
    pa.field("created_at", TS, nullable=False),
])


SPOT_WATERMARK_SQL = """
SELECT count(*) = 2 AND min(hour_utc) >= %s - interval '1 hour'
FROM public.collector_aggregation_watermarks
WHERE aggregation IN ('band_hourly', 'path_hourly')
"""

WSPR_OBSERVATION_WATERMARK_SQL = """
SELECT NOT EXISTS (
  SELECT DISTINCT observation.target_hour, observation.band, observation.source
FROM public.wspr_observations_live AS observation
  WHERE observation.received_at >= %s AND observation.received_at < %s
  EXCEPT
  SELECT watermark.target_hour, watermark.band, watermark.provider
  FROM public.wspr_feature_watermarks AS watermark
  WHERE watermark.target_hour >= date_trunc('hour', %s)
    AND watermark.target_hour < date_trunc('hour', %s) + interval '1 hour'
    AND watermark.status = 'complete'
    AND cardinality(watermark.quality_flags) = 0
    AND watermark.source_watermark = watermark.target_hour + interval '1 hour'
)
"""

WSPR_FEATURE_WATERMARK_SQL = """
SELECT NOT EXISTS (
  SELECT DISTINCT feature.target_hour, feature.band, feature.provider,
                  feature.transform_version, feature.available_at
  FROM public.wspr_path_hourly_features AS feature
  WHERE feature.target_hour >= %s AND feature.target_hour < %s
  EXCEPT
  SELECT watermark.target_hour, watermark.band, watermark.provider,
         watermark.transform_version, watermark.available_at
  FROM public.wspr_feature_watermarks AS watermark
  WHERE watermark.target_hour >= %s AND watermark.target_hour < %s
    AND watermark.status = 'complete'
    AND cardinality(watermark.quality_flags) = 0
)
"""

WSPR_COMPACT_FEATURE_WATERMARK_SQL = """
SELECT NOT EXISTS (
  SELECT DISTINCT feature.target_hour, feature.band, feature.provider,
                  feature.transform_version, feature.available_at
  FROM public.wspr_path_hourly_compact_v1 AS feature
  WHERE feature.target_hour >= %s AND feature.target_hour < %s
  EXCEPT
  SELECT watermark.target_hour, watermark.band, watermark.provider,
         watermark.transform_version, watermark.available_at
  FROM public.wspr_feature_watermarks AS watermark
  WHERE watermark.target_hour >= %s AND watermark.target_hour < %s
    AND watermark.status = 'complete'
    AND cardinality(watermark.quality_flags) = 0
)
"""

PATH_WATERMARK_SQL = """
SELECT coalesce(max(hour_utc) >= %s - interval '1 hour', false)
FROM public.collector_aggregation_watermarks
WHERE aggregation = 'path_hourly'
"""


def columns(schema: pa.Schema, replacements: dict[str, str] | None = None) -> tuple[str, ...]:
    replacements = replacements or {}
    return tuple(replacements.get(field.name, field.name) for field in schema)


DATASETS = {
    dataset.name: dataset
    for dataset in (
        Dataset(
            "spot_history_v1", "public.spot_history_live", "spotted_at", "id",
            "event", "day", 1, columns(SPOT_SCHEMA), SPOT_SCHEMA, "source",
            SPOT_WATERMARK_SQL,
        ),
        Dataset(
            "wspr_observations_v1", "public.wspr_observations_live",
            "received_at", "id", "receipt", "hour", 1,
            columns(WSPR_OBSERVATION_SCHEMA), WSPR_OBSERVATION_SCHEMA, "source",
            WSPR_OBSERVATION_WATERMARK_SQL,
        ),
        Dataset(
            "wspr_path_features_v1", "public.wspr_path_hourly_features",
            "target_hour", "id", "event", "hour", 1,
            columns(WSPR_FEATURE_SCHEMA, {"id": "id::text AS id"}),
            WSPR_FEATURE_SCHEMA, "provider", WSPR_FEATURE_WATERMARK_SQL,
            (("id", "uuid"),),
        ),
        Dataset(
            "wspr_path_features_compact_v1",
            "public.wspr_path_hourly_compact_v1",
            "target_hour", "id", "event", "hour", 1,
            columns(WSPR_COMPACT_FEATURE_SCHEMA, {
                "id": "id::text AS id",
                "cell_quality_flags": (
                    "cell_quality_flags::text AS cell_quality_flags"
                ),
            }),
            WSPR_COMPACT_FEATURE_SCHEMA, "provider",
            WSPR_COMPACT_FEATURE_WATERMARK_SQL,
            (("id", "uuid"), ("cell_quality_flags", "jsonb")),
        ),
        Dataset(
            "path_hourly_stats_v1", "public.path_hourly_stats", "hour_utc", "id",
            "event", "month", 1, columns(PATH_HOURLY_SCHEMA), PATH_HOURLY_SCHEMA,
            "band", PATH_WATERMARK_SQL,
        ),
        Dataset(
            "solar_snapshots_v1", "public.solar_snapshots", "captured_at", "id",
            "capture", "month", 1,
            columns(SOLAR_SCHEMA, {
                "source_observed_at": "source_observed_at::text AS source_observed_at",
                "source_status": "source_status::text AS source_status",
            }),
            SOLAR_SCHEMA, restore_casts=(
                ("source_observed_at", "jsonb"),
                ("source_status", "jsonb"),
            ),
        ),
        Dataset(
            "forecast_payloads_v1", "public.space_weather_forecast_payloads",
            "issued_at", "payload_sha256", "issue", "month", 1,
            columns(FORECAST_PAYLOAD_SCHEMA, {
                "raw_payload": "raw_payload::text AS raw_payload",
            }),
            FORECAST_PAYLOAD_SCHEMA, "product", restore_casts=(("raw_payload", "jsonb"),),
        ),
        Dataset(
            "forecast_values_v1", "public.space_weather_forecast_values",
            "valid_at", "id", "issue", "month", 1,
            columns(FORECAST_VALUE_SCHEMA), FORECAST_VALUE_SCHEMA, "product",
        ),
    )
}
