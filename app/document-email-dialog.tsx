"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2, FileText, History, Mail, Pencil, PenLine, Plus, RefreshCw, Send, Trash2, TriangleAlert, X } from "lucide-react";
import { finalDelivery, type DeliveryCheck, type DeliveryTone } from "@/lib/email-delivery";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmailSignatureEditor } from "./email-signature-editor";
import { EMAIL_DOCUMENT_TYPES, EMAIL_PLACEHOLDERS, MAX_ATTACHMENT_BYTES, defaultEmailTemplate, emailDocumentTypeLabel, fillEmailTemplate, parseEmailList, templateFits, type EmailValues } from "@/lib/email-templates";

export type EmailDocument = { id: number; type: string; number: string; party: string; total: number; currency: string; transactionDate: string; dueDate: string };
type Template = { id: number; name: string; documentType: string; subject: string; body: string; shared: boolean; mine: boolean; editable: boolean; ownerName: string | null };
type Delivery = { canCheck: boolean; status: string; label: string; tone: DeliveryTone; checks: DeliveryCheck[]; checkedAt: string | null };
type SentEmail = { id: number; createdAt: string; sentByName: string; recipients: string[]; cc: string[]; subject: string; attachmentName: string; status: string; error: string; delivery?: Delivery };

const toneClass: Record<DeliveryTone, string> = { good: "text-emerald-700 dark:text-emerald-300", waiting: "text-amber-700 dark:text-amber-300", bad: "text-rose-600 dark:text-rose-400", unknown: "text-muted-foreground" };

/** turboSMTP delivery status of one sent email, with Check delivery (emails sent through the turboSMTP API only). */
function DeliveryLine({ companyId, item, onChecked }: { companyId: number; item: SentEmail; onChecked: (delivery: Delivery) => void }) {
  const [checking, setChecking] = useState(false);
  const delivery = item.delivery;
  if (!delivery?.canCheck) return null;
  const check = async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/document-emails", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: item.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not get the delivery status.");
      onChecked(data.delivery);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not get the delivery status.", { duration: 10_000 }); }
    finally { setChecking(false); }
  };
  const problems = delivery.checks.filter((entry) => entry.error);
  return <div className="space-y-1 text-xs">
    <p className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Delivery:</span><span className={`font-medium ${toneClass[delivery.tone]}`}>{delivery.label || "Not checked yet"}</span>{delivery.checkedAt ? <span className="text-muted-foreground">checked {sentAt(delivery.checkedAt)}</span> : null}{!finalDelivery(delivery.status) || !delivery.checkedAt ? <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={checking} onClick={() => void check()}><RefreshCw className={`size-3 ${checking ? "animate-spin" : ""}`} />{checking ? "Checking…" : "Check delivery"}</Button> : null}</p>
    {problems.map((entry) => <p key={entry.id} className="break-words text-rose-600 dark:text-rose-400">{entry.recipient ? `${entry.recipient}: ` : ""}{entry.error}</p>)}
  </div>;
}
type Loaded = { configured: boolean; suggestions: { contact: string[]; previous: string[] }; sender: { name: string; email: string }; history: SentEmail[] };

const BUILT_IN = "built-in";
const day = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }) : value;
};
const sentAt = (value: string) => new Date(value.replace(" ", "T")).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const lastTemplateKey = (companyId: number, type: string) => `comnet-email-template:${companyId}:${type}`;
const readLastTemplate = (key: string) => { try { return window.localStorage.getItem(key) ?? ""; } catch { return ""; } };
const writeLastTemplate = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* Only a convenience. */ } };
const typeLabel = (type: string) => type === "pending invoice" ? "Invoice" : emailDocumentTypeLabel(type);

