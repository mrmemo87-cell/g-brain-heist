import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--ink-900)' }}>
          <div className="card-glass p-8 max-w-2xl w-full text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="font-heading text-3xl mb-4" style={{ color: 'var(--danger-red)' }}>
              System Error Detected
            </h1>
            <p className="text-xl mb-6" style={{ color: 'var(--mist-400)' }}>
              Something went wrong in the game engine. Don't worry, your progress is saved!
            </p>
            
            {this.state.error && (
              <div className="bg-black/40 p-4 rounded-lg mb-6 text-left">
                <p className="font-mono text-sm" style={{ color: 'var(--danger-red)' }}>
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full py-3 px-6 rounded-xl font-heading text-lg transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, var(--ion-blue), var(--plasma-pink))',
                  color: 'white'
                }}
              >
                🔄 Restart Game
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
              If this error persists, please contact your instructor or check the{' '}
              <a 
                href="https://github.com/mrmemo87-cell/g-brain-heist/issues" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline"
                style={{ color: 'var(--ion-blue)' }}
              >
                GitHub Issues
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
