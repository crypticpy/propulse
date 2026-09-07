import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFeedStore } from "@/stores/feedStore";
import { NewsFeedsConfig } from "./NewsFeedsConfig";

vi.mock("@/hooks/useRssFeed", () => ({ useRssFeeds: (sources: { id: string }[]) => sources.map(source => ({ source, fetchedAt: null, status: "ok", refresh: vi.fn() })) }));
const original = useFeedStore.getState();
afterEach(() => { useFeedStore.setState(original); vi.unstubAllGlobals(); });

it("requires verification of the current URL and saves the parsed title", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", title: "Club News", itemCount: 2 })));
  vi.stubGlobal("fetch", fetch);
  render(<NewsFeedsConfig />);
  fireEvent.click(screen.getByRole("tab", { name: "ADD FEED" }));
  const input = screen.getByLabelText("Feed URL");
  fireEvent.change(input, { target: { value: "https://example.com/rss" } });
  expect(screen.getByRole("button", { name: "ADD" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "VERIFY" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "ADD" }).hasAttribute("disabled")).toBe(false));
  expect(fetch).toHaveBeenCalledWith("/api/feeds/rss?verify=1&url=https%3A%2F%2Fexample.com%2Frss");
  fireEvent.click(screen.getByRole("button", { name: "ADD" }));
  expect(useFeedStore.getState().feeds.at(-1)).toMatchObject({ label: "Club News", url: "https://example.com/rss" });
});

it("ignores a verification response after the URL changes", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  render(<NewsFeedsConfig />);
  fireEvent.click(screen.getByRole("tab", { name: "ADD FEED" }));
  fireEvent.change(screen.getByLabelText("Feed URL"), { target: { value: "https://example.com/old" } });
  fireEvent.click(screen.getByRole("button", { name: "VERIFY" }));
  fireEvent.change(screen.getByLabelText("Feed URL"), { target: { value: "https://example.com/new" } });
  await act(async () => resolve(new Response(JSON.stringify({ status: "ok", title: "Old", itemCount: 1 }))));
  expect(screen.getByRole("button", { name: "ADD" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByText(/Old.*VERIFIED/)).toBeNull();
});

it("paginates long feed collections and exposes unfetched state", () => {
  useFeedStore.setState({ feeds: Array.from({ length: 9 }, (_, i) => ({ ...original.feeds[0], id: String(i), label: `Feed ${i}` })) });
  render(<NewsFeedsConfig />);
  fireEvent.click(screen.getByRole("tab", { name: "NEWS 5" }));
  expect(screen.getByRole("switch", { name: "Feed 8" })).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Feed 0" })).toBeNull();
  expect(screen.getByText(/NOT YET FETCHED/)).toBeTruthy();
});
