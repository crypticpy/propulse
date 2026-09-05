import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, getSupabase: vi.fn() }));
vi.mock("./Layout", () => ({ Layout: () => <div>Display-capable desktop shell</div> }));
vi.mock("./MobileLayout", () => ({ MobileLayout: () => <div>Display-capable phone shell</div> }));
vi.mock("./PublicHomeLayout", () => ({ PublicHomeLayout: () => <div>Public Home shell</div> }));
const state = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => state.mobile }));
import { AppLayout } from "./AppLayout";
import { useDisplayStore } from "@/stores/displayStore";
import { useAuthStore } from "@/stores/authStore";
function mount(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppLayout /></MemoryRouter>); }
afterEach(() => { cleanup(); state.mobile = false; useDisplayStore.getState().clearIdentity(); useAuthStore.setState({ user: null, session: null }); });
it("uses the public shell for ordinary guest Home on both layouts", () => {
  for (const mobile of [false, true]) { state.mobile = mobile; const view = mount("/"); expect(screen.getByText("Public Home shell")).toBeTruthy(); view.unmount(); }
});
it("preserves display registration and scene sync, including a Home scene", () => {
  const registration = mount("/display/pair"); expect(screen.getByText("Display-capable desktop shell")).toBeTruthy(); registration.unmount();
  useDisplayStore.setState({ syncActive: true, displayId: "unit-display", deviceToken: "unit-token" });
  for (const path of ["/", "/map", "/solar"]) { const view = mount(path); expect(screen.getByText("Display-capable desktop shell")).toBeTruthy(); view.unmount(); }
  state.mobile = true; mount("/"); expect(screen.getByText("Display-capable phone shell")).toBeTruthy();
});
it("does not treat the sync flag alone as a registered device", () => {
  useDisplayStore.setState({syncActive:true,displayId:null,deviceToken:null}); mount("/"); expect(screen.getByText("Public Home shell")).toBeTruthy();
});
