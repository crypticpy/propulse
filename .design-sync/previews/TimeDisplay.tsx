import { Stack, Surface, TimeDisplay } from "propulse";

const spotTime = new Date("2026-09-08T18:42:07Z");

export function Formats() {
  return (
    <Surface>
      <Stack>
        <div className="flex items-center gap-2 text-sm text-su-text">
          <span className="text-su-muted">UTC:</span>
          <TimeDisplay time={spotTime} format="utc" />
        </div>
        <div className="flex items-center gap-2 text-sm text-su-text">
          <span className="text-su-muted">Local:</span>
          <TimeDisplay time={spotTime} format="local" />
        </div>
        <div className="flex items-center gap-2 text-sm text-su-text">
          <span className="text-su-muted">With seconds:</span>
          <TimeDisplay time={spotTime} format="utc" showSeconds />
        </div>
      </Stack>
    </Surface>
  );
}
