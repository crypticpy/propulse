import { Outlet } from "react-router-dom";
import { Header } from "./Header";

/**
 * Layout - Root layout component with header and background effects
 */
export function Layout() {
  return (
    <div className="min-h-screen bg-cosmic-gradient">
      {/* Stars background */}
      <div className="fixed inset-0 bg-stars opacity-40 pointer-events-none" />

      {/* Orange glow effect */}
      <div className="fixed inset-0 bg-glow-orange pointer-events-none" />

      {/* Main content */}
      <div className="relative z-10">
        <Header />
        <Outlet />
      </div>
    </div>
  );
}
