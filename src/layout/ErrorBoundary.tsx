import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm">
          <h2 className="text-base font-semibold text-red-900 mb-2">Something crashed</h2>
          <p className="text-red-900 font-mono text-xs mb-3">{this.state.error.message}</p>
          {this.state.error.stack && (
            <pre className="text-[10px] text-red-800 whitespace-pre-wrap overflow-auto max-h-64 bg-white/50 p-2 rounded border border-red-100">
              {this.state.error.stack}
            </pre>
          )}
          <button
            type="button"
            onClick={() => this.setState({ error: null, info: null })}
            className="mt-3 px-3 py-1.5 text-xs border border-red-300 text-red-900 rounded hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
