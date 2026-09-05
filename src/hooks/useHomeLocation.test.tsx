import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { parseHomeLocation, useHomeLocation } from "./useHomeLocation";
import { HomeLocationProvider } from "@/components/home/HomeLocationProvider";
const state=vi.hoisted(()=>({authenticated:false,userId:"owner"}));
vi.mock("@/lib/supabase",()=>({isSupabaseConfigured:true}));
vi.mock("@/stores/authStore",()=>({selectIsAuthenticated:()=>state.authenticated,useAuthStore:(selector: (auth: {user: {id: string} | null}) => unknown)=>selector({user:state.authenticated?{id:state.userId}:null})}));
vi.mock("@/hooks/useStationCastContext",()=>({useStationCastContext:()=>({location:{grid:"DM79",lat:39.5,lon:-105},chain:null})}));
afterEach(()=>{cleanup();for (const key of Object.keys(localStorage)) if (key.startsWith("propulse-home-location-")) localStorage.removeItem(key);state.authenticated=false;state.userId="owner";});
it("does not display a cached station location to an unauthenticated visitor",()=>{const {result}=renderHook(()=>useHomeLocation(),{wrapper:HomeLocationProvider});expect(result.current.location).toBeNull();act(()=>result.current.choose("IO91"));expect(result.current.location?.grid).toBe("IO91");act(()=>result.current.choose("global"));expect(result.current.location).toBeNull();});
it("follows the station by default and preserves an explicit Home override",()=>{state.authenticated=true;const {result}=renderHook(()=>useHomeLocation(),{wrapper:HomeLocationProvider});expect(result.current.location?.grid).toBe("DM79");act(()=>result.current.choose("IO91"));expect(result.current.location?.grid).toBe("IO91");act(()=>result.current.choose("station"));expect(result.current.location?.grid).toBe("DM79");});
it("rejects a corrupt persisted location instead of inventing coordinates",()=>{localStorage.setItem("propulse-home-location-v2:guest","ZZ99");const {result}=renderHook(()=>useHomeLocation(),{wrapper:HomeLocationProvider});expect(result.current.location).toBeNull();});

it("ignores the legacy shared location in guest sessions", () => {
  localStorage.setItem("propulse-home-location-v1", "IO91WM");
  const { result } = renderHook(() => useHomeLocation(), { wrapper: HomeLocationProvider });
  expect(result.current.location).toBeNull();
});
it("isolates choices on sign-out, sign-in, and account changes", () => {
  state.authenticated = true;
  const { result, rerender } = renderHook(() => useHomeLocation(), { wrapper: HomeLocationProvider });
  act(() => result.current.choose("IO91WM"));
  state.authenticated = false;
  rerender();
  expect(result.current.location).toBeNull();
  act(() => result.current.choose("FN31"));
  state.authenticated = true;
  rerender();
  expect(result.current.location?.grid).toBe("IO91WM");
  state.userId = "another-operator";
  rerender();
  expect(result.current.choice).toBe("station");
  state.authenticated = false;
  rerender();
  expect(result.current.location?.grid).toBe("FN31");
});
it("rejects extended locators at both persistence and selection boundaries", () => {
  expect(parseHomeLocation("IO91wm12")).toBe("station");
  localStorage.setItem("propulse-home-location-v2:guest", "IO91wm12");
  const { result } = renderHook(() => useHomeLocation(), { wrapper: HomeLocationProvider });
  expect(result.current.location).toBeNull();
  act(() => result.current.choose("IO91wm12"));
  expect(result.current.location).toBeNull();
});
