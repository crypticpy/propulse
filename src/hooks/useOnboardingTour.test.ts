import { act, renderHook } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingTour } from "./useOnboardingTour";

const steps = [{ id: "intro", title: "Welcome", content: "Tour" }];
const key = "propulse-onboarding-completed";
const user = { id: "returning-operator" } as User;
const session = { user } as Session;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.removeItem(key);
  useAuthStore.setState({ initialized: true, user: null, session: null });
});

describe("PropSphere onboarding tour", () => {
  it.each(["skipTour", "completeTour"] as const)(
    "persists %s as an acknowledged tour",
    (action) => {
      const first = renderHook(() => useOnboardingTour({ steps }));
      act(() => vi.advanceTimersByTime(1100));
      expect(first.result.current.isActive).toBe(true);
      act(() => first.result.current[action]());
      expect(localStorage.getItem(key)).toBe("true");
      first.unmount();

      const returning = renderHook(() => useOnboardingTour({ steps }));
      act(() => vi.advanceTimersByTime(1100));
      expect(returning.result.current.isActive).toBe(false);
    },
  );

  it("waits for auth restoration and stays hidden for signed-in users", () => {
    useAuthStore.setState({ initialized: false });
    const { result } = renderHook(() => useOnboardingTour({ steps }));
    act(() => vi.advanceTimersByTime(1100));
    expect(result.current.isActive).toBe(false);

    act(() => useAuthStore.setState({ initialized: true, user, session }));
    act(() => vi.advanceTimersByTime(1100));
    expect(result.current.isActive).toBe(false);
    act(() => result.current.startTour());
    expect(result.current.isActive).toBe(true);
  });
});
