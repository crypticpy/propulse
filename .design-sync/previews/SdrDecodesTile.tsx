import { SdrDecodesTile } from "propulse";

/**
 * SdrDecodesTile takes an optional `title` override; decodes come from the
 * in-app FT8 decoder store, which nothing feeds on this route in the preview
 * harness. It renders the tile's designed idle copy explaining where
 * decoding actually happens, rather than a blank card.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <SdrDecodesTile />
    </div>
  );
}

export function CustomTitle() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <SdrDecodesTile title="FT8 decodes" />
    </div>
  );
}
