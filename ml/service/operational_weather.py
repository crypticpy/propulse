"""Server-authoritative operational space-weather features."""

from __future__ import annotations

import math
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import httpx


RAW_WEATHER_FEATURES = (
    "bt",
    "bx_gsm",
    "by_gsm",
    "bz_gsm",
    "temperature_k",
    "density_cm3",
    "wind_speed",
    "flow_pressure",
    "electric_field",
    "plasma_beta",
    "alfven_mach",
    "kp",
    "sunspot_number",
    "dst",
    "ae",
    "proton_flux_10mev",
    "ap",
    "f107",
    "pcn",
    "al",
    "au",
    "magnetosonic_mach",
    "hp60",
)
DERIVED_WEATHER_FEATURES = (
    "kp_delta_3h",
    "kp_max_24h",
    "bz_min_3h",
    "dst_min_6h",
)
SOURCE_MAX_AGE_SECONDS = {
    "kp": 15 * 60,
    "magnetic_field": 15 * 60,
    "solar_wind": 15 * 60,
    "proton_flux_10mev": 15 * 60,
    "dst": 2 * 60 * 60,
    "f107": 2 * 24 * 60 * 60,
    "sunspot_number": 45 * 24 * 60 * 60,
}
FAST_SOURCES = {"kp", "magnetic_field", "solar_wind", "proton_flux_10mev", "dst"}
FIELD_DEFINITIONS = (
    ("kp", "kp_index", "kp"),
    ("f107", "sfi", "f107"),
    ("bx_gsm", "bx_gsm", "magnetic_field"),
    ("by_gsm", "by_gsm", "magnetic_field"),
    ("bz_gsm", "bz_gsm", "magnetic_field"),
    ("bt", "bt", "magnetic_field"),
    ("wind_speed", "solar_wind_speed", "solar_wind"),
    ("temperature_k", "solar_wind_temperature", "solar_wind"),
    ("density_cm3", "solar_wind_density", "solar_wind"),
    ("sunspot_number", "sunspot_number", "sunspot_number"),
    ("proton_flux_10mev", "proton_flux_10mev", "proton_flux_10mev"),
    ("dst", "dst_index", "dst"),
)
SNAPSHOT_COLUMNS = (
    "captured_at",
    "kp_index",
    "sfi",
    "bx_gsm",
    "by_gsm",
    "bz_gsm",
    "bt",
    "solar_wind_speed",
    "solar_wind_temperature",
    "solar_wind_density",
    "sunspot_number",
    "proton_flux_10mev",
    "dst_index",
    "source_observed_at",
    "source_status",
)


