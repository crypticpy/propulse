"""Core nowcast/physics feature contracts for archive V4.2.

The V1 contract (``archive-v4-features-v1``) is the 91-feature nowcast order
frozen in ``ml/results/propagation_v4/propagation_v4_multiyear_50m/
development_results.json`` under ``candidates.M2_nowcast.features``. It
contains four raw space-weather channels that production can never serve --
``ae``, ``al``, ``au`` and ``pcn`` -- because the operational collector has no
source for them (they are OMNI2 archive-only columns).

The V2 contract (``archive-v4-features-v2``) removes those four raw channels
and their four ``{name}_missing`` companions while preserving the V1 order for
everything else, so a V2 booster consumes exactly the subset of the V1 matrix
that a live request can populate.

Sizes, given the frozen V1 order:

* V1 nowcast: 91 features
* V2 nowcast: 83 features (91 - 4 raw - 4 ``_missing``)
* V2 physics: 75 features (V2 nowcast - the 8 path-history lags)
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence


CORE_FEATURE_CONTRACT_V1 = "archive-v4-features-v1"
CORE_FEATURE_CONTRACT_V2 = "archive-v4-features-v2"

#: Raw OMNI2 space-weather channels the operational collector cannot supply.
UNSERVABLE_WEATHER = ("ae", "al", "au", "pcn")

#: Path-history lag horizons carried by the nowcast profile.
PATH_LAGS = (1, 2, 3, 24)

#: Nowcast-only path-history features, in frozen V1 order.
PATH_FEATURES = (
    *(f"path_success_prev{lag}" for lag in PATH_LAGS),
    *(f"path_prev{lag}_available" for lag in PATH_LAGS),
)

#: Offline-only path-history features carried by the V2 datasets under their
#: original grid4 semantics so the frozen V3/B2 baseline stays comparable.
WSPR_PATH_FEATURES = tuple(f"wspr_{name}" for name in PATH_FEATURES)

#: Plasma features ``add_derived_physics_features`` reconstructs at serving
#: time from the raw collector snapshot (ml/service/operational_weather.py).
DERIVED_PHYSICS_FEATURES = (
    "flow_pressure",
    "electric_field",
    "plasma_beta",
    "alfven_mach",
    "magnetosonic_mach",
    "ap",
)

EXPECTED_V1_NOWCAST_FEATURES = 91
EXPECTED_V2_NOWCAST_FEATURES = 83
EXPECTED_V2_PHYSICS_FEATURES = 75


class FeatureContractError(RuntimeError):
    """Raised when a feature list violates a core V4.2 feature contract."""


def _dropped_names() -> tuple[str, ...]:
    return (
        *UNSERVABLE_WEATHER,
        *(f"{name}_missing" for name in UNSERVABLE_WEATHER),
    )


def nowcast_features_v2(v1_features: Sequence[str]) -> list[str]:
    """Return the V2 nowcast order: V1 minus the four unservable channels.

    The relative order of every surviving feature is preserved exactly, so a
    V2 matrix is a column projection of the V1 matrix.
    """
    features = [str(value) for value in v1_features]
    if len(set(features)) != len(features):
        raise FeatureContractError("V1 feature order contains duplicates")
    dropped = _dropped_names()
    missing = [name for name in dropped if name not in features]
    if missing:
        raise FeatureContractError(
            f"V1 feature order does not carry the unservable channels: {missing}"
        )
    removed = set(dropped)
    return [name for name in features if name not in removed]


def physics_features_v2(v1_features: Sequence[str]) -> list[str]:
    """Return the V2 physics order: the V2 nowcast order minus path history."""
    features = nowcast_features_v2(v1_features)
    missing = [name for name in PATH_FEATURES if name not in features]
    if missing:
        raise FeatureContractError(
            f"V1 feature order does not carry the path lags: {missing}"
        )
    removed = set(PATH_FEATURES)
    return [name for name in features if name not in removed]


def _servable_weather() -> tuple[frozenset[str], frozenset[str]]:
    """Return ``(weather_universe, servable_weather)`` from the service code.

    ``weather_universe`` is every name the service treats as a space-weather
    feature; ``servable_weather`` is the subset a live request can populate,
    i.e. collector snapshot fields, plasma features derived from them, and the
    four short-window lookbacks.
    """
    import sys
    from pathlib import Path

    service = Path(__file__).resolve().parents[3] / "ml/service"
    if str(service) not in sys.path:
        sys.path.insert(0, str(service))

    from operational_weather import (  # noqa: PLC0415
        DERIVED_WEATHER_FEATURES,
        FIELD_DEFINITIONS,
        RAW_WEATHER_FEATURES,
    )

    snapshot = {str(output) for output, _field, _source in FIELD_DEFINITIONS}
    lookbacks = {str(name) for name in DERIVED_WEATHER_FEATURES}
    raw = {str(name) for name in RAW_WEATHER_FEATURES}
    servable = snapshot | set(DERIVED_PHYSICS_FEATURES) | lookbacks
    # Fail loudly if the service ever grows or loses a channel: the V2 drop
    # list must stay exactly the raw channels with no serving path.
    if raw - servable != set(UNSERVABLE_WEATHER):
        raise FeatureContractError(
            "operational weather inventory no longer matches UNSERVABLE_WEATHER: "
            f"{sorted(raw - servable)}"
        )
    return frozenset(raw | lookbacks), frozenset(servable)


def assert_servable(features: Iterable[str]) -> None:
    """Raise if any weather feature in ``features`` cannot be served live.

    Non-weather features (geometry, time, band one-hots, path history) are
    ignored; a ``{name}_missing`` companion is checked against ``{name}``.
    """
    universe, servable = _servable_weather()
    offenders: list[str] = []
    for value in features:
        name = str(value)
        base = name[: -len("_missing")] if name.endswith("_missing") else name
        if base in universe and base not in servable:
            offenders.append(name)
    if offenders:
        raise FeatureContractError(
            f"feature list contains unservable weather features: {offenders}"
        )


def core_feature_contract(config: dict) -> str:
    """Return the contract a phase-2 config declares.

    The top-level ``core_feature_contract`` key is authoritative. Each
    candidate's ``features`` tag must agree with it (``"v4"`` for V1,
    ``"v2"`` for V2) so a config cannot half-migrate.
    """
    contract = str(config.get("core_feature_contract", CORE_FEATURE_CONTRACT_V1))
    if contract not in (CORE_FEATURE_CONTRACT_V1, CORE_FEATURE_CONTRACT_V2):
        raise FeatureContractError(f"unknown core feature contract: {contract}")
    expected = "v2" if contract == CORE_FEATURE_CONTRACT_V2 else "v4"
    for name, definition in dict(config.get("candidates", {})).items():
        tag = str(definition.get("features"))
        if tag != expected:
            raise FeatureContractError(
                f"{name} declares features {tag!r}; {contract} requires {expected!r}"
            )
    return contract


def is_v2(config: dict) -> bool:
    return core_feature_contract(config) == CORE_FEATURE_CONTRACT_V2


def nowcast_features(config: dict, v1_features: Sequence[str]) -> list[str]:
    """Return the nowcast order the config's contract selects."""
    if is_v2(config):
        return nowcast_features_v2(v1_features)
    return [str(value) for value in v1_features]
