"""Native Apple Silicon runtime checks and bounded thread configuration."""

from __future__ import annotations

import os
import platform
import re
import subprocess
from collections.abc import Mapping
from typing import Any

import pyarrow as pa


class M5RuntimeError(RuntimeError):
    """Raised when an M5-only workflow is launched on the wrong runtime."""


def _command(*args: str) -> str:
    try:
        return subprocess.run(
            args,
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.SubprocessError) as error:
        raise M5RuntimeError(f"runtime probe failed: {' '.join(args)}") from error


def _sysctl_int(name: str) -> int:
    return int(_command("/usr/sbin/sysctl", "-n", name))


def _power_snapshot() -> tuple[str, dict[str, int]]:
    battery = _command("/usr/bin/pmset", "-g", "batt")
    match = re.search(r"Now drawing from '([^']+)'", battery)
    source = match.group(1) if match else "unknown"
    custom = _command("/usr/bin/pmset", "-g", "custom")
    modes: dict[str, int] = {}
    section: str | None = None
    for line in custom.splitlines():
        stripped = line.strip()
        if stripped.endswith("Power:"):
            section = stripped.removesuffix(":")
            continue
        mode = re.fullmatch(r"powermode\s+(\d+)", stripped)
        if section and mode:
            modes[section] = int(mode.group(1))
    return source, modes


def validate_m5_runtime(
    config: Mapping[str, Any],
    *,
    xgboost_module: Any | None = None,
) -> dict[str, Any]:
    """Validate the native host and return reproducible hardware telemetry."""
    hardware = config["compute"]["apple_silicon"]
    machine = platform.machine()
    visible_cores = int(os.cpu_count() or 0)
    if machine != str(hardware["required_machine"]):
        raise M5RuntimeError(
            f"M5 run requires {hardware['required_machine']}, detected {machine}"
        )
    required_cores = int(hardware["physical_cores"])
    physical_cores = _sysctl_int("hw.physicalcpu")
    if visible_cores < required_cores or physical_cores < required_cores:
        raise M5RuntimeError(
            f"M5 run requires {required_cores} physical cores; detected "
            f"{physical_cores} physical and {visible_cores} visible"
        )
    clusters = sorted(
        (
            _sysctl_int("hw.perflevel0.physicalcpu"),
            _sysctl_int("hw.perflevel1.physicalcpu"),
        )
    )
    expected_clusters = sorted(
        (
            int(hardware["performance_cores"]),
            int(hardware["efficiency_cores"]),
        )
    )
    if clusters != expected_clusters:
        raise M5RuntimeError(
            f"M5 core clusters changed: expected {expected_clusters}, got {clusters}"
        )
    memory_bytes = _sysctl_int("hw.memsize")
    memory_gb = memory_bytes / 1024**3
    if memory_gb < float(config["compute"]["maximum_rss_gb"]):
        raise M5RuntimeError(
            f"host memory {memory_gb:.1f} GiB is below the configured RSS ceiling"
        )
    power_source, power_modes = _power_snapshot()
    required_power_mode = int(hardware.get("required_ac_power_mode", 2))
    if power_source == "AC Power" and power_modes.get("AC Power") != required_power_mode:
        raise M5RuntimeError(
            f"AC power mode must be {required_power_mode}; got "
            f"{power_modes.get('AC Power')}"
        )
    output: dict[str, Any] = {
        "machine": machine,
        "physical_cores_visible": physical_cores,
        "os_cpu_count": visible_cores,
        "core_clusters": clusters,
        "configured_performance_cores": int(hardware["performance_cores"]),
        "configured_efficiency_cores": int(hardware["efficiency_cores"]),
        "unified_memory_gb": memory_gb,
        "power_source": power_source,
        "power_modes": power_modes,
        "required_ac_power_mode": required_power_mode,
        "python_version": platform.python_version(),
    }
    if xgboost_module is not None:
        build = xgboost_module.build_info()
        if not bool(build.get("USE_OPENMP")):
            raise M5RuntimeError("XGBoost must be built with OpenMP on the M5")
        output.update(
            {
                "xgboost_openmp": True,
                "xgboost_cuda": bool(build.get("USE_CUDA")),
                "xgboost_version": xgboost_module.__version__,
            }
        )
    return output


def configure_arrow_threads(
    config: Mapping[str, Any],
    *,
    parallel_fit: bool,
) -> dict[str, int]:
    """Allocate Arrow pools without oversubscribing the XGBoost workers."""
    hardware = config["compute"]["apple_silicon"]
    cpu_threads = int(
        hardware["threads_per_parallel_fit"]
        if parallel_fit
        else hardware["physical_cores"]
    )
    io_threads = int(
        hardware["arrow_io_threads_per_fit"]
        if parallel_fit
        else hardware.get("arrow_io_threads_single_process", 6)
    )
    pa.set_cpu_count(cpu_threads)
    pa.set_io_thread_count(io_threads)
    return {
        "arrow_cpu_threads": pa.cpu_count(),
        "arrow_io_threads": pa.io_thread_count(),
    }
