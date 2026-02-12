/**
 * Stable device identifier for multi-device sync.
 *
 * Generates a UUID on first access and persists it in localStorage.
 * Used to tag writes with the originating device, enabling
 * conflict detection when the same QSO is edited on multiple devices.
 *
 * Storage key: 'propulse-device-id'
 */

const DEVICE_ID_KEY = "propulse-device-id";

/** Get or create a stable device UUID */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Get a human-readable device name from the user agent */
export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown Device";
}

/** Get a machine-readable platform identifier from the user agent */
export function getDevicePlatform(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Mac/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux/.test(ua)) return "linux";
  return "unknown";
}
