import { HomeStatus, Surface, Stack, Inline } from "propulse";

export function AllStates() {
  return (
    <Surface>
      <Stack className="gap-2">
        <HomeStatus state="fresh" />
        <HomeStatus state="refreshing" />
        <HomeStatus state="stale" />
        <HomeStatus state="error" />
        <HomeStatus state="loading" />
        <HomeStatus state="unavailable" />
        <HomeStatus state="partial" />
        <HomeStatus state="empty" />
        <HomeStatus state="local" />
      </Stack>
    </Surface>
  );
}

export function WithDetail() {
  return (
    <Surface>
      <Inline className="gap-4">
        <HomeStatus state="stale" detail="18 min ago" />
        <HomeStatus state="partial" detail="2 of 3 sources" />
      </Inline>
    </Surface>
  );
}
