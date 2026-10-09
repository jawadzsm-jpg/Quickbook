"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  resetKey: string;
  onRetry: () => void | Promise<void>;
  /** Opens the new-vendor form, so a vendor can still be added while the Vendor Center is unavailable. */
  onCreateVendor?: () => void;
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
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={this.retry} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Reload Vendor Center</button>
        {this.props.onCreateVendor && <button type="button" onClick={this.props.onCreateVendor} className="rounded-md border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">+ New Vendor</button>}
      </div>
    </section>;
  }
}
