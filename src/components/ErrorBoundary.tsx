import { Component, ErrorInfo, ReactNode } from "react";
import { Card } from "@/components/ui";
import { recoverFromStaleChunk } from "@/lib/pwa/staleChunkRecovery";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * A chunk this build asked for is no longer on the server, which is what a
 * deploy landing under an open tab looks like. Retrying in place can never
 * work: React.lazy caches the failed loader for the lifetime of the module, so
 * only a real navigation picks up the new build.
 */
const STALE_CHUNK_MESSAGE_PATTERN =
  /dynamically imported module|module script failed|importing a module script|unable to preload css|failed to fetch dynamically imported/i;

export function isStaleChunkError(error: Error | null): boolean {
  if (!error) return false;
  // Webpack-style chunk failures set error.name rather than a matchable
  // message, so classify on the name before falling back to the message.
  if (error.name === "ChunkLoadError") return true;
  return STALE_CHUNK_MESSAGE_PATTERN.test(error.message);
}

/**
 * ErrorBoundary - Catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Classify stale-chunk errors before the database branch below: a chunk
    // URL that happens to contain the word "database" (e.g. a hashed lazy
    // route filename) must not be demoted to the generic database-error
    // message, which would no longer match isStaleChunkError() in render()
    // and would strand the user on a dead-end "Try Again" retry.
    if (isStaleChunkError(error)) return;

    // Check for IndexedDB-specific errors and provide helpful message
    if (
      error.message.includes("IndexedDB") ||
      error.message.includes("database") ||
      error.name === "QuotaExceededError" ||
      error.name === "InvalidStateError" ||
      error.name === "AbortError"
    ) {
      this.setState({
        error: new Error(
          "Database error. Your data may still be safe. Try refreshing the page or clearing site data.",
        ),
      });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    // Go through the same cache-clearing recovery path as the automatic
    // handler instead of a bare reload, which would just re-fetch the same
    // stale service worker / HTTP cache and hit the error again.
    recoverFromStaleChunk();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const staleChunk = isStaleChunkError(this.state.error);

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <Card className="max-w-md p-8 text-center" variant="alert">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="font-orbitron text-xl font-bold text-alert-red mb-2">
              {staleChunk ? "A newer version is available" : "Something went wrong"}
            </h2>
            <p className="text-su-muted mb-4">
              {staleChunk
                ? "This page was updated while the tab was open. Reload to pick up the new version."
                : this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={staleChunk ? this.handleReload : this.handleRetry}
              className="px-6 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30
                         transition-colors font-medium"
            >
              {staleChunk ? "Reload" : "Try Again"}
            </button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
