import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  isChunkError: boolean;
  autoReloading: boolean;
}

/** Detect stale-deployment chunk-loading failures */
function isChunkLoadError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module')
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    isChunkError: false,
    autoReloading: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
      autoReloading: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // For chunk-load errors: attempt a one-time silent reload
    if (isChunkLoadError(error)) {
      const key = 'eb-chunk-reload';
      const alreadyReloaded = sessionStorage.getItem(key);
      if (!alreadyReloaded) {
        sessionStorage.setItem(key, '1');
        this.setState({ autoReloading: true });
        window.location.reload();
        return;
      }
      // Already tried once this session — fall through to show UI
      sessionStorage.removeItem(key);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, isChunkError: false, autoReloading: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      // While we're auto-reloading for a chunk error, show a clean loading state
      if (this.state.autoReloading) {
        return (
          <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#050813' }}>
            <div className="text-center">
              <div className="text-4xl mb-4 animate-spin inline-block">🔄</div>
              <p className="text-xl" style={{ color: '#a9b7d4' }}>
                Updating to the latest version…
              </p>
            </div>
          </div>
        );
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      // ── Chunk-load error: friendly "new version" message ──
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--ink-900)' }}>
            <div className="card-glass p-8 max-w-lg w-full text-center">
              <div className="text-6xl mb-4">🚀</div>
              <h1 className="font-heading text-2xl mb-3" style={{ color: 'var(--ion-blue)' }}>
                New Version Available
              </h1>
              <p className="text-lg mb-6" style={{ color: 'var(--mist-400)' }}>
                Brains Heist has been updated! Please refresh to load the latest version.
              </p>
              <button
                onClick={() => {
                  // Force-reload bypassing browser cache
                  window.location.href = window.location.href;
                }}
                className="w-full py-3 px-6 rounded-xl font-heading text-lg transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, var(--ion-blue), var(--plasma-pink))',
                  color: 'white'
                }}
              >
                🔄 Refresh Now
              </button>
              <p className="mt-4 text-sm" style={{ color: 'var(--mist-400)' }}>
                Your progress is safely saved — nothing will be lost.
              </p>
            </div>
          </div>
        );
      }

      // ── Generic application error ──
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--ink-900)' }}>
          <div className="card-glass p-8 max-w-2xl w-full text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="font-heading text-3xl mb-4" style={{ color: 'var(--danger-red)' }}>
              Something Went Wrong
            </h1>
            <p className="text-xl mb-6" style={{ color: 'var(--mist-400)' }}>
              An unexpected error occurred. Don't worry, your progress is saved!
            </p>

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full py-3 px-6 rounded-xl font-heading text-lg transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, var(--ion-blue), var(--plasma-pink))',
                  color: 'white'
                }}
              >
                🔄 Reload Page
              </button>
              
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="w-full py-3 px-6 rounded-xl font-heading text-lg transition-all hover:scale-105"
                style={{
                  backgroundColor: 'var(--ink-800)',
                  color: 'var(--mist-400)',
                  border: '1px solid var(--mist-400)'
                }}
              >
                🗑️ Reset All Data & Restart
              </button>
            </div>

            <p className="mt-6 text-sm" style={{ color: 'var(--mist-400)' }}>
              If this keeps happening, please contact your instructor.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
