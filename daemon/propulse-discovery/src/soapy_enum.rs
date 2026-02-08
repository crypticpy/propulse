use std::ffi::CStr;
use std::os::raw::c_char;

use libloading::{Library, Symbol};

#[derive(Debug, Clone)]
pub struct SoapyDeviceInfo {
  pub driver: String,
  pub label: String,
  pub serial: Option<String>,
}

/// Enumerate SoapySDR devices.
///
/// The full SoapySDR backend requires the SoapySDR shared library and vendor
/// modules to be installed on the host. If SoapySDR isn't available, this
/// returns an empty list.
pub fn enumerate_soapy_devices() -> anyhow::Result<Vec<SoapyDeviceInfo>> {
  let Some(lib) = load_soapy_library() else {
    return Ok(Vec::new());
  };

  unsafe {
    let enumerate: Symbol<SoapyDeviceEnumerate> = lib.get(b"SoapySDRDevice_enumerate\0")?;
    let clear: Symbol<SoapyKwargsListClear> = lib.get(b"SoapySDRKwargsList_clear\0")?;

    let mut len: usize = 0;
    let ptr = enumerate(std::ptr::null(), &mut len as *mut usize);
    if ptr.is_null() || len == 0 {
      return Ok(Vec::new());
    }

    let list = std::slice::from_raw_parts(ptr, len);
    let mut out = Vec::with_capacity(len);
    for kwargs in list {
      let driver = get_kwarg(kwargs, "driver").unwrap_or_else(|| "unknown".to_string());
      let label = get_kwarg(kwargs, "label").unwrap_or_else(|| driver.clone());
      let serial = get_kwarg(kwargs, "serial");
      out.push(SoapyDeviceInfo { driver, label, serial });
    }

    clear(ptr, len);
    Ok(out)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal SoapySDR C API bindings (dynamic)
// ─────────────────────────────────────────────────────────────────────────────

#[repr(C)]
struct SoapySDRKwargs {
  size: usize,
  keys: *mut *mut c_char,
  vals: *mut *mut c_char,
}

type SoapyDeviceEnumerate = unsafe extern "C" fn(*const SoapySDRKwargs, *mut usize) -> *mut SoapySDRKwargs;
type SoapyKwargsListClear = unsafe extern "C" fn(*mut SoapySDRKwargs, usize);

fn load_soapy_library() -> Option<Library> {
  #[cfg(target_os = "windows")]
  const CANDIDATES: [&str; 1] = ["SoapySDR.dll"];

  #[cfg(target_os = "macos")]
  const CANDIDATES: [&str; 3] = ["libSoapySDR.dylib", "libSoapySDR.0.8.dylib", "libSoapySDR.0.7.dylib"];

  #[cfg(all(unix, not(target_os = "macos")))]
  const CANDIDATES: [&str; 5] = [
    "libSoapySDR.so",
    "libSoapySDR.so.0.8",
    "libSoapySDR.so.0.7",
    "libSoapySDR.so.0.6",
    "libSoapySDR.so.0.5",
  ];

  for name in CANDIDATES {
    if let Ok(lib) = unsafe { Library::new(name) } {
      return Some(lib);
    }
  }
  None
}

unsafe fn get_kwarg(kwargs: &SoapySDRKwargs, key: &str) -> Option<String> {
  if kwargs.size == 0 || kwargs.keys.is_null() || kwargs.vals.is_null() {
    return None;
  }

  for i in 0..kwargs.size {
    let kptr = *kwargs.keys.add(i);
    if kptr.is_null() {
      continue;
    }
    let k = CStr::from_ptr(kptr).to_string_lossy();
    if k != key {
      continue;
    }

    let vptr = *kwargs.vals.add(i);
    if vptr.is_null() {
      return None;
    }
    let v = CStr::from_ptr(vptr).to_string_lossy().to_string();
    if v.trim().is_empty() {
      return None;
    }
    return Some(v);
  }

  None
}
