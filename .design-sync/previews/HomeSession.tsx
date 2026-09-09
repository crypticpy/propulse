import { HomeSession, Surface } from "propulse";

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

export function Desktop() {
  return (
    <Surface>
      <HomeSession now={NOW} isMobile={false} />
    </Surface>
  );
}

export function Mobile() {
  return (
    <Surface>
      <HomeSession now={NOW} isMobile />
    </Surface>
  );
}
