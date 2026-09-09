import { DataFreshnessIndicator, Stack, Surface } from "propulse";

const fiveMinAgo = Date.now() - 5 * 60 * 1000;

export function States() {
  return (
    <Surface>
      <Stack>
        <DataFreshnessIndicator dataUpdatedAt={fiveMinAgo} onRefresh={() => {}} />
        <DataFreshnessIndicator
          dataUpdatedAt={fiveMinAgo}
          onRefresh={() => {}}
          isRefetching
        />
        <DataFreshnessIndicator dataUpdatedAt={undefined} />
      </Stack>
    </Surface>
  );
}
