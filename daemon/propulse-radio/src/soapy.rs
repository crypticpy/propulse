use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_long, c_longlong, c_void};
use std::sync::Arc;

use libloading::Library;
use num_complex::Complex;

const SOAPY_SDR_RX: c_int = 0;
const SOAPY_SDR_TIMEOUT: c_int = -1;

#[repr(C)]
struct SoapySDRDevice {
  _private: [u8; 0],
}

#[repr(C)]
struct SoapySDRStream {
  _private: [u8; 0],
}

#[repr(C)]
struct SoapySDRKwargs {
  size: usize,
  keys: *mut *mut c_char,
  vals: *mut *mut c_char,
}

type SoapySDRDeviceLastError = unsafe extern "C" fn() -> *const c_char;
type SoapySDRErrToStr = unsafe extern "C" fn(c_int) -> *const c_char;
type SoapySDRDeviceMake = unsafe extern "C" fn(*const SoapySDRKwargs) -> *mut SoapySDRDevice;
type SoapySDRDeviceUnmake = unsafe extern "C" fn(*mut SoapySDRDevice) -> c_int;
type SoapySDRDeviceSetFrequency =
  unsafe extern "C" fn(*mut SoapySDRDevice, c_int, usize, f64, *const SoapySDRKwargs) -> c_int;
type SoapySDRDeviceSetSampleRate =
  unsafe extern "C" fn(*mut SoapySDRDevice, c_int, usize, f64) -> c_int;
type SoapySDRDeviceSetAntenna =
  unsafe extern "C" fn(*mut SoapySDRDevice, c_int, usize, *const c_char) -> c_int;
type SoapySDRDeviceSetGainElement =
  unsafe extern "C" fn(*mut SoapySDRDevice, c_int, usize, *const c_char, f64) -> c_int;
type SoapySDRDeviceSetupStream =
  unsafe extern "C" fn(*mut SoapySDRDevice, c_int, *const c_char, *const usize, usize, *const SoapySDRKwargs)
    -> *mut SoapySDRStream;
type SoapySDRDeviceCloseStream = unsafe extern "C" fn(*mut SoapySDRDevice, *mut SoapySDRStream) -> c_int;
type SoapySDRDeviceActivateStream =
  unsafe extern "C" fn(*mut SoapySDRDevice, *mut SoapySDRStream, c_int, c_longlong, usize) -> c_int;
type SoapySDRDeviceDeactivateStream =
  unsafe extern "C" fn(*mut SoapySDRDevice, *mut SoapySDRStream, c_int, c_longlong) -> c_int;
type SoapySDRDeviceReadStream =
  unsafe extern "C" fn(*mut SoapySDRDevice, *mut SoapySDRStream, *const *mut c_void, usize, *mut c_int, *mut c_longlong, c_long)
    -> c_int;

struct SoapyApi {
  _lib: Library,
  last_error: SoapySDRDeviceLastError,
  err_to_str: Option<SoapySDRErrToStr>,
  make: SoapySDRDeviceMake,
  unmake: SoapySDRDeviceUnmake,
  set_frequency: SoapySDRDeviceSetFrequency,
  set_sample_rate: SoapySDRDeviceSetSampleRate,
  set_antenna: SoapySDRDeviceSetAntenna,
  set_gain_element: SoapySDRDeviceSetGainElement,
  setup_stream: SoapySDRDeviceSetupStream,
  close_stream: SoapySDRDeviceCloseStream,
  activate_stream: SoapySDRDeviceActivateStream,
  deactivate_stream: SoapySDRDeviceDeactivateStream,
  read_stream: SoapySDRDeviceReadStream,
}

