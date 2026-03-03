/**
 * AuthLoadingScreen — Full-screen loading state shown while auth initializes.
 *
 * Displays the Propulse logo with a loading spinner on a dark background.
 * Rendered by AuthGate before the auth state has been determined.
 */

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function AuthLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-void-black">
      {/* Logo */}
      <h1
        className="text-4xl font-bold tracking-widest bg-gradient-to-r from-plasma-orange to-amber-400 bg-clip-text text-transparent mb-8"
        style={{ fontFamily: "Orbitron, sans-serif" }}
      >
        PROPULSE
      </h1>

      {/* Spinner */}
      <LoadingSpinner size="lg" text="Initializing..." />
    </div>
  );
}
