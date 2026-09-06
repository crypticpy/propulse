"""Native runtime checks and bounded thread configuration per execution profile.

Two execution profiles exist. ``m5`` is the Apple Silicon host that owns the
whole chain: cohort builds, scoring, gates and packaging all keep requiring
``compute.required_profile``. ``linux_gpu`` is a CUDA training box that may run
the phase-2 and phase-3 candidate fits only, so the trees are fit on the GPU
while every other stage still runs on the M5.

The two profiles must produce artifacts under the same repository-relative
names, so the only profile-dependent paths are the external storage roots. The
M5 reaches its external storage through the ``ml/data/processed``, ``ml/data/raw``,
``ml/data/bronze`` and ``ml/models`` symlinks; the Linux box has its own root
and ``artifact_path`` remaps the recorded paths onto it.
"""

from __future__ import annotations

import copy
import os
import platform
import re
import shutil
import subprocess
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pyarrow as pa


M5_PROFILE = "m5"
LINUX_GPU_PROFILE = "linux_gpu"
#: ``compute`` sub-block that holds each profile's hardware contract.
PROFILE_SECTIONS = {M5_PROFILE: "apple_silicon", LINUX_GPU_PROFILE: "linux_gpu"}
#: Repository trees that are symlinks into the external storage root.
EXTERNAL_TREE_PREFIXES = (
    "ml/data/processed",
    "ml/data/raw",
    "ml/data/bronze",
    "ml/models",
)
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class RuntimeProfileError(RuntimeError):
    """Raised when a workflow is launched on the wrong runtime profile."""


class M5RuntimeError(RuntimeProfileError):
    """Raised when an M5-only workflow is launched on the wrong runtime."""


class LinuxGpuRuntimeError(RuntimeProfileError):
    """Raised when the CUDA training box does not meet the profile contract."""


def _run(args: tuple[str, ...], *, error: type[RuntimeProfileError]) -> str:
    try:
        return subprocess.run(
            args,
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.SubprocessError) as failure:
        raise error(f"runtime probe failed: {' '.join(args)}") from failure


def _command(*args: str) -> str:
    return _run(args, error=M5RuntimeError)


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


