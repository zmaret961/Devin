import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last line of defense, modeled on The-Classroom's AppErrorBoundary. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidMount() {
    window.addEventListener('popstate', this.clearError);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this.clearError);
  }

  clearError = () => {
    if (this.state.error) this.setState({ error: null });
  };

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Home Ops hit an error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong on this screen</h1>
        <p className="text-ink-2">
          Your saved information is safe. Reload to try again. If you need emergency steps right now, open the home screen
          and tap Emergency.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-12 rounded-full bg-pine px-5 font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className="min-h-12 rounded-full border border-line-strong px-5 font-semibold"
            onClick={() => window.location.assign('/')}
          >
            Go to Home
          </button>
        </div>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-xl bg-card p-3">{this.state.error.message}</pre>
        </details>
      </main>
    );
  }
}
