import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";

/** Public Home intentionally mounts no personal shell, hardware, or log services. */
export function PublicHomeLayout() {
  return <div className="min-h-screen bg-cosmic-gradient text-slate-300" data-public-home-shell>
    <div className="fixed inset-0 bg-stars opacity-40 pointer-events-none" />
    <div className="fixed inset-0 bg-glow-orange pointer-events-none" />
    <div className="relative z-10"><Header publicView />
    <div><Suspense fallback={<p className="p-6">Loading dashboard…</p>}><Outlet /></Suspense></div></div>
  </div>;
}