def _thermal_snapshot() -> tuple[str, dict[str, int]]:
    status = _command("/usr/bin/pmset", "-g", "therm")
    limits: dict[str, int] = {}
    for name in ("CPU_Speed_Limit", "Scheduler_Limit", "CPU_Available"):
        match = re.search(rf"{name}\s*=\s*(\d+)", status)
        if match:
            limits[name] = int(match.group(1))
    return status, limits


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
    required_power_source = str(hardware.get("required_power_source", "AC Power"))
    if power_source != required_power_source:
        raise M5RuntimeError(
            f"power source must be {required_power_source}; got {power_source}"
        )
    required_power_mode = int(hardware.get("required_ac_power_mode", 2))
    if power_modes.get(required_power_source) != required_power_mode:
        raise M5RuntimeError(
            f"{required_power_source} power mode must be {required_power_mode}; got "
            f"{power_modes.get(required_power_source)}"
        )
    thermal_status, thermal_limits = _thermal_snapshot()
    limited = {name: value for name, value in thermal_limits.items() if value < 100}
    if limited:
        raise M5RuntimeError(f"macOS reports constrained CPU execution: {limited}")
    output: dict[str, Any] = {
        "profile": M5_PROFILE,
        "machine": machine,
        "physical_cores_visible": physical_cores,
        "os_cpu_count": visible_cores,
        "core_clusters": clusters,
        "configured_performance_cores": int(hardware["performance_cores"]),
        "configured_efficiency_cores": int(hardware["efficiency_cores"]),
        "unified_memory_gb": memory_gb,
        "power_source": power_source,
        "required_power_source": required_power_source,
        "power_modes": power_modes,
        "required_ac_power_mode": required_power_mode,
        "thermal_status": thermal_status,
        "thermal_limits": thermal_limits,
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


def _meminfo_total_gb(path: str = "/proc/meminfo") -> float:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as error:
        raise LinuxGpuRuntimeError(f"cannot read host memory from {path}") from error
    match = re.search(r"^MemTotal:\s+(\d+)\s+kB", text, re.MULTILINE)
    if not match:
        raise LinuxGpuRuntimeError(f"{path} does not report MemTotal")
    return int(match.group(1)) * 1024 / 1024**3


def _linux_physical_cores(path: str = "/proc/cpuinfo") -> int:
    """Distinct socket/core pairs, falling back to the visible CPU count."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return int(os.cpu_count() or 0)
    cores: set[tuple[str, str]] = set()
    socket: str | None = None
    core: str | None = None
    for line in text.splitlines():
        if ":" not in line:
            socket = core = None
            continue
        key, _, value = (part.strip() for part in line.partition(":"))
        if key == "physical id":
            socket = value
        elif key == "core id":
            core = value
        if socket is not None and core is not None:
            cores.add((socket, core))
            socket = core = None
    return len(cores) or int(os.cpu_count() or 0)


def _nvidia_gpus() -> list[dict[str, Any]]:
    """Free/total VRAM in GiB and the device name for every visible GPU."""
    output = _run(
        (
            "nvidia-smi",
            "--query-gpu=memory.free,memory.total,name",
            "--format=csv,noheader,nounits",
        ),
        error=LinuxGpuRuntimeError,
    )
    gpus: list[dict[str, Any]] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        fields = [value.strip() for value in line.split(",")]
        if len(fields) < 3:
            raise LinuxGpuRuntimeError(f"unparsable nvidia-smi row: {line}")
        try:
            free_mib = float(fields[0])
            total_mib = float(fields[1])
        except ValueError as error:
            raise LinuxGpuRuntimeError(f"unparsable nvidia-smi row: {line}") from error
        gpus.append(
            {
                "name": ",".join(fields[2:]).strip(),
                "free_vram_gb": free_mib / 1024,
                "total_vram_gb": total_mib / 1024,
            }
        )
    if not gpus:
        raise LinuxGpuRuntimeError("nvidia-smi reported no CUDA device")
    return gpus


def _free_disk_gb(path: str) -> float:
    try:
        return shutil.disk_usage(path).free / 1024**3
    except OSError as error:
        raise LinuxGpuRuntimeError(f"cannot read free space at {path}") from error


def validate_linux_gpu_runtime(
    config: Mapping[str, Any],
    *,
    xgboost_module: Any | None = None,
) -> dict[str, Any]:
    """Validate the CUDA training box and return the same telemetry shape."""
    hardware = profile_settings(config, LINUX_GPU_PROFILE)
    system = platform.system()
    if system != "Linux":
        raise LinuxGpuRuntimeError(
            f"the linux_gpu profile requires Linux, detected {system}"
        )
    machine = platform.machine()
    if machine != str(hardware["required_machine"]):
        raise LinuxGpuRuntimeError(
            f"linux_gpu run requires {hardware['required_machine']}, "
            f"detected {machine}"
        )
    minimum_cores = int(hardware["minimum_physical_cores"])
    visible_cores = int(os.cpu_count() or 0)
    physical_cores = _linux_physical_cores()
    if physical_cores < minimum_cores or visible_cores < minimum_cores:
        raise LinuxGpuRuntimeError(
            f"linux_gpu run requires {minimum_cores} physical cores; detected "
            f"{physical_cores} physical and {visible_cores} visible"
        )
    memory_gb = _meminfo_total_gb()
    minimum_ram_gb = float(hardware["minimum_ram_gb"])
    if memory_gb < minimum_ram_gb:
        raise LinuxGpuRuntimeError(
            f"host memory {memory_gb:.1f} GiB is below the configured "
            f"{minimum_ram_gb:.1f} GiB minimum"
        )
    gpus = _nvidia_gpus()
    gpu = max(gpus, key=lambda value: float(value["free_vram_gb"]))
    minimum_vram_gb = float(hardware["minimum_free_vram_gb"])
    if float(gpu["free_vram_gb"]) < minimum_vram_gb:
        raise LinuxGpuRuntimeError(
            f"free VRAM {gpu['free_vram_gb']:.1f} GiB on {gpu['name']} is below "
            f"the configured {minimum_vram_gb:.1f} GiB minimum"
        )
    active = config["compute"].get("active_profile") or {}
    external_root = str(
        active["external_root"]
        if active.get("name") == LINUX_GPU_PROFILE
        else hardware["external_root"]
    )
    free_disk_gb = _free_disk_gb(external_root)
    minimum_disk_gb = float(hardware["minimum_free_disk_gb"])
    if free_disk_gb < minimum_disk_gb:
        raise LinuxGpuRuntimeError(
            f"free space {free_disk_gb:.1f} GiB at {external_root} is below the "
            f"configured {minimum_disk_gb:.1f} GiB minimum"
        )
    output: dict[str, Any] = {
        "profile": LINUX_GPU_PROFILE,
        "system": system,
        "machine": machine,
        "physical_cores_visible": physical_cores,
        "os_cpu_count": visible_cores,
        "minimum_physical_cores": minimum_cores,
        # Named for shape parity with the M5 snapshot; on the box this is plain
        # host RAM, not unified memory.
        "unified_memory_gb": memory_gb,
        "external_root": external_root,
        "free_disk_gb": free_disk_gb,
        "gpu": {
            "name": str(gpu["name"]),
            "free_vram_gb": float(gpu["free_vram_gb"]),
            "total_vram_gb": float(gpu["total_vram_gb"]),
            "visible_devices": [str(value["name"]) for value in gpus],
        },
        "python_version": platform.python_version(),
    }
    if xgboost_module is not None:
        build = xgboost_module.build_info()
        if not bool(build.get("USE_CUDA")):
            raise LinuxGpuRuntimeError(
                "XGBoost must be built with CUDA on the linux_gpu profile"
            )
        output.update(
            {
                "xgboost_cuda": True,
                "xgboost_openmp": bool(build.get("USE_OPENMP")),
                "xgboost_version": xgboost_module.__version__,
            }
        )
    return output


def validate_runtime(
    config: Mapping[str, Any],
    profile: str,
    *,
    xgboost_module: Any | None = None,
) -> dict[str, Any]:
    """Validate the host for one execution profile."""
    if profile == M5_PROFILE:
        return validate_m5_runtime(config, xgboost_module=xgboost_module)
    if profile == LINUX_GPU_PROFILE:
        return validate_linux_gpu_runtime(config, xgboost_module=xgboost_module)
    raise RuntimeProfileError(f"unknown execution profile: {profile}")


def supported_profiles(config: Mapping[str, Any]) -> tuple[str, ...]:
    """Profiles this config allows, defaulting to its required profile."""
    compute = config["compute"]
    declared = compute.get("supported_profiles")
    if not declared:
        return (str(compute["required_profile"]),)
    return tuple(str(value) for value in declared)


def profile_settings(config: Mapping[str, Any], profile: str) -> Mapping[str, Any]:
    """The hardware contract block for a profile this config supports."""
    if profile not in PROFILE_SECTIONS:
        raise RuntimeProfileError(f"unknown execution profile: {profile}")
    if profile not in supported_profiles(config):
        raise RuntimeProfileError(
            f"config supports {supported_profiles(config)}, not {profile}"
        )
    section = PROFILE_SECTIONS[profile]
    if section not in config["compute"]:
        raise RuntimeProfileError(f"compute.{section} is missing for {profile}")
    return config["compute"][section]


def _rebase(value: str, source: str, target: str) -> str:
    if source == target:
        return value
    path = Path(value)
    try:
        return str(Path(target) / path.relative_to(source))
    except ValueError:
        return value


def resolve_compute_profile(
    config: Mapping[str, Any],
    profile: str,
    *,
    data_root_override: str | None = None,
) -> dict[str, Any]:
    """Deep copy of ``config`` with ``compute.active_profile`` resolved.

    The M5 roots stay in ``compute`` so recorded artifact paths never move; the
    active profile carries the roots this process must actually read and write,
    plus the M5 root the manifests were written against so ``artifact_path``
    can remap them.
    """
    settings = profile_settings(config, profile)
    compute = config["compute"]
    declared_root = str(settings.get("external_root", compute["external_root"]))
    external_root = declared_root
    if data_root_override is not None:
        if profile == M5_PROFILE:
            raise RuntimeProfileError(
                "the m5 profile roots are frozen; --data-root-override is "
                "linux_gpu only"
            )
        external_root = str(data_root_override)
    resolved = copy.deepcopy(dict(config))
    resolved["compute"]["active_profile"] = {
        "name": profile,
        "external_root": external_root,
        "data_root": _rebase(
            str(settings.get("data_root", compute["data_root"])),
            declared_root,
            external_root,
        ),
        "temp_root": _rebase(
            str(settings.get("temp_root", compute["temp_root"])),
            declared_root,
            external_root,
        ),
        "maximum_rss_gb": float(
            settings.get("maximum_rss_gb", compute["maximum_rss_gb"])
        ),
        "source_external_root": str(compute["external_root"]),
    }
    return resolved


def active_profile(config: Mapping[str, Any]) -> dict[str, Any]:
    """The resolved profile roots, defaulting to the M5 roots in ``compute``."""
    compute = config["compute"]
    active = compute.get("active_profile")
    if active:
        return dict(active)
    return {
        "name": str(compute.get("required_profile", M5_PROFILE)),
        "external_root": str(compute["external_root"]),
        "data_root": str(compute["data_root"]),
        "temp_root": str(compute["temp_root"]),
        "maximum_rss_gb": float(compute["maximum_rss_gb"]),
        "source_external_root": str(compute["external_root"]),
    }


def profile_name(config: Mapping[str, Any]) -> str:
    return str(active_profile(config)["name"])


def external_root(config: Mapping[str, Any]) -> Path:
    return Path(str(active_profile(config)["external_root"]))


def temp_root(config: Mapping[str, Any]) -> Path:
    return Path(str(active_profile(config)["temp_root"]))


def maximum_rss_gb(config: Mapping[str, Any]) -> float:
    return float(active_profile(config)["maximum_rss_gb"])


def artifact_path(
    item_path: str,
    config: Mapping[str, Any] | None = None,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> Path:
    """Where this profile reads an artifact the manifest recorded on the M5.

    Manifests record repository-relative paths whose data trees are symlinks
    into the M5 external root, and continuation checkpoints may record absolute
    M5 paths. Under a profile with its own external root both forms are remapped
    onto that root; repository-internal paths (manifests, results) are left
    alone.
    """
    raw = Path(str(item_path))
    if config is None:
        return raw if raw.is_absolute() else repository_root / raw
    active = active_profile(config)
    source = str(active["source_external_root"])
    target = str(active["external_root"])
    if raw.is_absolute():
        if source == target:
            return raw
        try:
            return Path(target) / raw.relative_to(source)
        except ValueError as error:
            raise RuntimeProfileError(
                f"absolute artifact path is outside {source}: {raw}"
            ) from error
    if source == target:
        return repository_root / raw
    posix = raw.as_posix()
    for prefix in EXTERNAL_TREE_PREFIXES:
        if posix == prefix or posix.startswith(f"{prefix}/"):
            return Path(target) / Path(posix).relative_to("ml")
    return repository_root / raw


def configure_arrow_threads(
    config: Mapping[str, Any],
    *,
    parallel_fit: bool,
    profile: str = M5_PROFILE,
) -> dict[str, int]:
    """Allocate Arrow pools without oversubscribing the XGBoost workers."""
    hardware = config["compute"][PROFILE_SECTIONS[profile]]
    cpu_threads = int(
        hardware["threads_per_parallel_fit"]
        if parallel_fit
        else hardware.get("physical_cores", hardware["threads_per_parallel_fit"])
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
