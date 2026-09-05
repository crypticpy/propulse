import { useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useDisplayStore } from "@/stores/displayStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Layout } from "./Layout";
import { MobileLayout } from "./MobileLayout";
import { PublicHomeLayout } from "./PublicHomeLayout";

export function AppLayout() {
  const isMobile = useIsMobile();
  const authenticated = useAuthStore(selectIsAuthenticated);
  const { pathname } = useLocation();
  const displaySession = useDisplayStore(s => s.syncActive && s.displayId !== null && s.deviceToken !== null);
  // Registered wall devices must retain the shell that owns display sync,
  // including when their assigned scene is Home.
  if (pathname === "/" && isSupabaseConfigured && !authenticated && !displaySession) return <PublicHomeLayout />;
  return isMobile ? <MobileLayout /> : <Layout />;
}
