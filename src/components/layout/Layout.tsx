import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-screen bg-cosmic-gradient">
      {/* Stars background */}
      <div className="fixed inset-0 bg-stars opacity-40 pointer-events-none" />

      {/* Orange glow effect */}
      <div className="fixed inset-0 bg-glow-orange pointer-events-none" />

      {/* Main content */}
      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  );
}
