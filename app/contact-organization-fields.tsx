"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ContactOption = { id: number; name?: unknown; type?: unknown; status?: unknown; parentContactId?: unknown };
export function ContactOrganizationFields({ form, onChange, contacts }: { form: Record<string, string>; onChange: (next: Record<string, string>) => void; contacts: ContactOption[] }) {
  if (!["customer", "vendor"].includes(form.type)) return null;
  const currentId = Number(form.id);
  const descendants = new Set<number>(Number.isSafeInteger(currentId) && currentId > 0 ? [currentId] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const contact of contacts) if (!descendants.has(contact.id) && descendants.has(Number(contact.parentContactId))) { descendants.add(contact.id); changed = true; }
  }
  const options = contacts.filter(contact => contact.type === form.type && !descendants.has(contact.id) && (contact.status !== "inactive" || String(contact.id) === form.parentContactId));
  return <section className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
    <div className="space-y-2"><Label htmlFor="contact-parent">Sub-account of</Label><Select value={form.parentContactId || "none"} onValueChange={value => onChange({ ...form, parentContactId: value === "none" ? "" : value })}><SelectTrigger id="contact-parent" className="w-full"><SelectValue placeholder="Main account" /></SelectTrigger><SelectContent><SelectItem value="none">None — main account</SelectItem>{options.map(contact => <SelectItem key={contact.id} value={String(contact.id)}>{String(contact.name)}{contact.status === "inactive" ? " (inactive)" : ""}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Select a parent {form.type}. Each sub-account keeps its own balance and ledger link.</p></div>
    <div className="space-y-2"><Label htmlFor="contact-status">Account status</Label><Select value={form.status || "active"} onValueChange={status => onChange({ ...form, status })}><SelectTrigger id="contact-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Inactive accounts retain their history. Reactivate them here when needed.</p></div>
  </section>;
}
