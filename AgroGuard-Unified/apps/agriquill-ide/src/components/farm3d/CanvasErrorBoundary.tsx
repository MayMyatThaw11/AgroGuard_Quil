import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time crash inside the 3D canvas subtree (WebGL/three.js)
 * so it takes down only this panel, not the whole IDE, and shows a message
 * the operator can act on instead of a blank canvas or the browser's own
 * "An error occurred" overlay. "Reload 3D view" remounts the whole subtree
 * (via the key bump in reset()), which recreates the Canvas and its
 * WebGLRenderer from scratch.
 */
export class CanvasErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('3D view crashed:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0a0e0c] text-center text-slate-300">
          <p className="text-sm font-medium">The 3D view stopped rendering.</p>
          <p className="max-w-sm text-xs text-slate-500">
            Table view and the rest of the IDE are unaffected. This can happen after the graphics
            context is lost (e.g. the system reclaimed GPU memory) and could not recover.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Reload 3D view
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
