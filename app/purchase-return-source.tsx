"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PurchaseReturnBill = { id: number; number: string; transactionDate: string; currency: string; lines: Array<{ sourceLineId: number; itemId: number | null; description: string; remaining: number; unitPrice: number; unitCost: number; vatCode: string; vatRate: number }> };

export function PurchaseReturnSource({ companyId, locationId, party, currency, selectedBillId, disabled, onSelect }: { companyId: number; locationId: number; party: string; currency: string; selectedBillId?: string; disabled?: boolean; onSelect: (bill: PurchaseReturnBill | null) => void }) {
  const [bills, setBills] = useState<PurchaseReturnBill[]>([]);
  const [loading, setLoading] = useState(false);
  const ready = companyId > 0 && locationId > 0 && Boolean(party) && Boolean(currency);
  useEffect(() => {
    if (!ready) { setBills([]); return; }
    const controller = new AbortController(); setLoading(true);
    const params = new URLSearchParams({ kind: "purchase-return-bills", companyId: String(companyId), locationId: String(locationId), party, currency });
    fetch(`/api/records?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load supplier bills"); return data; }).then((data) => { if (!controller.signal.aborted) setBills(data.records || []); }).catch(() => { if (!controller.signal.aborted) setBills([]); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, locationId, party, currency, ready]);
  return <div className="space-y-2 sm:col-span-2"><Label>Original supplier bill *</Label><Select disabled={disabled || !ready || loading} value={selectedBillId || undefined} onValueChange={(value) => onSelect(bills.find((bill) => String(bill.id) === value) || null)}><SelectTrigger className="w-full"><SelectValue placeholder={!party ? "Select a vendor first" : loading ? "Loading returnable bills…" : "Select the bill being returned"} /></SelectTrigger><SelectContent>{bills.map((bill) => <SelectItem key={bill.id} value={String(bill.id)}>{bill.number} · {bill.transactionDate} · {bill.lines.length} returnable line{bill.lines.length === 1 ? "" : "s"}</SelectItem>)}{ready && !loading && !bills.length ? <SelectItem value="none" disabled>No returnable bills found</SelectItem> : null}</SelectContent></Select><p className="text-xs text-slate-500">The return is linked to this bill. Only quantities not already returned are available.</p></div>;
}
