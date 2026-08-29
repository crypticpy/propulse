/**
 * AuthGate — Top-level authentication boundary.
 *
 * Wraps the entire app and decides what to render based on auth state:
 * - If Supabase is not configured → render children (local dev bypass)
 * - If auth is not initialized yet → render AuthLoadingScreen
 * - If password recovery is active → render LoginPage's password form
 * - If user is not authenticated → render LoginPage
 * - If user is authenticated → render children
 */

import { lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useDisplayStore } from "@/stores/displayStore";
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
  const isRecoveryMode = useAuthStore((s) => s.isRecoveryMode);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const displaySyncActive = useDisplayStore((s) => s.syncActive);
  const { pathname } = useLocation();

  // Local dev bypass — no Supabase configured
  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  // Wall-device bypass — a Display Wall device is deliberately anonymous:
  // it registers on /display/* and, once synced (syncActive), follows kiosk
  // scenes onto public routes (/map, /solar, …). It authenticates to the
  // displays API with its device token, never with a user session; RLS
  // still protects all user data it could reach.
  if (pathname.startsWith("/display/") || displaySyncActive) {
    return <>{children}</>;
  }

  // Auth state not yet determined
  if (!initialized) {
    return <AuthLoadingScreen />;
  }

  // Recovery creates a temporary authenticated session, but the password form
  // must remain visible until updatePassword completes.
  if (isRecoveryMode || !isAuthenticated) {
    return (
      <Suspense fallback={<AuthLoadingScreen />}>
        <LoginPage />
      </Suspense>
    );
  }

  // Authenticated — render app
  return <>{children}</>;
}
