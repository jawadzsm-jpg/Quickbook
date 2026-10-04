"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Payment = { id: number; number: string; date: string; party?: string; currency: string; amount: number; account: string };

export function EmployeeLoanLinker({ companyId, employeeId, onLinked }: { companyId: number; employeeId: number; onLinked: (payment: Payment) => void }) {
  const linkedCallback = useRef(onLinked);
  useEffect(() => { linkedCallback.current = onLinked; }, [onLinked]);
  const [candidates, setCandidates] = useState<Payment[] | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/employee-loan-links?companyId=${companyId}&employeeId=${employeeId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCandidates(result.candidates); setSelected("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load bank loans."); }
    finally { setBusy(false); }
  };
  const link = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/employee-loan-links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, employeeId, transactionId: Number(selected) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      linkedCallback.current(result.payment); setCandidates(current => current?.filter(payment => payment.id !== result.payment.id) ?? null); setSelected("");
      toast.success("Existing bank loan linked. No new payment was posted.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not link bank loan."); }
    finally { setBusy(false); }
  };
  return <div className="mt-3 min-w-0 space-y-3 rounded-lg border p-3">
    <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Please wait…" : "Find existing bank loan"}</Button>
    {candidates !== null && (candidates.length ? <>
      <label>Existing loan payment<select value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}><option value="">Select payment to link</option>{candidates.map(payment => <option key={payment.id} value={payment.id}>{payment.number} · {payment.date} · {payment.party} · {payment.currency} {payment.amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })} · {payment.account}</option>)}</select></label>
      <Button type="button" disabled={busy || !selected} onClick={() => void link()}>Link payment to this employee</Button>
    </> : <p role="status">No eligible unlinked bank payments found. Save the correct loan / advance account above, or use Banking → Write Cheque → Employee loan for a new payment.</p>)}
    <p>Only posted, tax-free bank payments to a loan / advance asset account are listed. Linking saves immediately and does not change the manual loan balance or post another payment.</p>
  </div>;
}
