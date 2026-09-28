"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  resetKey: string;
  onRetry: () => void | Promise<void>;
};

type State = { error: Error | null };

export class VendorCenterErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Vendor Center could not render", error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  retry = () => {
    this.setState({ error: null });
    Promise.resolve(this.props.onRetry()).catch((error) => console.error("Vendor Center retry failed", error));
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-slate-900 shadow-sm" role="alert">
      <h2 className="text-lg font-bold">Vendor Center needs to reload</h2>
      <p className="mt-2 text-sm text-slate-600">Your accounting data is safe. Reload the vendor data to open this area again.</p>
      <button type="button" onClick={this.retry} className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Reload Vendor Center</button>
    </section>;
  }
}
