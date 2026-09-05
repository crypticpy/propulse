import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { HomeSession } from "./HomeSession";

const state = vi.hoisted(() => ({ activeSession: null as { id: string } | null }));
vi.mock("@/hooks/useLogbook", () => ({ useLogbook: () => ({ entries: [], refresh: vi.fn(), loading: false, error: null }) }));
vi.mock("@/lib/db/logStore", () => ({ subscribeLogEntries: () => () => {} }));
vi.mock("@/hooks/useContestContext", () => ({ useContestContext: () => ({ activeContests: [], upcomingContests: [] }) }));
vi.mock("@/stores/contestStore", () => ({ useContestStore: (selector: (value: typeof state) => unknown) => selector(state) }));

afterEach(() => { cleanup(); state.activeSession = null; });

it.each([true, false])("opens the contest explorer without an active session (mobile=%s)", isMobile => {
  render(<MemoryRouter><HomeSession now={Date.now()} isMobile={isMobile} /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Explore contests →" }).getAttribute("href")).toBe("/contests");
});

it("resumes an existing session in the contest logger", () => {
  state.activeSession = { id: "active-contest" };
  render(<MemoryRouter><HomeSession now={Date.now()} isMobile /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Resume contest session →" }).getAttribute("href")).toBe("/contest");
});
