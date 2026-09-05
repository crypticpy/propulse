import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { HamClockRecentContacts } from "./HamClockRecentContacts";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { readHamClockContacts } from "@/lib/hamclock/recentContacts";

vi.mock("@/lib/hamclock/recentContacts", () => ({
  readHamClockContacts: vi.fn(async () => []),
}));
afterEach(() => vi.useRealTimers());
it("pauses polling when collapsed and reads fresh contacts when reopened", async () => {
  vi.useFakeTimers();
  useHamClockDisplayStore.getState().resetDisplay();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HamClockRecentContacts />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(readHamClockContacts).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /Recent Contacts/ }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(readHamClockContacts).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /Recent Contacts/ }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(readHamClockContacts).toHaveBeenCalledTimes(2);
  unmount();
  client.clear();
});
