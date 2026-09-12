"use client";

import { useEffect, useState } from "react";

type Summary = { income: number; expenses: number; netIncome: number };

export function LiveProfitLossSummary({ companyId, locationId }: { companyId: number; locationId: number }) {
  const [result, setResult] = useState<{ currency: string; summary: Summary } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/reports?type=profit-loss&companyId=${companyId}&locationId=${locationId}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok || !data.report?.summary) throw new Error("Could not load the P&L summary. Reopen Reports to retry.");
        if (!controller.signal.aborted) setResult(data.report);
      } catch {
        if (!controller.signal.aborted) setError("Could not load the P&L summary. Reopen Reports to retry.");
      }
    }
    void load();
    return () => controller.abort();
  }, [companyId, locationId]);

  const money = (value: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: result!.currency }).format(value);
  return <article className="rounded-xl bg-[#102033] p-5 text-white">
    <p className="text-xs font-semibold tracking-widest text-emerald-300">LIVE SUMMARY</p>
    <h3 className="mt-3 text-lg font-bold">Profit &amp; Loss</h3>
    <div className="mt-5 space-y-3 text-sm" aria-live="polite">
      {error ? <p role="alert">{error}</p> : !result ? <p>Loading ledger balances…</p> : <>
        <div className="flex justify-between text-slate-300"><span>Income</span><span>{money(result.summary.income)}</span></div>
        <div className="flex justify-between text-slate-300"><span>Expenses</span><span>{money(result.summary.expenses)}</span></div>
        <div className="flex justify-between border-t border-white/15 pt-3 font-bold"><span>Net income</span><span className="text-emerald-300">{money(result.summary.netIncome)}</span></div>
      </>}
    </div>
  </article>;
}