/** Addresses as removable chips; type, paste or pick suggestions. Commas, spaces, semicolons and Enter add them. */
function AddressField({ id, label, addresses, onChange, suggestions, placeholder }: { id: string; label: string; addresses: string[]; onChange: (next: string[]) => void; suggestions?: { label: string; addresses: string[] }[]; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const commit = (text: string) => {
    const { valid, invalid } = parseEmailList(text);
    if (valid.length) onChange([...addresses, ...valid.filter((address) => !addresses.includes(address))]);
    setDraft(invalid.join(" "));
    setProblem(invalid.length ? `Not an email address: ${invalid.join(", ")}` : "");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", ";", "Tab"].includes(event.key) && draft.trim()) { event.preventDefault(); commit(draft); }
    else if (event.key === "Backspace" && !draft && addresses.length) onChange(addresses.slice(0, -1));
  };
  const offered = (suggestions ?? []).map((group) => ({ ...group, addresses: group.addresses.filter((address) => !addresses.includes(address)) })).filter((group) => group.addresses.length);
  return <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2"><Label htmlFor={id}>{label}</Label>{addresses.length ? <span className="text-xs text-muted-foreground">{addresses.length} {addresses.length === 1 ? "address" : "addresses"}{addresses.length > 1 ? <> · <button type="button" className="underline-offset-2 hover:underline" onClick={() => onChange([])}>Clear</button></> : null}</span> : null}</div>
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/50">
      {addresses.map((address) => <span key={address} className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-100"><span className="truncate">{address}</span><button type="button" aria-label={`Remove ${address}`} className="grid size-4 place-items-center rounded-full hover:bg-sky-200 dark:hover:bg-sky-900" onClick={() => onChange(addresses.filter((item) => item !== address))}><X className="size-3" /></button></span>)}
      <input id={id} value={draft} onChange={(event) => { setDraft(event.target.value); setProblem(""); }} onKeyDown={onKey} onBlur={() => { if (draft.trim()) commit(draft); }} onPaste={(event) => { const text = event.clipboardData.getData("text"); if (/[,;\s]/.test(text.trim())) { event.preventDefault(); commit(`${draft} ${text}`); } }} placeholder={addresses.length ? "Add another…" : placeholder} className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none" autoComplete="off" />
    </div>
    {problem ? <p className="text-xs text-rose-600">{problem}</p> : null}
    {offered.map((group) => <div key={group.label} className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-muted-foreground">{group.label}:</span>{group.addresses.slice(0, 12).map((address) => <button key={address} type="button" className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 hover:bg-muted" onClick={() => onChange([...addresses, address])}><Plus className="size-3" />{address}</button>)}{group.addresses.length > 1 ? <button type="button" className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => onChange([...addresses, ...group.addresses])}>Add all</button> : null}</div>)}
  </div>;
}

