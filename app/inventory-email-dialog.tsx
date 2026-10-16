"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ListPlus, Mail, PenLine, Pencil, Plus, Save, Send, Tag, Tags, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmailSignatureEditor } from "./email-signature-editor";
import { cleanEmailListCategory, defaultListEmail, defaultStockEmail, EMAIL_LIST_CATEGORY_MAX, EMAIL_LIST_CSV_MAX_BYTES, EMAIL_LIST_IDS_MAX, EMAIL_LIST_IMPORT_MAX, emailListCategories, emailListLabel, emailListsFor, inBatches, INVENTORY_EMAIL_MAX_RECIPIENTS, parseEmailListCsv, type EmailListContact, type EmailListOwner, type EmailListType } from "@/lib/email-lists";
import { EMAIL_TEMPLATE_NAME_MAX, fillEmailTemplate, STOCK_EMAIL_TYPE, withoutSignOff } from "@/lib/email-templates";
import { isValidEmail } from "@/lib/email-validation";
import { useConfirmDelete } from "./confirm-delete-dialog";

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
const count = (value: number) => value.toLocaleString("en");
// Addresses drawn at once; a longer list shows this many and the search narrows it (selecting still covers all).
const ROWS_SHOWN = 1000;
const PROGRESS_TOAST = "email-list-progress";

/**
 * Email the selected Inventory Overview stock to chosen addresses of the company's Sales or Purchase list.
 * Each user keeps their own lists, filled by hand or from a CSV file, with an optional category per address (a
 * country, region…) to filter and select by; administrators open any user's list (or everyone's) and add to it.
 * Recipients are hidden from each other. With `page`, the same lists and email are shown as the Email lists page
 * (sidebar → Overview) instead of a dialog, with no stock selected.
 */
