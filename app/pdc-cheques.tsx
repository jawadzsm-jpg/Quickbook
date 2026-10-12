"use client";

import { useMemo, useState } from "react";
import { BellOff, BellRing, CalendarClock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { daysUntil, isoToUaeLocal, isPostDated } from "@/lib/cheque-reminders";

type ChequeRow = Record<string, unknown> & { id: number };

const isVoid = (status: unknown) => ["void", "voided", "cancelled", "canceled"].includes(String(status ?? "").toLowerCase());
const money = (amount: unknown, currency: unknown) => `${String(currency || "AED")} ${Number(amount || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uaeDateTime = (iso: unknown) => {
  const time = iso ? Date.parse(String(iso)) : NaN;
  return Number.isNaN(time) ? "" : new Date(time).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};
const chequeDay = (value: unknown) => {
  const date = new Date(`${String(value)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Banking → Post-dated cheques: cheques dated after today with their reminder. Accountants and administrators can
 * change the reminder time, turn it off, or let it follow the cheque date again (7 days before, 09:00 UAE).
 */
export function PdcCheques({ records, companyId, canManage, onChanged, onOpen }: { records: ChequeRow[]; companyId: number; canManage: boolean; onChanged: () => void; onOpen: (id: number) => void }) {
  const cheques = useMemo(() => records.filter((record) => record.type === "cheque" && !isVoid(record.status) && isPostDated(String(record.transactionDate ?? ""))).sort((a, b) => String(a.transactionDate).localeCompare(String(b.transactionDate)) || a.id - b.id), [records]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  if (!cheques.length) return null;

  const update = async (cheque: ChequeRow, change: Record<string, unknown>, done: string) => {
    setBusy(cheque.id);
    try {
      const response = await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "transactions", id: cheque.id, companyId, editMode: "cheque-reminder", ...change }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change the reminder.");
      toast.success(done); setEditing(null); onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not change the reminder."); }
    finally { setBusy(null); }
  };
  const total = cheques.reduce((sum, cheque) => sum + Number(cheque.total || 0), 0);
  const currencies = new Set(cheques.map((cheque) => String(cheque.currency || "AED")));

  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-labelledby="pdc-title">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><CalendarClock className="size-5" /></div><div><h2 id="pdc-title" className="font-bold text-foreground">Post-dated cheques</h2><p className="text-sm text-muted-foreground">Cheques dated after today. Admins and accountants are reminded before each date.</p></div></div>
      <p className="text-sm font-semibold tabular-nums">{cheques.length} {cheques.length === 1 ? "cheque" : "cheques"}{currencies.size === 1 ? ` · ${money(total, [...currencies][0])}` : ""}</p>
    </div>
    <ul className="divide-y">
      {cheques.map((cheque) => {
        const reminder = cheque.reminderAt ? String(cheque.reminderAt) : "";
        const custom = cheque.reminderCustom === true || cheque.reminderCustom === "true";
        return <li key={cheque.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <div className="w-32 shrink-0"><p className="font-semibold tabular-nums">{chequeDay(cheque.transactionDate)}</p><p className="text-xs text-muted-foreground">due {daysUntil(String(cheque.transactionDate))}</p></div>
          <button type="button" className="min-w-0 flex-1 basis-48 text-left" onClick={() => onOpen(cheque.id)}><p className="truncate font-medium underline-offset-2 hover:underline">{String(cheque.party || "—")}</p><p className="font-mono text-xs text-muted-foreground">{String(cheque.number)}</p></button>
          <p className="w-36 shrink-0 text-right font-semibold tabular-nums">{money(cheque.total, cheque.currency)}</p>
          <div className="min-w-0 flex-1 basis-56">
            {editing === cheque.id ? <div className="flex flex-wrap items-center gap-2">
              <Input type="datetime-local" aria-label={`Reminder for ${String(cheque.number)}`} className="h-8 w-52" value={draft} onChange={(event) => setDraft(event.target.value)} />
              <Button type="button" size="sm" className="h-8" disabled={busy === cheque.id || !draft} onClick={() => void update(cheque, { reminderLocal: draft }, "Reminder saved")}>Save</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancel</Button>
            </div> : <div className="flex flex-wrap items-center gap-2 text-sm">
              {reminder ? <span className="inline-flex items-center gap-1.5"><BellRing className={`size-4 ${cheque.remindedAt ? "text-emerald-600" : "text-amber-600"}`} />{cheque.remindedAt ? "Reminded" : "Remind"} {uaeDateTime(cheque.remindedAt || reminder)}{custom ? "" : <span className="text-xs text-muted-foreground">(default)</span>}</span> : <span className="inline-flex items-center gap-1.5 text-muted-foreground"><BellOff className="size-4" />No reminder</span>}
              {canManage ? <span className="flex gap-1">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy === cheque.id} onClick={() => { setDraft(isoToUaeLocal(reminder) || ""); setEditing(cheque.id); }}>Change</Button>
                {reminder ? <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy === cheque.id} onClick={() => void update(cheque, { reminderOff: true }, "Reminder turned off")}>Turn off</Button> : null}
                {custom ? <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={busy === cheque.id} onClick={() => void update(cheque, { reminderDefault: true }, "Reminder follows the cheque date")}><RotateCcw className="size-3" />Default</Button> : null}
              </span> : null}
            </div>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
