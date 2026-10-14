"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, PenLine, Pencil, Plus, Save, Send, Tag, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmailSignatureEditor } from "./email-signature-editor";
import { cleanEmailListCategory, defaultListEmail, defaultStockEmail, EMAIL_LIST_CATEGORY_MAX, emailListCategories, emailListLabel, emailListsFor, INVENTORY_EMAIL_MAX_RECIPIENTS, parseEmailListCsv, type EmailListContact, type EmailListOwner, type EmailListType } from "@/lib/email-lists";
import { EMAIL_TEMPLATE_NAME_MAX, fillEmailTemplate, STOCK_EMAIL_TYPE, withoutSignOff } from "@/lib/email-templates";
import { isValidEmail } from "@/lib/email-validation";

type Template = { id: number; name: string; documentType: string; subject: string; body: string; shared: boolean; editable: boolean };
type Address = { name: string; company: string; category: string; email: string };
const noAddress: Address = { name: "", company: "", category: "", email: "" };
// The category filter: every address, those without a category, or one category.
const ALL_CATEGORIES = "__all__", NO_CATEGORY = "__none__";

async function call(url: string, method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>) {
  const response = await fetch(url, method === "GET" ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}
// The standard wording (the stock email, or a blank message when no item is selected) leaves out "Best regards, name,
// company" when the sender's signature already gives it.
const standardEmail = (signatureOn: boolean, withItems: boolean) => {
  const source = withItems ? defaultStockEmail : defaultListEmail;
  return signatureOn ? { ...source, body: withoutSignOff(source.body) } : source;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.";

/**
 * Email the selected Inventory Overview stock to chosen addresses of the company's Sales or Purchase list.
 * Each user keeps their own lists, filled by hand or from a CSV file, with an optional category per address (a
 * country, region…) to filter and select by; administrators open any user's list (or everyone's) and add to it.
 * Recipients are hidden from each other.
 */
export function InventoryEmailDialog({ open, onOpenChange, companyId, companyName, role, sender, itemsText, itemCount, itemLines = [] }: {
  open: boolean; onOpenChange: (open: boolean) => void; companyId: number; companyName: string; role: string;
  sender: { name: string; email: string }; itemsText: string; itemCount: number;
  /** Each item line's parts, so the sent email colours them (name, condition, details) without changing the text. */
  itemLines?: Array<{ identity: string; condition: string; details: string }>;
}) {
  const lists = useMemo(() => emailListsFor(role), [role]);
  const [type, setType] = useState<EmailListType>(lists[0] ?? "sales");
  const [contacts, setContacts] = useState<EmailListContact[] | null>(null);
  const [seesAll, setSeesAll] = useState(false);
  // Administrators: whose list is open ("me", "all" or a user id) and the users they can choose.
  const [view, setView] = useState("me");
  const [owners, setOwners] = useState<(EmailListOwner & { canAdd: boolean })[]>([]);
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [newAddress, setNewAddress] = useState<Address>(noAddress);
  const [editing, setEditing] = useState<Address & { id: number } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("default");
  const templateIdRef = useRef(templateId);
  useEffect(() => { templateIdRef.current = templateId; }, [templateId]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingSignature, setEditingSignature] = useState(false);
  const [signatureOn, setSignatureOn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A template's text with {company}, {sender}, {senderEmail} and {items} filled; the stock is added when {items} is missing.
  // With no item selected, {items} is left out and the message is sent as written.
  const fill = useCallback((source: { subject: string; body: string }) => {
    const values = { company: companyName, sender: sender.name, senderEmail: sender.email };
    const text = fillEmailTemplate(source.body, values);
    setSubject(fillEmailTemplate(source.subject, values).replace(/\{items\}/g, ""));
    if (!itemsText) setBody(text.replace(/\n*\{items\}\n*/g, "\n\n").trim());
    else setBody(text.includes("{items}") ? text.replace(/\{items\}/g, itemsText) : `${text}\n\n${itemsText}`);
  }, [companyName, itemsText, sender.email, sender.name]);

  // Every list response carries the contacts (and, for administrators, the users whose list they can open).
  const showList = useCallback((data: { contacts?: EmailListContact[]; seesAll?: boolean; owners?: (EmailListOwner & { canAdd: boolean })[] }) => {
    setContacts(data.contacts ?? []); setSeesAll(data.seesAll === true); setOwners(data.owners ?? []);
  }, []);
  const loadList = useCallback(async (list: EmailListType, listView: string) => {
    setContacts(null);
    try { showList(await call(`/api/email-lists?companyId=${companyId}&type=${list}&view=${encodeURIComponent(listView)}`, "GET")); }
    catch (error) { setContacts([]); toast.error(errorText(error)); }
  }, [companyId, showList]);

  // Opening starts from the default wording with the current selection; the list and templates load as they arrive.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!open) return; setEditingSignature(false); setTemplateId("default"); fill(standardEmail(false, itemCount > 0)); setSelected(new Set()); setSearch(""); }, [open, fill, itemCount]);
  // With the signature on, the standard wording is filled again without its closing once the setting arrives.
  useEffect(() => {
    if (!open) return;
    let active = true;
    call(`/api/email-signatures?companyId=${companyId}`, "GET").then((data) => {
      const on = data.saved === true && data.signature?.enabled === true;
      if (!active) return;
      setSignatureOn(on);
      if (on && templateIdRef.current === "default") fill(standardEmail(true, itemCount > 0));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [open, companyId, fill, itemCount]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open && lists.includes(type)) void loadList(type, view); }, [open, type, view, lists, loadList]);
  useEffect(() => {
    if (!open) return;
    call(`/api/email-templates?companyId=${companyId}`, "GET").then((data) => setTemplates((data.templates ?? []).filter((template: Template) => template.documentType === STOCK_EMAIL_TYPE))).catch(() => setTemplates([]));
  }, [open, companyId]);

  const categories = useMemo(() => emailListCategories(contacts ?? []), [contacts]);
  const categoryCount = useCallback((name: string) => (contacts ?? []).filter((contact) => name === NO_CATEGORY ? !contact.category : contact.category.toLowerCase() === name.toLowerCase()).length, [contacts]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts ?? []).filter((contact) => (category === ALL_CATEGORIES || (category === NO_CATEGORY ? !contact.category : contact.category.toLowerCase() === category.toLowerCase()))
      && (!term || contact.email.includes(term) || contact.name.toLowerCase().includes(term) || (contact.company ?? "").toLowerCase().includes(term) || contact.category.toLowerCase().includes(term)));
  }, [contacts, search, category]);
  // Where an added address goes: the user's own list, or the user an administrator has open.
  const viewedOwner = seesAll && view !== "me" && view !== "all" ? owners.find((owner) => String(owner.id) === view) : undefined;
  const allShownSelected = shown.length > 0 && shown.every((contact) => selected.has(contact.id));
  const toggleShown = () => setSelected((current) => { const next = new Set(current); for (const contact of shown) { if (allShownSelected) next.delete(contact.id); else next.add(contact.id); } return next; });
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chooseList = (list: EmailListType) => { if (list === type) return; setType(list); setSelected(new Set()); setSearch(""); setCategory(ALL_CATEGORIES); setEditing(null); };
  // A new category starts a new selection, so addresses hidden by the filter are never sent to by mistake.
  const chooseCategory = (next: string) => { if (next === category) return; setCategory(next); setSelected(new Set()); };
  const chooseView = (next: string) => { if (next === view) return; setView(next); setSelected(new Set()); setCategory(ALL_CATEGORIES); setEditing(null); };

  const run = async (work: () => Promise<void>) => { setBusy(true); try { await work(); } catch (error) { toast.error(errorText(error)); } finally { setBusy(false); } };
  const addContacts = (rows: Address[], skipped = 0) => run(async () => {
    const data = await call("/api/email-lists", "POST", { companyId, type, contacts: rows, view, ...(viewedOwner ? { ownerUserId: viewedOwner.id } : {}) });
    showList(data);
    const extra = [data.alreadyListed ? `${data.alreadyListed} already listed` : "", skipped + Number(data.invalid ?? 0) ? `${skipped + Number(data.invalid ?? 0)} rows without a valid address skipped` : ""].filter(Boolean).join(", ");
    toast.success(`${data.added} added to the ${emailListLabel(type)}${viewedOwner ? ` of ${viewedOwner.name}` : ""}${extra ? ` (${extra})` : ""}`);
  });
  const addOne = (event: FormEvent) => {
    event.preventDefault();
    const email = newAddress.email.trim().toLowerCase();
    if (!isValidEmail(email)) return toast.error("Enter a valid email address.");
    // The category is kept for the next address, so a run of addresses from one country is quick to type.
    void addContacts([{ name: newAddress.name.trim(), company: newAddress.company.trim(), category: cleanEmailListCategory(newAddress.category), email }]).then(() => setNewAddress({ ...noAddress, category: newAddress.category }));
  };
  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("The CSV file is larger than 2 MB.");
    const { contacts: rows, skipped } = parseEmailListCsv(await file.text());
    if (!rows.length) return toast.error("No email addresses found. Use a column named Email, or put one address per row.");
    // Rows without a category take the one being filtered (e.g. a file of UAE customers imported while UAE is shown).
    const fallback = category === ALL_CATEGORIES || category === NO_CATEGORY ? "" : category;
    await addContacts(rows.map((row) => ({ ...row, category: row.category || fallback })), skipped);
  };
  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const email = editing.email.trim().toLowerCase();
    if (!isValidEmail(email)) return toast.error("Enter a valid email address.");
    void run(async () => {
      const data = await call("/api/email-lists", "PATCH", { companyId, type, view, action: "update", id: editing.id, name: editing.name.trim(), company: editing.company.trim(), category: cleanEmailListCategory(editing.category), email });
      showList(data); setEditing(null);
      toast.success("Address updated");
    });
  };
  const removeSelected = () => {
    const ids = [...selected];
    if (!ids.length || !window.confirm(`Remove ${ids.length} ${ids.length === 1 ? "address" : "addresses"} from the ${emailListLabel(type)}? ${seesAll ? " This removes them for the users who added them." : ""}`)) return;
    void run(async () => { const data = await call("/api/email-lists", "PATCH", { companyId, type, view, action: "remove", ids }); showList(data); setSelected(new Set()); toast.success(`${data.removed} removed`); });
  };
  const categorizeSelected = () => {
    const ids = [...selected];
    if (!ids.length) return;
    const answer = window.prompt(`Category for ${ids.length} ${ids.length === 1 ? "address" : "addresses"} (e.g. a country). Leave empty to clear it.`, category === ALL_CATEGORIES || category === NO_CATEGORY ? "" : category);
    if (answer === null) return;
    const name = cleanEmailListCategory(answer);
    void run(async () => { const data = await call("/api/email-lists", "PATCH", { companyId, type, view, action: "categorize", ids, category: name }); showList(data); toast.success(name ? `${data.changed} put in ${name}` : `Category cleared for ${data.changed}`); });
  };
  const chooseTemplate = (id: string) => { setTemplateId(id); const template = templates.find((entry) => String(entry.id) === id); fill(template ?? standardEmail(signatureOn, itemCount > 0)); };
  const saveTemplate = () => {
    const name = window.prompt("Template name", "")?.trim().slice(0, EMAIL_TEMPLATE_NAME_MAX);
    if (!name) return;
    // Saved with {items} in place of the stock, so the template fits any selection.
    const templateBody = itemsText && body.includes(itemsText) ? body.replace(itemsText, "{items}") : body;
    void run(async () => {
      const data = await call("/api/email-templates", "POST", { companyId, name, documentType: STOCK_EMAIL_TYPE, subject, body: templateBody, shared: false });
      setTemplates((current) => [...current, { ...data.template, editable: true }]);
      setTemplateId(String(data.template.id));
      toast.success("Template saved");
    });
  };
  const send = () => {
    const ids = [...selected];
    if (!ids.length) return toast.error("Select at least one email address.");
    if (ids.length > INVENTORY_EMAIL_MAX_RECIPIENTS) return toast.error(`Select at most ${INVENTORY_EMAIL_MAX_RECIPIENTS} addresses for one email.`);
    void run(async () => {
      const data = await call("/api/inventory-emails", "POST", { companyId, type, contactIds: ids, subject, body, itemLines });
      toast.success(`Email sent to ${data.recipients} ${data.recipients === 1 ? "address" : "addresses"}`);
      onOpenChange(false);
    });
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="size-5" />{itemCount ? "Email stock list" : "Email"}</DialogTitle><DialogDescription>{itemCount ? `${itemCount} ${itemCount === 1 ? "item" : "items"} from Inventory Overview.` : "No item selected: write your own message, e.g. news or items from your website."} Each address receives its own copy; recipients do not see each other, and replies come to {sender.email || "you"}.</DialogDescription></DialogHeader>
      {editingSignature ? <><EmailSignatureEditor companyId={companyId} onSaved={setSignatureOn} /><div><Button type="button" variant="outline" onClick={() => setEditingSignature(false)}>Back to the email</Button></div></> : !lists.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Your role cannot send stock emails.</p> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="min-w-0 space-y-3" aria-label="Email list">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Email list">{lists.map((list) => <Button key={list} type="button" size="sm" variant={type === list ? "default" : "outline"} aria-pressed={type === list} onClick={() => chooseList(list)}>{emailListLabel(list)}</Button>)}</div>
          {seesAll ? <div className="space-y-1.5">
            <Label htmlFor="email-list-owner">List of</Label>
            <Select value={view} onValueChange={chooseView}><SelectTrigger id="email-list-owner" className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="me">My list</SelectItem>
              <SelectItem value="all">All users</SelectItem>
              {owners.map((owner) => <SelectItem key={owner.id} value={String(owner.id)}>{owner.name}{owner.canAdd ? "" : " (no longer uses this list)"}</SelectItem>)}
            </SelectContent></Select>
            <p className="text-xs text-muted-foreground">Administrator: open any user&apos;s list, or every user&apos;s together. {viewedOwner ? `Addresses you add go to ${viewedOwner.name}'s list.` : "Addresses you add go to your own list."}</p>
          </div> : <p className="text-xs text-muted-foreground">Only you see your addresses. Administrators can see every user&apos;s list.</p>}
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Search addresses" placeholder="Search name, email or category" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 min-w-0 flex-1" />
            <Select value={category} onValueChange={chooseCategory}><SelectTrigger aria-label="Category" className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {categories.map((name) => <SelectItem key={name} value={name}>{name} ({categoryCount(name)})</SelectItem>)}
              <SelectItem value={NO_CATEGORY}>No category ({categoryCount(NO_CATEGORY)})</SelectItem>
            </SelectContent></Select>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void importCsv(event)} />
            <Button type="button" size="sm" variant="outline" className="h-9" disabled={busy} onClick={() => fileRef.current?.click()} title="CSV with an Email column (and optionally Name, Company and Category or Country), or one address per row"><Upload className="size-4" />Import CSV</Button>
          </div>
          <div className="rounded-lg border">
            <label className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium"><Checkbox checked={allShownSelected} disabled={!shown.length} onCheckedChange={toggleShown} />Select {search || category !== ALL_CATEGORIES ? "shown" : "all"}{category === ALL_CATEGORIES ? "" : ` in ${category === NO_CATEGORY ? "No category" : category}`} · {selected.size} of {contacts?.length ?? 0} selected</label>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {contacts === null ? <li className="p-4 text-sm text-muted-foreground">Loading…</li> : !shown.length ? <li className="p-4 text-sm text-muted-foreground">{contacts.length ? "No address matches the search or category." : `${viewedOwner ? `${viewedOwner.name}'s` : view === "all" && seesAll ? "The" : "Your"} ${emailListLabel(type)} is empty. Add an address below or import a CSV file.`}</li>
                : shown.map((contact) => editing?.id === contact.id ? <li key={contact.id}><form onSubmit={saveEdit} className="grid grid-cols-2 gap-2 bg-muted/40 px-3 py-2">
                  <Input aria-label="Name" placeholder="Name" value={editing.name} maxLength={160} autoFocus onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="h-8" />
                  <Input aria-label="Company" placeholder="Company" value={editing.company} maxLength={160} onChange={(event) => setEditing({ ...editing, company: event.target.value })} className="h-8" />
                  <Input aria-label="Category" placeholder="Category (e.g. country)" list="email-list-categories" value={editing.category} maxLength={EMAIL_LIST_CATEGORY_MAX} onChange={(event) => setEditing({ ...editing, category: event.target.value })} className="h-8" />
                  <Input aria-label="Email address" type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} className="h-8" />
                  <div className="col-span-2 flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}><X className="size-4" />Cancel</Button><Button type="submit" size="sm" disabled={busy}><Save className="size-4" />Save</Button></div>
                </form></li> : <li key={contact.id} className="flex items-center hover:bg-muted/50"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-sm"><Checkbox checked={selected.has(contact.id)} onCheckedChange={() => toggle(contact.id)} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{[contact.name, contact.company].filter(Boolean).join(" – ") || contact.email}</span>{contact.name || contact.company ? <span className="block truncate text-xs text-muted-foreground">{contact.email}</span> : null}{seesAll && view === "all" && contact.ownerName ? <span className="block truncate text-[11px] text-muted-foreground">{contact.ownerName}&apos;s list</span> : null}</span>{contact.category ? <span className="max-w-32 shrink-0 truncate rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={`Category: ${contact.category}`}>{contact.category}</span> : null}</label><Button type="button" size="icon" variant="ghost" className="mr-1 size-8 shrink-0" disabled={busy} aria-label={`Edit ${contact.email}`} title="Edit name, company, category or email" onClick={() => setEditing({ id: contact.id, name: contact.name, company: contact.company ?? "", category: contact.category ?? "", email: contact.email })}><Pencil className="size-4" /></Button></li>)}
            </ul>
          </div>
          <form onSubmit={addOne} className="grid gap-2">
            <Input aria-label="Name" placeholder="Name" value={newAddress.name} maxLength={160} onChange={(event) => setNewAddress({ ...newAddress, name: event.target.value })} className="h-9" />
            <Input aria-label="Company name" placeholder="Company name" value={newAddress.company} maxLength={160} onChange={(event) => setNewAddress({ ...newAddress, company: event.target.value })} className="h-9" />
            <Input aria-label="Email address" type="email" placeholder="Email (name@company.com)" value={newAddress.email} onChange={(event) => setNewAddress({ ...newAddress, email: event.target.value })} className="h-9" />
            <Input aria-label="Category" placeholder="Category, e.g. country (optional)" list="email-list-categories" value={newAddress.category} maxLength={EMAIL_LIST_CATEGORY_MAX} onChange={(event) => setNewAddress({ ...newAddress, category: event.target.value })} className="h-9" />
            <datalist id="email-list-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
            <Button type="submit" size="sm" variant="outline" className="h-9" disabled={busy}><Plus className="size-4" />{viewedOwner ? `Add to ${viewedOwner.name}'s list` : "Add"}</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || !selected.size} onClick={categorizeSelected}><Tag className="size-4" />Set category</Button>
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy || !selected.size} onClick={removeSelected}><Trash2 className="size-4" />Remove selected from list</Button>
          </div>
        </section>
        <section className="min-w-0 space-y-3" aria-label="Message">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1.5"><Label>Template</Label><Select value={templateId} onValueChange={chooseTemplate}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">{itemCount ? "Standard stock email" : "Blank message"}</SelectItem>{templates.map((template) => <SelectItem key={template.id} value={String(template.id)}>{template.name}{template.shared ? " (shared)" : ""}</SelectItem>)}</SelectContent></Select></div>
            <Button type="button" size="sm" variant="outline" className="h-9" disabled={busy || !subject.trim() || !body.trim()} onClick={saveTemplate}><Save className="size-4" />Save as template</Button>
          </div>
          <div className="space-y-1.5"><Label htmlFor="stock-email-subject">Subject</Label><Input id="stock-email-subject" value={subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="stock-email-body">Message</Label><Textarea id="stock-email-body" value={body} rows={14} onChange={(event) => setBody(event.target.value)} className="font-mono text-xs" /><p className="text-xs text-muted-foreground">Templates can use {"{items}"} (the selected stock), {"{company}"}, {"{sender}"} and {"{senderEmail}"}. {"{name}"} is filled for each address with its name from the list (Sir/Madam without one; {"{contactCompany}"} adds its company), and each address then gets its own copy. Your signature is added under the message when it is turned on.</p><Button type="button" size="sm" variant="outline" onClick={() => setEditingSignature(true)}><PenLine className="size-4" />My signature</Button></div>
        </section>
      </div>}
      {editingSignature ? null : <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={busy || !selected.size || !subject.trim() || !body.trim()} onClick={send}><Send className="size-4" />{busy ? "Working…" : `Send to ${selected.size} ${selected.size === 1 ? "address" : "addresses"}`}</Button></DialogFooter>}
    </DialogContent>
  </Dialog>;
}
