/**
 * AuthGate — Top-level authentication boundary.
 *
 * Wraps the entire app and decides what to render based on auth state:
 * - If Supabase is not configured → render children (local dev bypass)
 * - If auth is not initialized yet → render AuthLoadingScreen
 * - If user is not authenticated → render LoginPage
 * - If user is authenticated → render children
 */

import { lazy, Suspense, type ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

const LoginPage = lazy(() =>
  import("@/components/auth/LoginPage").then((m) => ({
    default: m.LoginPage,
  })),
);

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const initialized = useAuthStore((s) => s.initialized);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  // Local dev bypass — no Supabase configured
  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  // Auth state not yet determined
  if (!initialized) {
    return <AuthLoadingScreen />;
  }

  // Not authenticated — show login page
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<AuthLoadingScreen />}>
        <LoginPage />
      </Suspense>
    );
  }

  // Authenticated — render app
  return <>{children}</>;
}