impl SoapyApi {
  fn load() -> anyhow::Result<Self> {
    let lib = load_soapy_library().ok_or_else(|| anyhow::anyhow!("SoapySDR library not found"))?;

    unsafe {
      let last_error = *lib.get::<SoapySDRDeviceLastError>(b"SoapySDRDevice_lastError\0")?;
      let make = *lib.get::<SoapySDRDeviceMake>(b"SoapySDRDevice_make\0")?;
      let unmake = *lib.get::<SoapySDRDeviceUnmake>(b"SoapySDRDevice_unmake\0")?;
      let set_frequency = *lib.get::<SoapySDRDeviceSetFrequency>(b"SoapySDRDevice_setFrequency\0")?;
      let set_sample_rate = *lib.get::<SoapySDRDeviceSetSampleRate>(b"SoapySDRDevice_setSampleRate\0")?;
      let set_antenna = *lib.get::<SoapySDRDeviceSetAntenna>(b"SoapySDRDevice_setAntenna\0")?;
      let set_gain_element = *lib.get::<SoapySDRDeviceSetGainElement>(b"SoapySDRDevice_setGainElement\0")?;
      let setup_stream = *lib.get::<SoapySDRDeviceSetupStream>(b"SoapySDRDevice_setupStream\0")?;
      let close_stream = *lib.get::<SoapySDRDeviceCloseStream>(b"SoapySDRDevice_closeStream\0")?;
      let activate_stream = *lib.get::<SoapySDRDeviceActivateStream>(b"SoapySDRDevice_activateStream\0")?;
      let deactivate_stream = *lib.get::<SoapySDRDeviceDeactivateStream>(b"SoapySDRDevice_deactivateStream\0")?;
      let read_stream = *lib.get::<SoapySDRDeviceReadStream>(b"SoapySDRDevice_readStream\0")?;
      let err_to_str = lib
        .get::<SoapySDRErrToStr>(b"SoapySDR_errToStr\0")
        .ok()
        .map(|s| *s);

      Ok(Self {
        _lib: lib,
        last_error,
        err_to_str,
        make,
        unmake,
        set_frequency,
        set_sample_rate,
        set_antenna,
        set_gain_element,
        setup_stream,
        close_stream,
        activate_stream,
        deactivate_stream,
        read_stream,
      })
    }
  }

  fn last_error_string(&self) -> String {
    let ptr = unsafe { (self.last_error)() };
    if ptr.is_null() {
      return "Unknown SoapySDR error".to_string();
    }
    unsafe { CStr::from_ptr(ptr).to_string_lossy().to_string() }
  }

  fn err_string(&self, code: c_int) -> String {
    if let Some(f) = self.err_to_str {
      let ptr = unsafe { f(code) };
      if !ptr.is_null() {
        return unsafe { CStr::from_ptr(ptr).to_string_lossy().to_string() };
      }
    }
    self.last_error_string()
  }
}

struct SoapyDeviceInner {
  api: SoapyApi,
  device: *mut SoapySDRDevice,
}

// The underlying SoapySDR device handle is an opaque pointer managed by the SoapySDR
// library. The daemon uses it behind safe method boundaries and may call into the
// C API from different threads (reader + control). SoapySDR is designed for this
// usage pattern; treat the handle as Send/Sync.
unsafe impl Send for SoapyDeviceInner {}
unsafe impl Sync for SoapyDeviceInner {}

impl Drop for SoapyDeviceInner {
  fn drop(&mut self) {
    unsafe {
      let _ = (self.api.unmake)(self.device);
    }
  }
}

#[derive(Clone)]
pub struct SoapyDevice {
  inner: Arc<SoapyDeviceInner>,
}

impl SoapyDevice {
  pub fn open(kwargs: &HashMap<String, String>) -> anyhow::Result<Self> {
    let api = SoapyApi::load()?;
    let owned = KwargsOwned::new(kwargs);
    let dev = unsafe { (api.make)(owned.as_ptr()) };
    if dev.is_null() {
      return Err(anyhow::anyhow!(api.last_error_string()));
    }

    Ok(Self {
      inner: Arc::new(SoapyDeviceInner { api, device: dev }),
    })
  }

  pub fn set_sample_rate(&self, sample_rate: u32) -> anyhow::Result<()> {
    let rc = unsafe { (self.inner.api.set_sample_rate)(self.inner.device, SOAPY_SDR_RX, 0, sample_rate as f64) };
    if rc != 0 {
      return Err(anyhow::anyhow!(self.inner.api.err_string(rc)));
    }
    Ok(())
  }

  pub fn set_frequency(&self, frequency_hz: u64) -> anyhow::Result<()> {
    let rc = unsafe {
      (self.inner.api.set_frequency)(
        self.inner.device,
        SOAPY_SDR_RX,
        0,
        frequency_hz as f64,
        std::ptr::null(),
      )
    };
    if rc != 0 {
      return Err(anyhow::anyhow!(self.inner.api.err_string(rc)));
    }
    Ok(())
  }

  pub fn set_antenna(&self, name: &str) -> anyhow::Result<()> {
    let cname = CString::new(name)?;
    let rc = unsafe {
      (self.inner.api.set_antenna)(self.inner.device, SOAPY_SDR_RX, 0, cname.as_ptr())
    };
    if rc != 0 {
      return Err(anyhow::anyhow!(self.inner.api.err_string(rc)));
    }
    Ok(())
  }

  pub fn set_gain_element(&self, stage: &str, value: f32) -> anyhow::Result<()> {
    let cname = CString::new(stage)?;
    let rc = unsafe {
      (self.inner.api.set_gain_element)(
        self.inner.device,
        SOAPY_SDR_RX,
        0,
        cname.as_ptr(),
        value as f64,
      )
    };
    if rc != 0 {
      return Err(anyhow::anyhow!(self.inner.api.err_string(rc)));
    }
    Ok(())
  }

