import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLATFORM_STORAGE_KEY,
  detectPlatform,
  getInitialPlatform,
  persistPlatform,
  platformLabel,
} from "./platform";

const LEGACY_KEY = "propulse-bridge-setup-platform";

function stubUserAgent(userAgent: string, platform = "") {
  vi.stubGlobal("navigator", { userAgent, platform });
}

beforeEach(() => {
  localStorage.clear();
});

describe("detectPlatform", () => {
  it("detects Windows from the user agent", () => {
    stubUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Win32",
    );
    expect(detectPlatform()).toBe("windows");
  });

  it("detects macOS from the user agent", () => {
    stubUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      "MacIntel",
    );
    expect(detectPlatform()).toBe("macos");
  });

  it("falls back to linux for a Linux user agent", () => {
    stubUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      "Linux x86_64",
    );
    expect(detectPlatform()).toBe("linux");
  });

  it("falls back to linux for an unrecognized user agent", () => {
    stubUserAgent("SomeUnknownBrowser/1.0", "");
    expect(detectPlatform()).toBe("linux");
  });
});

describe("platformLabel", () => {
  it("labels windows as Windows", () => {
    expect(platformLabel("windows")).toBe("Windows");
  });

  it("labels macos as macOS", () => {
    expect(platformLabel("macos")).toBe("macOS");
  });

  it("labels linux as Linux", () => {
    expect(platformLabel("linux")).toBe("Linux");
  });
});

describe("getInitialPlatform / persistPlatform (localStorage migration)", () => {
  it("returns the canonical key's value when it is set, ignoring the legacy key", () => {
    localStorage.setItem(PLATFORM_STORAGE_KEY, "macos");
    localStorage.setItem(LEGACY_KEY, "windows");

    expect(getInitialPlatform()).toBe("macos");
    // Canonical key wins outright — never overwritten from the legacy key.
    expect(localStorage.getItem(PLATFORM_STORAGE_KEY)).toBe("macos");
  });

  it("adopts the legacy key's value when the canonical key is absent, and persists it", () => {
    localStorage.setItem(LEGACY_KEY, "linux");

    expect(getInitialPlatform()).toBe("linux");
    // The value is never dropped: it's written under the canonical key too.
    expect(localStorage.getItem(PLATFORM_STORAGE_KEY)).toBe("linux");
  });

  it("falls back to detectPlatform() when neither key is set", () => {
    stubUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Win32",
    );

    expect(getInitialPlatform()).toBe("windows");
  });

  it("ignores an invalid stored value under the canonical key and falls back", () => {
    localStorage.setItem(PLATFORM_STORAGE_KEY, "not-a-platform");
    stubUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      "MacIntel",
    );

    expect(getInitialPlatform()).toBe("macos");
  });

  it("persistPlatform writes only the canonical key", () => {
    persistPlatform("windows");

    expect(localStorage.getItem(PLATFORM_STORAGE_KEY)).toBe("windows");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});
