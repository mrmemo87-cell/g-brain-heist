import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  onExit?: () => void;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component for Clan Territory game views.
 * Catches errors in child components and displays a fallback UI
 * instead of crashing the entire application.
 */
export class ClanTerritoryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ClanTerritory Error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, onExit, fallbackTitle = "Clan Territory Error" } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900/80 border border-red-900/50 rounded-2xl p-8 text-center space-y-6">
            <div className="text-5xl">⚠️</div>
            <div>
              <h2 className="text-2xl font-bold text-red-400 mb-2">{fallbackTitle}</h2>
              <p className="text-slate-400 text-sm">
                Something went wrong while running Clan Territory Wars.
              </p>
            </div>

            {error && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-left">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Error Details</p>
                <p className="text-sm text-red-300 font-mono break-all">{error.message}</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleRetry}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors"
              >
                Try Again
              </button>
              {onExit && (
                <button
                  onClick={onExit}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-colors"
                >
                  Return to Dashboard
                </button>
              )}
            </div>

            <p className="text-xs text-slate-600">
              If this keeps happening, try refreshing the page or contact support.
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ClanTerritoryErrorBoundary;