  pub fn setup_rx_stream_cf32(&self) -> anyhow::Result<SoapyRxStream> {
    let format = CString::new("CF32")?;
    let channels = [0usize];
    let stream = unsafe {
      (self.inner.api.setup_stream)(
        self.inner.device,
        SOAPY_SDR_RX,
        format.as_ptr(),
        channels.as_ptr(),
        channels.len(),
        std::ptr::null(),
      )
    };
    if stream.is_null() {
      return Err(anyhow::anyhow!(self.inner.api.last_error_string()));
    }

    Ok(SoapyRxStream {
      device: self.clone(),
      stream,
    })
  }
}

pub struct SoapyRxStream {
  device: SoapyDevice,
  stream: *mut SoapySDRStream,
}

impl SoapyRxStream {
  pub fn activate(&self) -> anyhow::Result<()> {
    let rc = unsafe {
      (self.device.inner.api.activate_stream)(self.device.inner.device, self.stream, 0, 0, 0)
    };
    if rc != 0 {
      return Err(anyhow::anyhow!(self.device.inner.api.err_string(rc)));
    }
    Ok(())
  }

  pub fn deactivate(&self) -> anyhow::Result<()> {
    let rc = unsafe {
      (self.device.inner.api.deactivate_stream)(self.device.inner.device, self.stream, 0, 0)
    };
    if rc != 0 {
      return Err(anyhow::anyhow!(self.device.inner.api.err_string(rc)));
    }
    Ok(())
  }

  pub fn read_cf32(&self, out: &mut [Complex<f32>], timeout_us: i64) -> anyhow::Result<usize> {
    if out.is_empty() {
      return Ok(0);
    }

    let mut flags: c_int = 0;
    let mut time_ns: c_longlong = 0;
    let ptrs = [out.as_mut_ptr() as *mut c_void];
    let timeout_us = timeout_us.clamp(0, c_long::MAX as i64) as c_long;
    let rc = unsafe {
      (self.device.inner.api.read_stream)(
        self.device.inner.device,
        self.stream,
        ptrs.as_ptr(),
        out.len(),
        &mut flags as *mut c_int,
        &mut time_ns as *mut c_longlong,
        timeout_us,
      )
    };
    if rc == SOAPY_SDR_TIMEOUT {
      return Ok(0);
    }
    if rc < 0 {
      return Err(anyhow::anyhow!(self.device.inner.api.err_string(rc)));
    }
    Ok(rc as usize)
  }

  pub fn close(self) -> anyhow::Result<()> {
    let rc =
      unsafe { (self.device.inner.api.close_stream)(self.device.inner.device, self.stream) };
    if rc != 0 {
      return Err(anyhow::anyhow!(self.device.inner.api.err_string(rc)));
    }
    Ok(())
  }
}

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

struct KwargsOwned {
  _keys: Vec<CString>,
  _vals: Vec<CString>,
  _key_ptrs: Vec<*mut c_char>,
  _val_ptrs: Vec<*mut c_char>,
  kwargs: SoapySDRKwargs,
}

impl KwargsOwned {
  fn new(map: &HashMap<String, String>) -> Self {
    let mut keys: Vec<CString> = Vec::new();
    let mut vals: Vec<CString> = Vec::new();

    for (k, v) in map {
      if k.trim().is_empty() || v.trim().is_empty() {
        continue;
      }
      if let (Ok(ck), Ok(cv)) = (CString::new(k.as_str()), CString::new(v.as_str())) {
        keys.push(ck);
        vals.push(cv);
      }
    }

    let mut key_ptrs = Vec::with_capacity(keys.len());
    let mut val_ptrs = Vec::with_capacity(vals.len());
    for i in 0..keys.len() {
      key_ptrs.push(keys[i].as_ptr() as *mut c_char);
      val_ptrs.push(vals[i].as_ptr() as *mut c_char);
    }

    let kwargs = SoapySDRKwargs {
      size: key_ptrs.len(),
      keys: key_ptrs.as_mut_ptr(),
      vals: val_ptrs.as_mut_ptr(),
    };

    Self {
      _keys: keys,
      _vals: vals,
      _key_ptrs: key_ptrs,
      _val_ptrs: val_ptrs,
      kwargs,
    }
  }

  fn as_ptr(&self) -> *const SoapySDRKwargs {
    if self.kwargs.size == 0 {
      return std::ptr::null();
    }
    &self.kwargs as *const SoapySDRKwargs
  }
}
