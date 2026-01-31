import { Component, ErrorInfo, ReactNode } from "react";
import { Card } from "@/components/ui";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
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
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <Card className="max-w-md p-8 text-center" variant="alert">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="font-orbitron text-xl font-bold text-alert-red mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-400 mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-6 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30
                         transition-colors font-medium"
            >
              Try Again
            </button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