/** Create and edit email templates: each person's own, optionally shared with everyone in the company. */
function TemplateEditor({ companyId, documentType, templates, onSaved, onUse }: { companyId: number; documentType: string; templates: Template[]; onSaved: () => void; onUse: (template: Template) => void }) {
  const blank = { id: 0, name: "", documentType, ...defaultEmailTemplate(documentType), shared: false };
  const [form, setForm] = useState<typeof blank | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<"subject" | "body">("body");
  const insert = (key: string) => {
    if (!form) return;
    const field = lastField.current, element = field === "subject" ? subjectRef.current : bodyRef.current, text = `{${key}}`;
    const value = form[field], start = element?.selectionStart ?? value.length, end = element?.selectionEnd ?? value.length;
    setForm({ ...form, [field]: value.slice(0, start) + text + value.slice(end) });
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(start + text.length, start + text.length); });
  };
  const call = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/email-templates", { method: body.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the template.");
      toast.success(done); setForm(null); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the template."); }
    finally { setBusy(false); }
  };
  if (form) return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void call(form, form.id ? "Template saved" : "Template added"); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="template-name">Template name</Label><Input id="template-name" value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Invoice — friendly" required /></div>
      <div className="space-y-1.5"><Label>Use for</Label><Select value={form.documentType} onValueChange={(value) => setForm({ ...form, documentType: value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{EMAIL_DOCUMENT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="space-y-1.5"><Label htmlFor="template-subject">Subject</Label><Input ref={subjectRef} id="template-subject" value={form.subject} maxLength={300} onFocus={() => { lastField.current = "subject"; }} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /></div>
    <div className="space-y-1.5"><Label htmlFor="template-body">Message</Label><Textarea ref={bodyRef} id="template-body" rows={9} value={form.body} onFocus={() => { lastField.current = "body"; }} onChange={(event) => setForm({ ...form, body: event.target.value })} required /></div>
    <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Insert a field — it is filled from the document when you send:</p><div className="flex flex-wrap gap-1.5">{EMAIL_PLACEHOLDERS.map((placeholder) => <button key={placeholder.key} type="button" className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs hover:bg-muted" onClick={() => insert(placeholder.key)}><span className="font-mono">{`{${placeholder.key}}`}</span> <span className="text-muted-foreground">{placeholder.label}</span></button>)}</div></div>
    <label className="flex items-start gap-2 text-sm"><Checkbox checked={form.shared} onCheckedChange={(checked) => setForm({ ...form, shared: checked === true })} className="mt-0.5" /><span>Share with everyone in this company<span className="block text-xs text-muted-foreground">Others can use it; only you and administrators can change it.</span></span></label>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : form.id ? "Save template" : "Add template"}</Button></div>
  </form>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Your templates and the ones shared with the company.</p><Button type="button" size="sm" onClick={() => setForm(blank)}><Plus className="size-4" />New template</Button></div>
    {templates.length ? <ul className="divide-y rounded-lg border">{templates.map((template) => <li key={template.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-56"><p className="flex flex-wrap items-center gap-1.5 font-medium">{template.name}<Badge variant="outline" className="font-normal">{emailDocumentTypeLabel(template.documentType)}</Badge>{template.shared ? <Badge variant="secondary" className="font-normal">Shared{template.mine ? "" : ` · ${template.ownerName || "colleague"}`}</Badge> : null}</p><p className="truncate text-xs text-muted-foreground">{template.subject}</p></div>
      <div className="flex gap-1">
        {templateFits(template.documentType, documentType) ? <Button type="button" size="sm" variant="outline" onClick={() => onUse(template)}>Use</Button> : null}
        {template.editable ? <><Button type="button" size="icon" variant="ghost" aria-label={`Edit ${template.name}`} onClick={() => setForm({ id: template.id, name: template.name, documentType: template.documentType, subject: template.subject, body: template.body, shared: template.shared })}><Pencil className="size-4" /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${template.name}`} disabled={busy} onClick={() => { if (window.confirm(`Delete the template “${template.name}”?`)) void call({ id: template.id, remove: true }, "Template deleted"); }}><Trash2 className="size-4" /></Button></> : null}
      </div>
    </li>)}</ul> : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No templates yet. Add one to reuse your wording for every customer or supplier.</div>}
  </div>;
}

/**
 * Email a sales or purchase document with its PDF. Pick a template (or the built-in wording), add any number of To
 * and Cc addresses, check the message and send. Replies go to the sender. Every send is listed under History.
 */
export function DocumentEmailDialog({ open, onOpenChange, companyId, companyName, document, partyName, makePdf }: {
  open: boolean; onOpenChange: (open: boolean) => void; companyId: number; companyName: string; document: EmailDocument; partyName: string;
  makePdf: () => Promise<{ blob: Blob; fileName: string } | null>;
}) {
  const [tab, setTab] = useState<"compose" | "templates" | "signature" | "history">("compose");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState(BUILT_IN);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(true);
  const [sending, setSending] = useState(false);
  const rememberKey = lastTemplateKey(companyId, document.type);

  const values = useMemo<EmailValues>(() => ({
    name: partyName || document.party, type: typeLabel(document.type), number: document.number, date: day(document.transactionDate), dueDate: day(document.dueDate),
    amount: Number(document.total || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currency: document.currency || "AED",
    company: companyName, sender: loaded?.sender.name ?? "", senderEmail: loaded?.sender.email ?? "",
  }), [companyName, document, loaded?.sender.email, loaded?.sender.name, partyName]);
  const fitting = templates.filter((template) => templateFits(template.documentType, document.type));
  const apply = useCallback((id: string, list: Template[], fill: EmailValues) => {
    const template = list.find((item) => String(item.id) === id);
    const source = template ?? defaultEmailTemplate(document.type);
    setTemplateId(template ? id : BUILT_IN);
    setSubject(fillEmailTemplate(source.subject, fill));
    setBody(fillEmailTemplate(source.body, fill));
  }, [document.type]);

  const loadTemplates = useCallback(async () => {
    const response = await fetch(`/api/email-templates?companyId=${companyId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the email templates.");
    setTemplates(data.templates);
    return data.templates as Template[];
  }, [companyId]);
  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/document-emails?companyId=${companyId}&transactionId=${document.id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the email details.");
    setLoaded(data);
    return data as Loaded;
  }, [companyId, document.id]);

  // Opening: load templates, history and suggested addresses; start with the customer's or supplier's saved email
  // and the template last used for this kind of document.
  useEffect(() => {
    if (!open) return;
    let active = true;
    // The loaders set state only after their requests finish, not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadTemplates(), loadHistory()]).then(([list, data]) => {
      if (!active) return;
      setTo(data.suggestions.contact);
      setCc([]); setShowCc(false); setAttach(true); setTab("compose");
      const remembered = readLastTemplate(rememberKey);
      const fits = list.filter((template) => templateFits(template.documentType, document.type));
      const start = fits.some((template) => String(template.id) === remembered) ? remembered : fits.find((template) => template.documentType === document.type)?.id?.toString() ?? BUILT_IN;
      apply(start, list, { ...values, sender: data.sender.name, senderEmail: data.sender.email });
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not open the email."); });
    return () => { active = false; };
    // Load once per opening; later value changes must not overwrite what the person typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, document.id]);

  const send = async () => {
    if (!to.length) return toast.error("Add at least one email address in To.");
    if (!subject.trim() || !body.trim()) return toast.error("Write a subject and a message.");
    setSending(true);
    try {
      const form = new FormData();
      form.set("companyId", String(companyId)); form.set("transactionId", String(document.id));
      form.set("to", to.join(",")); form.set("cc", cc.join(",")); form.set("subject", subject); form.set("body", body);
      if (attach) {
        const pdf = await makePdf();
        if (!pdf) throw new Error("The document preview is not ready. Wait a moment and try again.");
        if (pdf.blob.size > MAX_ATTACHMENT_BYTES) throw new Error("The PDF is larger than 4 MB. Remove large images from the document and try again.");
        form.set("pdf", pdf.blob, pdf.fileName);
      }
      const response = await fetch("/api/document-emails", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { void loadHistory().catch(() => undefined); throw new Error(data.error || "The email could not be sent."); }
      writeLastTemplate(rememberKey, templateId);
      toast.success(`Emailed ${typeLabel(document.type).toLowerCase()} ${document.number} to ${data.recipients} ${data.recipients === 1 ? "address" : "addresses"}`);
      onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "The email could not be sent.", { duration: 15_000 }); }
    finally { setSending(false); }
  };

  const mine = fitting.filter((template) => template.mine), shared = fitting.filter((template) => !template.mine);
  const history = loaded?.history ?? [];
  const tabs = [{ key: "compose", label: "Compose", icon: Mail }, { key: "templates", label: "Templates", icon: FileText }, { key: "signature", label: "Signature", icon: PenLine }, { key: "history", label: history.length ? `History (${history.length})` : "History", icon: History }] as const;
  return <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="size-5 text-sky-600" />Email {typeLabel(document.type)} {document.number}</DialogTitle><DialogDescription>To {partyName || document.party} · {document.currency} {values.amount}</DialogDescription></DialogHeader>
      <div role="tablist" aria-label="Email" className="flex gap-1 border-b">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-sky-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" />{label}</button>)}</div>
      {loaded && !loaded.configured ? <div role="alert" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><TriangleAlert className="mt-0.5 size-4 shrink-0" />Emails are not set up yet. An All-Admin can set the email server (turboSMTP or another) in Admin Controls → Email server.</div> : null}

      {tab === "compose" ? <div className="space-y-4">
        <div className="space-y-1.5"><Label>Template</Label><Select value={templateId} onValueChange={(value) => apply(value, templates, values)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value={BUILT_IN}>Standard wording</SelectItem>
          {mine.length ? <><SelectSeparator /><SelectGroup><SelectLabel>My templates</SelectLabel>{mine.map((template) => <SelectItem key={template.id} value={String(template.id)}>{template.name}</SelectItem>)}</SelectGroup></> : null}
          {shared.length ? <><SelectSeparator /><SelectGroup><SelectLabel>Shared</SelectLabel>{shared.map((template) => <SelectItem key={template.id} value={String(template.id)}>{template.name}{template.ownerName ? ` · ${template.ownerName}` : ""}</SelectItem>)}</SelectGroup></> : null}
        </SelectContent></Select><p className="text-xs text-muted-foreground">Choosing a template rewrites the subject and message below. <button type="button" className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => setTab("templates")}>Manage templates</button></p></div>
        <AddressField id="email-to" label="To" addresses={to} onChange={setTo} placeholder="name@company.com — paste several at once" suggestions={[{ label: "Saved", addresses: loaded?.suggestions.contact ?? [] }, { label: "Used before", addresses: loaded?.suggestions.previous ?? [] }]} />
        {showCc ? <AddressField id="email-cc" label="Cc" addresses={cc} onChange={setCc} placeholder="Copy to…" /> : <button type="button" className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => setShowCc(true)}>+ Add Cc</button>}
        <div className="space-y-1.5"><Label htmlFor="email-subject">Subject</Label><Input id="email-subject" value={subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="email-body">Message</Label><Textarea id="email-body" rows={10} value={body} onChange={(event) => setBody(event.target.value)} /><p className="text-xs text-muted-foreground">Replies go to {loaded?.sender.email || "you"}. Your signature is added under the message when it is turned on — <button type="button" className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => setTab("signature")}>edit signature</button>.</p></div>
        <label className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm"><Checkbox checked={attach} onCheckedChange={(checked) => setAttach(checked === true)} /><FileText className="size-4 text-rose-600" /><span>Attach the PDF of this {typeLabel(document.type).toLowerCase()} <span className="text-muted-foreground">(as shown in the preview)</span></span></label>
      </div> : null}

      {tab === "templates" ? <TemplateEditor companyId={companyId} documentType={document.type} templates={templates} onSaved={() => void loadTemplates().catch((error) => toast.error(error.message))} onUse={(template) => { apply(String(template.id), templates, values); setTab("compose"); }} /> : null}

      {tab === "signature" ? <EmailSignatureEditor companyId={companyId} /> : null}

      {tab === "history" ? (history.length ? <ul className="divide-y rounded-lg border">{history.map((item) => <li key={item.id} className="space-y-1 px-3 py-2.5 text-sm">
        <p className="flex flex-wrap items-center gap-2">{item.status === "sent" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <TriangleAlert className="size-4 text-rose-600" />}<span className="font-medium">{item.status === "sent" ? "Sent" : "Failed"}</span><span className="text-muted-foreground">{sentAt(item.createdAt)} · {item.sentByName}</span></p>
        <p className="break-words text-xs"><span className="text-muted-foreground">To:</span> {item.recipients.join(", ")}{item.cc.length ? <><span className="text-muted-foreground"> · Cc:</span> {item.cc.join(", ")}</> : null}</p>
        <p className="truncate text-xs text-muted-foreground">{item.subject}{item.attachmentName ? ` · ${item.attachmentName}` : " · no attachment"}</p>
        {item.error ? <p className="text-xs text-rose-600">{item.error}</p> : null}
        <DeliveryLine companyId={companyId} item={item} onChecked={(delivery) => setLoaded((current) => current ? { ...current, history: current.history.map((entry) => entry.id === item.id ? { ...entry, delivery } : entry) } : current)} />
      </li>)}</ul> : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">This document has not been emailed yet.</div>) : null}

      {tab === "compose" ? <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={sending || !loaded || !loaded.configured || !to.length} onClick={() => void send()}><Send className="size-4" />{sending ? (attach ? "Preparing PDF and sending…" : "Sending…") : `Send${to.length + cc.length > 1 ? ` to ${to.length + cc.length}` : ""}`}</Button></DialogFooter> : null}
    </DialogContent>
  </Dialog>;
}