export function InventoryEmailDialog({ open, onOpenChange, companyId, companyName, role, sender, itemsText, itemCount, itemLines = [], page = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; companyId: number; companyName: string; role: string;
  sender: { name: string; email: string }; itemsText: string; itemCount: number;
  /** Each item line's parts, so the sent email colours them (name, condition, details) without changing the text. */
  itemLines?: Array<{ identity: string; condition: string; details: string }>;
  /** Shown as a page instead of a dialog: sending clears the selection rather than closing. */
  page?: boolean;
}) {
  const { confirmDelete, confirmDeleteDialog } = useConfirmDelete();
  const lists = useMemo(() => emailListsFor(role), [role]);
  const [type, setType] = useState<EmailListType>(lists[0] ?? "sales");
  const [contacts, setContacts] = useState<EmailListContact[] | null>(null);
  const [seesAll, setSeesAll] = useState(false);
  // Administrators: whose list is open ("me", "all" or a user id) and the users they can choose.
  const [view, setView] = useState("me");
  const [owners, setOwners] = useState<(EmailListOwner & { canAdd: boolean })[]>([]);
  const [category, setCategory] = useState(ALL_CATEGORIES);
  // Saved categories (also those no address uses yet) and the Categories panel: a new name, or one being renamed.
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [managingCategories, setManagingCategories] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  // Adding existing addresses to a category: the list shows the addresses not in it, to tick and add.
  const [assignTo, setAssignTo] = useState<string | null>(null);
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
  const showList = useCallback((data: { contacts?: EmailListContact[]; categories?: string[]; seesAll?: boolean; owners?: (EmailListOwner & { canAdd: boolean })[] }) => {
    setContacts(data.contacts ?? []); setSavedCategories(data.categories ?? []); setSeesAll(data.seesAll === true); setOwners(data.owners ?? []);
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

  const categories = useMemo(() => emailListCategories([...savedCategories.map((name) => ({ category: name })), ...(contacts ?? [])]), [contacts, savedCategories]);
  const categoryCount = useCallback((name: string) => (contacts ?? []).filter((contact) => name === NO_CATEGORY ? !contact.category : contact.category.toLowerCase() === name.toLowerCase()).length, [contacts]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts ?? []).filter((contact) => (assignTo !== null ? contact.category.toLowerCase() !== assignTo.toLowerCase() : category === ALL_CATEGORIES || (category === NO_CATEGORY ? !contact.category : contact.category.toLowerCase() === category.toLowerCase()))
      && (!term || contact.email.includes(term) || contact.name.toLowerCase().includes(term) || (contact.company ?? "").toLowerCase().includes(term) || contact.category.toLowerCase().includes(term)));
  }, [contacts, search, category, assignTo]);
  // Where an added address goes: the user's own list, or the user an administrator has open.
  const viewedOwner = seesAll && view !== "me" && view !== "all" ? owners.find((owner) => String(owner.id) === view) : undefined;
  const allShownSelected = shown.length > 0 && shown.every((contact) => selected.has(contact.id));
  const toggleShown = () => setSelected((current) => { const next = new Set(current); for (const contact of shown) { if (allShownSelected) next.delete(contact.id); else next.add(contact.id); } return next; });
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chooseList = (list: EmailListType) => { if (list === type) return; setType(list); setSelected(new Set()); setSearch(""); setCategory(ALL_CATEGORIES); setEditing(null); setRenaming(null); setAssignTo(null); };
  // A new category starts a new selection, so addresses hidden by the filter are never sent to by mistake. A new
  // address typed while a category is shown goes into it.
  const chooseCategory = (next: string) => {
    if (next === category) return;
    const named = (value: string) => value !== ALL_CATEGORIES && value !== NO_CATEGORY;
    setNewAddress((current) => ({ ...current, category: named(next) ? next : named(category) && current.category === category ? "" : current.category }));
    setCategory(next); setSelected(new Set()); setAssignTo(null);
  };
  const chooseView = (next: string) => { if (next === view) return; setView(next); setSelected(new Set()); setCategory(ALL_CATEGORIES); setEditing(null); setRenaming(null); setAssignTo(null); };
  const startAssign = (name: string) => { setAssignTo(name); setSelected(new Set()); setSearch(""); setEditing(null); setManagingCategories(false); setRenaming(null); };

  const run = async (work: () => Promise<void>) => { setBusy(true); try { await work(); } catch (error) { toast.error(errorText(error)); } finally { setBusy(false); } };
  // Any number of addresses: sent in batches of 2,000, with progress; only the last batch returns the list.
  const addContacts = (rows: Address[], skipped = 0) => run(async () => {
    const batches = inBatches(rows, EMAIL_LIST_IMPORT_MAX);
    const totals = { added: 0, alreadyListed: 0, invalid: 0 };
    try {
      for (const [index, batch] of batches.entries()) {
        if (batches.length > 1) toast.loading(`Adding addresses… ${count(index * EMAIL_LIST_IMPORT_MAX)} of ${count(rows.length)}`, { id: PROGRESS_TOAST });
        const last = index === batches.length - 1;
        const data = await call("/api/email-lists", "POST", { companyId, type, contacts: batch, view, list: last, ...(viewedOwner ? { ownerUserId: viewedOwner.id } : {}) });
        totals.added += Number(data.added ?? 0); totals.alreadyListed += Number(data.alreadyListed ?? 0); totals.invalid += Number(data.invalid ?? 0);
        if (last) showList(data);
      }
    } catch (error) {
      toast.dismiss(PROGRESS_TOAST);
      if (totals.added) void loadList(type, view);
      throw new Error(totals.added ? `${count(totals.added)} added, then: ${errorText(error)}` : errorText(error));
    }
    toast.dismiss(PROGRESS_TOAST);
    const extra = [totals.alreadyListed ? `${count(totals.alreadyListed)} already listed` : "", skipped + totals.invalid ? `${count(skipped + totals.invalid)} rows without a valid address skipped` : ""].filter(Boolean).join(", ");
    toast.success(`${count(totals.added)} added to the ${emailListLabel(type)}${viewedOwner ? ` of ${viewedOwner.name}` : ""}${extra ? ` (${extra})` : ""}`);
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
    if (file.size > EMAIL_LIST_CSV_MAX_BYTES) return toast.error(`The CSV file is larger than ${EMAIL_LIST_CSV_MAX_BYTES / 1024 / 1024} MB. Split it into smaller files.`);
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
  // Removing or categorising any number of addresses: batches of 5,000; returns the total the server counted.
  const patchInBatches = async (action: "remove" | "categorize", ids: number[], extra: Record<string, unknown>, counted: "removed" | "changed") => {
    const batches = inBatches(ids, EMAIL_LIST_IDS_MAX);
    let total = 0;
    try {
      for (const [index, batch] of batches.entries()) {
        const last = index === batches.length - 1;
        const data = await call("/api/email-lists", "PATCH", { companyId, type, view, action, ids: batch, list: last, ...extra });
        total += Number(data[counted] ?? 0);
        if (last) showList(data);
      }
    } catch (error) {
      if (total) void loadList(type, view);
      throw error;
    }
    return total;
  };
  const removeSelected = () => {
    const ids = [...selected];
    if (!ids.length) return;
    const chosen = (contacts ?? []).filter((contact) => selected.has(contact.id));
    void confirmDelete({ title: `Remove ${count(ids.length)} ${ids.length === 1 ? "address" : "addresses"}?`, description: `They are removed from the ${emailListLabel(type)}.${seesAll ? " This removes them for the users who added them." : ""}`, details: [{ label: "Type", value: `${emailListLabel(type)} addresses` }, { label: "Count", value: count(ids.length) }, { label: ids.length === 1 ? "Address" : "Addresses", value: chosen.slice(0, 8).map((contact) => [contact.name, contact.email].filter(Boolean).join(" · ")).join("; ") + (chosen.length > 8 ? `; and ${count(chosen.length - 8)} more` : "") }, { label: "Categories", value: [...new Set(chosen.map((contact) => contact.category).filter(Boolean))].join(", ") }], confirmLabel: ids.length === 1 ? "Remove address" : "Remove addresses" }).then((confirmed) => { if (confirmed) removeConfirmed(ids); });
  };
  const removeConfirmed = (ids: number[]) => {
    void run(async () => { const removed = await patchInBatches("remove", ids, {}, "removed"); setSelected(new Set()); toast.success(`${count(removed)} removed`); });
  };
  // Puts the selected addresses in a category ("" clears it); after adding to a category, that category is shown.
  const categorizeSelected = (name: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    const adding = assignTo;
    void run(async () => {
      const changed = await patchInBatches("categorize", ids, { category: name }, "changed");
      setSelected(new Set());
      if (adding !== null) { setAssignTo(null); setCategory(adding); setNewAddress((current) => ({ ...current, category: adding })); }
      toast.success(name ? `${count(changed)} put in ${name}` : `Category cleared for ${count(changed)}`);
    });
  };
  // Categories panel: add one before any address uses it, rename one (its addresses follow) or delete one (its
  // addresses stay, without a category). With "All users" open, rename and delete apply to every user's list.
  const addCategory = (event: FormEvent) => {
    event.preventDefault();
    const name = cleanEmailListCategory(newCategory);
    if (!name) return toast.error("Enter a category name.");
    void run(async () => { showList(await call("/api/email-lists", "PATCH", { companyId, type, view, action: "addCategory", name })); setNewCategory(""); toast.success(`Category ${name} added`); });
  };
  const renameCategory = (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;
    const to = cleanEmailListCategory(renaming.to);
    if (!to) return toast.error("Enter the new category name.");
    if (to === renaming.from) return setRenaming(null);
    const { from } = renaming;
    void run(async () => {
      const data = await call("/api/email-lists", "PATCH", { companyId, type, view, action: "renameCategory", from, to });
      showList(data); setRenaming(null);
      if (category.toLowerCase() === from.toLowerCase()) setCategory(to);
      toast.success(`${from} renamed to ${to}${data.changed ? ` (${data.changed} ${data.changed === 1 ? "address" : "addresses"})` : ""}`);
    });
  };
  const deleteCategory = (name: string) => {
    const count = categoryCount(name);
    void confirmDelete({ title: `Delete category ${name}?`, description: seesAll && view === "all" ? "This applies to every user's list." : "Only the category is deleted.", details: [{ label: "Type", value: `${emailListLabel(type)} category` }, { label: "Name", value: name }, { label: "Addresses", value: `${count}` }], affected: count ? [`Its ${count} ${count === 1 ? "address stays" : "addresses stay"} in the list without a category.`] : [], confirmLabel: "Delete category" }).then((confirmed) => { if (confirmed) deleteCategoryConfirmed(name); });
  };
  const deleteCategoryConfirmed = (name: string) => {
    void run(async () => {
      showList(await call("/api/email-lists", "PATCH", { companyId, type, view, action: "deleteCategory", name }));
      if (category.toLowerCase() === name.toLowerCase()) { setCategory(ALL_CATEGORIES); setSelected(new Set()); }
      toast.success(`Category ${name} deleted`);
    });
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
  // Any number of addresses: each address once (the same email in several users' lists goes once), sent in requests
  // of up to 500 one after another, with progress; a failure reports how many were already sent.
  const send = () => {
    const byEmail = new Map<string, number>();
    for (const contact of contacts ?? []) if (selected.has(contact.id) && !byEmail.has(contact.email.toLowerCase())) byEmail.set(contact.email.toLowerCase(), contact.id);
    const ids = [...byEmail.values()];
    if (!ids.length) return toast.error("Select at least one email address.");
    const batches = inBatches(ids, INVENTORY_EMAIL_MAX_RECIPIENTS);
    if (batches.length > 1 && !window.confirm(`Send this email to ${count(ids.length)} addresses? It goes out in ${batches.length} parts; keep this window open until it finishes.`)) return;
    void run(async () => {
      let sent = 0;
      try {
        for (const batch of batches) {
          if (batches.length > 1) toast.loading(`Sending… ${count(sent)} of ${count(ids.length)} addresses`, { id: PROGRESS_TOAST });
          const data = await call("/api/inventory-emails", "POST", { companyId, type, contactIds: batch, subject, body, itemLines });
          sent += Number(data.recipients ?? 0);
        }
      } catch (error) {
        toast.dismiss(PROGRESS_TOAST);
        throw new Error(sent ? `Sent to ${count(sent)} of ${count(ids.length)} addresses, then: ${errorText(error)}` : errorText(error));
      }
      toast.dismiss(PROGRESS_TOAST);
      toast.success(`Email sent to ${count(sent)} ${sent === 1 ? "address" : "addresses"}`);
      if (page) setSelected(new Set()); else onOpenChange(false);
    });
  };

  const content = <>{editingSignature ? <><EmailSignatureEditor companyId={companyId} onSaved={setSignatureOn} /><div><Button type="button" variant="outline" onClick={() => setEditingSignature(false)}>Back to the email</Button></div></> : !lists.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Your role cannot send stock emails.</p> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
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
            <Input aria-label="Search addresses" placeholder="Search name, email or category" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 min-w-48 flex-1" />
            <Select value={category} onValueChange={chooseCategory} disabled={assignTo !== null}><SelectTrigger aria-label="Category" className="h-9 w-44"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {categories.map((name) => <SelectItem key={name} value={name}>{name} ({categoryCount(name)})</SelectItem>)}
              <SelectItem value={NO_CATEGORY}>No category ({categoryCount(NO_CATEGORY)})</SelectItem>
            </SelectContent></Select>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void importCsv(event)} />
            <Button type="button" size="sm" variant={managingCategories ? "default" : "outline"} className="h-9" aria-expanded={managingCategories} onClick={() => { setManagingCategories(!managingCategories); setRenaming(null); }}><Tags className="size-4" />Categories</Button>
            <Button type="button" size="sm" variant="outline" className="h-9" disabled={busy} onClick={() => fileRef.current?.click()} title="CSV with an Email column (and optionally Name, Company and Category or Country), or one address per row"><Upload className="size-4" />Import CSV</Button>
          </div>
          {managingCategories ? <div className="space-y-2 rounded-lg border bg-muted/30 p-3" aria-label="Categories">
            <form onSubmit={addCategory} className="flex gap-2"><Input aria-label="New category" placeholder="New category, e.g. a country" value={newCategory} maxLength={EMAIL_LIST_CATEGORY_MAX} onChange={(event) => setNewCategory(event.target.value)} className="h-8 min-w-0 flex-1" /><Button type="submit" size="sm" variant="outline" className="h-8" disabled={busy}><Plus className="size-4" />Add category</Button></form>
            {categories.length ? <ul className="max-h-48 divide-y overflow-y-auto rounded-md border bg-background">{categories.map((name) => renaming?.from === name ? <li key={name}><form onSubmit={renameCategory} className="flex items-center gap-2 px-2 py-1.5">
              <Input aria-label={`New name for ${name}`} value={renaming.to} maxLength={EMAIL_LIST_CATEGORY_MAX} autoFocus onChange={(event) => setRenaming({ ...renaming, to: event.target.value })} className="h-8 min-w-0 flex-1" />
              <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" disabled={busy} aria-label="Cancel renaming" title="Cancel" onClick={() => setRenaming(null)}><X className="size-4" /></Button><Button type="submit" size="icon" className="size-8 shrink-0" disabled={busy} aria-label={`Save the new name for ${name}`} title="Save"><Check className="size-4" /></Button>
            </form></li> : <li key={name} className="flex items-center gap-1 px-3 py-1 text-sm"><span className="min-w-0 flex-1 truncate">{name} <span className="text-xs text-muted-foreground">({categoryCount(name)})</span></span>
              <Button type="button" size="icon" variant="ghost" className="size-8" disabled={busy || !contacts?.length} aria-label={`Add addresses to ${name}`} title="Add addresses from the list to this category" onClick={() => startAssign(name)}><ListPlus className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" className="size-8" disabled={busy} aria-label={`Rename ${name}`} title="Rename" onClick={() => setRenaming({ from: name, to: name })}><Pencil className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" className="size-8 text-destructive" disabled={busy} aria-label={`Delete ${name}`} title="Delete (its addresses stay, without a category)" onClick={() => deleteCategory(name)}><Trash2 className="size-4" /></Button>
            </li>)}</ul> : <p className="text-xs text-muted-foreground">No categories yet. Add one above, or give an address a category.</p>}
            <p className="text-xs text-muted-foreground">Use the list icon to add addresses to a category. Renaming moves its addresses to the new name; deleting keeps the addresses without a category.{seesAll && view === "all" ? " With All users open, renaming and deleting apply to every user's list; a new category goes to your own." : viewedOwner ? ` These are ${viewedOwner.name}'s categories.` : ""}</p>
          </div> : null}
          {assignTo !== null ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm" role="status">
            <span className="min-w-0 flex-1">Adding to <strong>{assignTo}</strong>: tick the addresses below (those already in it are not shown), then press Add.</span>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setAssignTo(null); setSelected(new Set()); }}><X className="size-4" />Cancel</Button>
            <Button type="button" size="sm" disabled={busy || !selected.size} onClick={() => categorizeSelected(assignTo)}><ListPlus className="size-4" />Add {selected.size || ""} to {assignTo}</Button>
          </div> : null}
          <div className="rounded-lg border">
            <label className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium"><Checkbox checked={allShownSelected} disabled={!shown.length} onCheckedChange={toggleShown} />Select {search || category !== ALL_CATEGORIES ? "shown" : "all"}{assignTo !== null ? ` not in ${assignTo}` : category === ALL_CATEGORIES ? "" : ` in ${category === NO_CATEGORY ? "No category" : category}`} · {count(selected.size)} of {count(contacts?.length ?? 0)} selected</label>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {contacts === null ? <li className="p-4 text-sm text-muted-foreground">Loading…</li> : !shown.length ? <li className="p-4 text-sm text-muted-foreground">{assignTo !== null ? (search ? "No address matches the search." : `Every address is already in ${assignTo}.`)
                : contacts.length && !search && category !== ALL_CATEGORIES && category !== NO_CATEGORY ? <span className="flex flex-wrap items-center gap-2">No address in {category} yet. Add a new one below (it goes into {category}), or<Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startAssign(category)}><ListPlus className="size-4" />Choose addresses to add</Button></span>
                : contacts.length ? "No address matches the search or category." : `${viewedOwner ? `${viewedOwner.name}'s` : view === "all" && seesAll ? "The" : "Your"} ${emailListLabel(type)} is empty. Add an address below or import a CSV file.`}</li>
                : shown.slice(0, ROWS_SHOWN).map((contact) => editing?.id === contact.id ? <li key={contact.id}><form onSubmit={saveEdit} className="grid grid-cols-2 gap-2 bg-muted/40 px-3 py-2">
                  <Input aria-label="Name" placeholder="Name" value={editing.name} maxLength={160} autoFocus onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="h-8" />
                  <Input aria-label="Company" placeholder="Company" value={editing.company} maxLength={160} onChange={(event) => setEditing({ ...editing, company: event.target.value })} className="h-8" />
                  <Input aria-label="Category" placeholder="Category (e.g. country)" list="email-list-categories" value={editing.category} maxLength={EMAIL_LIST_CATEGORY_MAX} onChange={(event) => setEditing({ ...editing, category: event.target.value })} className="h-8" />
                  <Input aria-label="Email address" type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} className="h-8" />
                  <div className="col-span-2 flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}><X className="size-4" />Cancel</Button><Button type="submit" size="sm" disabled={busy}><Save className="size-4" />Save</Button></div>
                </form></li> : <li key={contact.id} className="flex items-center hover:bg-muted/50"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-sm"><Checkbox checked={selected.has(contact.id)} onCheckedChange={() => toggle(contact.id)} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{[contact.name, contact.company].filter(Boolean).join(" – ") || contact.email}</span>{contact.name || contact.company ? <span className="block truncate text-xs text-muted-foreground">{contact.email}</span> : null}{seesAll && view === "all" && contact.ownerName ? <span className="block truncate text-[11px] text-muted-foreground">{contact.ownerName}&apos;s list</span> : null}</span>{contact.category ? <span className="max-w-32 shrink-0 truncate rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={`Category: ${contact.category}`}>{contact.category}</span> : null}</label><Button type="button" size="icon" variant="ghost" className="mr-1 size-8 shrink-0" disabled={busy} aria-label={`Edit ${contact.email}`} title="Edit name, company, category or email" onClick={() => setEditing({ id: contact.id, name: contact.name, company: contact.company ?? "", category: contact.category ?? "", email: contact.email })}><Pencil className="size-4" /></Button></li>)}
            </ul>
            {shown.length > ROWS_SHOWN ? <p className="border-t px-3 py-2 text-xs text-muted-foreground">Showing the first {count(ROWS_SHOWN)} of {count(shown.length)}. Search or choose a category to narrow the list; Select {search || category !== ALL_CATEGORIES || assignTo !== null ? "shown" : "all"} still selects all {count(shown.length)}.</p> : null}
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
            {assignTo === null ? <Select value="" onValueChange={(name) => categorizeSelected(name === NO_CATEGORY ? "" : name)} disabled={busy || !selected.size}>
              <SelectTrigger aria-label="Set category of the selected addresses" className="h-8 w-auto gap-2 text-sm"><Tag className="size-4" /><SelectValue placeholder={selected.size ? `Set category (${selected.size})` : "Set category"} /></SelectTrigger>
              <SelectContent>{categories.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}<SelectItem value={NO_CATEGORY}>No category (clear)</SelectItem></SelectContent>
            </Select> : null}
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy || !selected.size || assignTo !== null} onClick={removeSelected}><Trash2 className="size-4" />Remove selected from list</Button>
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
      </div>}</>;
  if (page) return <section aria-label="Email lists" className="space-y-4 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm">
    <p className="text-sm text-muted-foreground">Keep your Sales and Purchase email lists, sort them into categories and email news or offers to chosen addresses. To email stock, select items in Inventory Overview and press Send. Each address receives its own copy; recipients do not see each other, and replies come to {sender.email || "you"}.</p>
    {content}
    {editingSignature ? null : <div className="flex justify-end"><Button type="button" disabled={busy || !selected.size || assignTo !== null || !subject.trim() || !body.trim()} onClick={send}><Send className="size-4" />{busy ? "Working…" : `Send to ${count(selected.size)} ${selected.size === 1 ? "address" : "addresses"}`}</Button></div>}
  </section>;

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>{confirmDeleteDialog}
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="size-5" />{itemCount ? "Email stock list" : "Email"}</DialogTitle><DialogDescription>{itemCount ? `${itemCount} ${itemCount === 1 ? "item" : "items"} from Inventory Overview.` : "No item selected: write your own message, e.g. news or items from your website."} Each address receives its own copy; recipients do not see each other, and replies come to {sender.email || "you"}.</DialogDescription></DialogHeader>
      {content}
      {editingSignature ? null : <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={busy || !selected.size || assignTo !== null || !subject.trim() || !body.trim()} onClick={send}><Send className="size-4" />{busy ? "Working…" : `Send to ${count(selected.size)} ${selected.size === 1 ? "address" : "addresses"}`}</Button></DialogFooter>}
    </DialogContent>
  </Dialog>;
}
