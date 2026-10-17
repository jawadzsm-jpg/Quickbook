"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Pending = { count: number; gainLoss: number; payments: Array<{ id: number; number: string; date: string; party: string; currency: string; exchangeRate: number; gainLoss: number }> };

// Realised Gains & Losses: payments saved before exchange differences were posted still hold them in Accounts
// Receivable / Payable. Accountants see how many; administrators post them to Exchange Gain or Loss once.
export function FxBackfillBanner({ companyId, currency, onPosted }: { companyId: number; currency: string; onPosted: () => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/fx-gain-loss?companyId=${companyId}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (active) setPending(data); }).catch(() => undefined);
    return () => { active = false; };
  }, [companyId]);
  if (!pending?.count) return null;
  const money = (value: number) => `${currency} ${value.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  async function post() {
    if (!window.confirm(`Post the exchange differences of ${pending!.count} past payment(s) to Exchange Gain or Loss? Their receivable/payable lines move to the booked value.`)) return;
    setPosting(true);
    try {
      const response = await fetch("/api/fx-gain-loss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not post the exchange differences");
      toast.success(`${data.posted} payment(s) posted to Exchange Gain or Loss`);
      setPending(null);
      onPosted();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not post the exchange differences"); }
    finally { setPosting(false); }
  }
  return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 print:hidden dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p><span className="font-semibold">{pending.count} past payment(s) have exchange differences not yet posted</span> (net {pending.gainLoss >= 0 ? "gain" : "loss"} {money(Math.abs(pending.gainLoss))}). They are still in Accounts Receivable / Payable, so this report leaves them out until they are posted.</p>
      <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>{open ? "Hide list" : "Show list"}</Button><Button type="button" size="sm" disabled={posting} onClick={() => void post()}>{posting ? "Posting…" : "Post exchange differences"}</Button></div>
    </div>
    {open && <ul className="mt-3 max-h-48 divide-y overflow-auto rounded-lg border border-amber-200 bg-white/60 text-xs dark:border-amber-900 dark:bg-black/20">{pending.payments.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 px-3 py-1.5"><span>{row.date} · {row.number} · {row.party} · {row.currency} @ {row.exchangeRate}</span><span className="font-semibold tabular-nums">{row.gainLoss >= 0 ? "+" : "−"}{money(Math.abs(row.gainLoss))}</span></li>)}</ul>}
  </div>;
}