def aware_datetime(value: str | datetime) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("operational-weather timestamps must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def finite(value: Any) -> bool:
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def source_observed_at(row: dict[str, Any], source: str) -> datetime | None:
    values = row.get("source_observed_at")
    if not isinstance(values, dict) or not values.get(source):
        return None
    try:
        return aware_datetime(str(values[source]))
    except ValueError:
        return None


def source_is_usable(row: dict[str, Any], source: str) -> bool:
    if source not in {"magnetic_field", "solar_wind"}:
        return True
    statuses = row.get("source_status")
    status = statuses.get(source) if isinstance(statuses, dict) else None
    return not isinstance(status, dict) or status.get("active") is not False


def selected_field(
    rows: list[dict[str, Any]],
    *,
    field: str,
    source: str,
    issue_time: datetime,
) -> tuple[float, datetime, datetime] | None:
    selected: tuple[float, datetime, datetime] | None = None
    maximum_age = timedelta(seconds=SOURCE_MAX_AGE_SECONDS[source])
    for row in rows:
        observed = source_observed_at(row, source)
        try:
            received = aware_datetime(str(row["captured_at"]))
        except (KeyError, ValueError):
            continue
        value = row.get(field)
        if (
            observed is None
            or observed > issue_time
            or received > issue_time
            or issue_time - observed > maximum_age
            or not finite(value)
            or not source_is_usable(row, source)
        ):
            continue
        candidate = (float(value), observed, received)
        if selected is None or (observed, received) > (selected[1], selected[2]):
            selected = candidate
    return selected


# OMNI2 low-resolution hourly index -> ap (nT) conversion table, one entry
# per third-of-a-Kp-step from 0o through 9o. Source: standard Kp<->ap
# conversion (e.g. https://www.swpc.noaa.gov/content/planetary-k-index and
# the OMNI2 "ap" column definition at
# https://omniweb.gsfc.nasa.gov/html/ow_data.html), which is how training
# (ml/src/archive_v3/build_space_weather.py) read `ap` straight from the
# OMNI2 file.
KP_TO_AP = (
    0, 2, 3, 4, 5, 6, 7, 9, 12, 15, 18, 22, 27, 32, 39, 48, 56, 67, 80, 94,
    111, 132, 154, 179, 207, 236, 300, 400,
)


KP_MIN = 0.0
KP_MAX = 9.0


def kp_to_ap(kp: float) -> float | None:
    """Map a decimal Kp (thirds, e.g. 2.33) to the standard ap index.

    The table is only defined on 0o..9o, so a non-finite or out-of-range Kp
    returns None instead of being clamped to a trusted quiet/storm value.
    """
    if not math.isfinite(kp) or kp < KP_MIN or kp > KP_MAX:
        return None
    index = max(0, min(len(KP_TO_AP) - 1, round(kp * 3)))
    return float(KP_TO_AP[index])


def add_derived_physics_features(values: dict[str, float]) -> None:
    """Reconstruct OMNI2 plasma-derived features from raw snapshot inputs.

    Training took `flow_pressure`, `electric_field`, `plasma_beta`,
    `alfven_mach`, `magnetosonic_mach`, and `ap` straight from OMNI2 file
    columns (ml/src/archive_v3/build_space_weather.py). The collector
    snapshot only carries the raw solar-wind/IMF/Kp inputs, so they are
    rebuilt here using OMNI's documented formulas:
    https://omniweb.gsfc.nasa.gov/html/ow_data.html and
    https://omniweb.gsfc.nasa.gov/ftpbrowser/bow_derivation.html. Flow
    pressure uses the alpha-particle-free variant (2e-6 * Np * V^2) because
    alpha density is not available operationally; OMNI itself falls back to
    this same formula whenever alpha/proton ratios are missing.

    Every derivation is guarded on the physical domain of its inputs: a
    missing input, a non-positive magnitude (`wind_speed`, `bt`,
    `density_cm3`, `temperature_k`), or a Kp outside 0..9 leaves the
    feature absent rather than emitting NaN/Inf, a fabricated 0.0, or a
    value computed from an upstream sentinel. Only `bz_gsm` is signed.
    """
    wind_speed = values.get("wind_speed")
    density = values.get("density_cm3")
    temperature = values.get("temperature_k")
    bt = values.get("bt")
    bz = values.get("bz_gsm")
    kp = values.get("kp")

    has_wind = wind_speed is not None and wind_speed > 0
    has_density = density is not None and density > 0
    has_temperature = temperature is not None and temperature > 0
    has_field = bt is not None and bt > 0

    if has_wind and has_density:
        flow_pressure = 2e-6 * density * wind_speed**2
        if math.isfinite(flow_pressure):
            values["flow_pressure"] = flow_pressure

    if has_wind and bz is not None:
        electric_field = -wind_speed * bz * 1e-3
        if math.isfinite(electric_field):
            values["electric_field"] = electric_field

    if has_temperature and has_density and has_field:
        plasma_beta = ((temperature * 4.16e-5) + 5.34) * density / bt**2
        if math.isfinite(plasma_beta):
            values["plasma_beta"] = plasma_beta

    if has_wind and has_density and has_field:
        alfven_mach = (wind_speed * math.sqrt(density)) / (20 * bt)
        if math.isfinite(alfven_mach):
            values["alfven_mach"] = alfven_mach

        if has_temperature:
            alfven_speed = 20 * bt / math.sqrt(density)
            sound_speed = 0.12 * math.sqrt(temperature + 1.28e5)
            magnetosonic_speed = math.sqrt(alfven_speed**2 + sound_speed**2)
            if magnetosonic_speed > 0:
                magnetosonic_mach = wind_speed / magnetosonic_speed
                if math.isfinite(magnetosonic_mach):
                    values["magnetosonic_mach"] = magnetosonic_mach

    if kp is not None:
        ap = kp_to_ap(kp)
        if ap is not None:
            values["ap"] = ap


def source_series(
    rows: list[dict[str, Any]],
    *,
    field: str,
    source: str,
    issue_time: datetime,
    horizon: timedelta,
) -> list[tuple[datetime, float]]:
    by_time: dict[datetime, float] = {}
    for row in rows:
        observed = source_observed_at(row, source)
        try:
            received = aware_datetime(str(row["captured_at"]))
        except (KeyError, ValueError):
            continue
        value = row.get(field)
        if (
            observed is not None
            and issue_time - horizon <= observed <= issue_time
            and received <= issue_time
            and finite(value)
            and source_is_usable(row, source)
        ):
            by_time[observed] = float(value)
    return sorted(by_time.items())


@dataclass(frozen=True)
class VerifiedOperationalWeather:
    values: dict[str, float]
    source_watermark: datetime
    available_at: datetime
    provider: str = "solar-snapshots-v1"
    quality_flags: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        aware_datetime(self.source_watermark)
        aware_datetime(self.available_at)
        if self.source_watermark > self.available_at:
            raise ValueError("weather watermark cannot follow availability")
        if any(name not in (*RAW_WEATHER_FEATURES, *DERIVED_WEATHER_FEATURES) for name in self.values):
            raise ValueError("operational weather contains an unsupported feature")
        if any(not math.isfinite(float(value)) for value in self.values.values()):
            raise ValueError("operational weather values must be finite")


def build_operational_weather(
    rows: list[dict[str, Any]], issue_time: datetime
) -> VerifiedOperationalWeather | None:
    issue_time = aware_datetime(issue_time)
    values: dict[str, float] = {}
    observed_times: dict[str, datetime] = {}
    receipt_times: dict[str, datetime] = {}
    for output, field, source in FIELD_DEFINITIONS:
        selected = selected_field(
            rows,
            field=field,
            source=source,
            issue_time=issue_time,
        )
        if selected is None:
            continue
        value, observed, received = selected
        values[output] = value
        observed_times[source] = min(observed_times.get(source, observed), observed)
        receipt_times[source] = max(receipt_times.get(source, received), received)

    add_derived_physics_features(values)

    kp = source_series(
        rows,
        field="kp_index",
        source="kp",
        issue_time=issue_time,
        horizon=timedelta(hours=24),
    )
    if "kp" in values and kp:
        values["kp_max_24h"] = max(value for _, value in kp)
        cutoff = issue_time - timedelta(hours=3)
        prior = next(((time, value) for time, value in reversed(kp) if time <= cutoff), None)
        if prior is not None and cutoff - prior[0] <= timedelta(hours=1):
            values["kp_delta_3h"] = kp[-1][1] - prior[1]

    bz = source_series(
        rows,
        field="bz_gsm",
        source="magnetic_field",
        issue_time=issue_time,
        horizon=timedelta(hours=3),
    )
    if "bz_gsm" in values and bz:
        values["bz_min_3h"] = min(value for _, value in bz)
    dst = source_series(
        rows,
        field="dst_index",
        source="dst",
        issue_time=issue_time,
        horizon=timedelta(hours=6),
    )
    if "dst" in values and dst:
        values["dst_min_6h"] = min(value for _, value in dst)

    fast_times = [time for source, time in observed_times.items() if source in FAST_SOURCES]
    if not values or not fast_times or not receipt_times:
        return None
    return VerifiedOperationalWeather(
        values=values,
        source_watermark=min(fast_times),
        available_at=max(receipt_times.values()),
    )


class OperationalWeatherProvider(Protocol):
    name: str

    def lookup(self, *, issue_time: datetime) -> VerifiedOperationalWeather | None: ...


class UnavailableOperationalWeatherProvider:
    name = "unavailable"

    def lookup(self, *, issue_time: datetime) -> VerifiedOperationalWeather | None:
        return None


class PostgrestOperationalWeatherProvider:
    name = "solar-snapshots-v1"

    def __init__(
        self,
        *,
        base_url: str,
        service_key: str,
        timeout_seconds: float = 5.0,
        cache_seconds: int = 60,
        client: httpx.Client | None = None,
    ) -> None:
        if not base_url.strip() or not service_key.strip():
            raise RuntimeError("weather-store URL and service key are required")
        if cache_seconds < 0 or cache_seconds > 300:
            raise RuntimeError("weather cache must be between 0 and 300 seconds")
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.cache_seconds = cache_seconds
        self.client = client or httpx.Client(timeout=timeout_seconds)
        self._lock = threading.Lock()
        self._cache_key: str | None = None
        self._cache_until: datetime | None = None
        self._cache_value: VerifiedOperationalWeather | None = None

    def lookup(self, *, issue_time: datetime) -> VerifiedOperationalWeather | None:
        issue_time = aware_datetime(issue_time)
        key = issue_time.replace(second=0, microsecond=0).isoformat()
        now = datetime.now(timezone.utc)
        with self._lock:
            if self._cache_key == key and self._cache_until is not None and now < self._cache_until:
                return self._cache_value
        try:
            response = self.client.get(
                f"{self.base_url}/rest/v1/solar_snapshots",
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                },
                params=[
                    ("select", ",".join(SNAPSHOT_COLUMNS)),
                    ("captured_at", f"lte.{issue_time.isoformat()}"),
                    (
                        "captured_at",
                        f"gte.{(issue_time - timedelta(hours=30)).isoformat()}",
                    ),
                    ("order", "captured_at.asc"),
                    ("limit", "2000"),
                ],
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise RuntimeError("operational-weather lookup failed") from error
        if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
            raise RuntimeError("operational-weather lookup returned invalid JSON")
        value = build_operational_weather(payload, issue_time)
        with self._lock:
            self._cache_key = key
            self._cache_until = now + timedelta(seconds=self.cache_seconds)
            self._cache_value = value
        return value


def operational_weather_provider_from_environment() -> OperationalWeatherProvider:
    base_url = os.environ.get("PROPULSE_WEATHER_STORE_URL", "").strip()
    service_key = os.environ.get("PROPULSE_WEATHER_STORE_SERVICE_KEY", "").strip()
    if not base_url and not service_key:
        return UnavailableOperationalWeatherProvider()
    if not base_url or not service_key:
        raise RuntimeError("weather-store URL and service key must be configured together")
    return PostgrestOperationalWeatherProvider(
        base_url=base_url,
        service_key=service_key,
        cache_seconds=int(os.environ.get("PROPULSE_WEATHER_CACHE_SECONDS", "60")),
    )
