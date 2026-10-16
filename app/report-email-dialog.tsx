"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Mail, PenLine, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressField } from "./document-email-dialog";
import { EmailSignatureEditor } from "./email-signature-editor";
import { defaultReportEmail, MAX_ATTACHMENT_BYTES } from "@/lib/email-templates";

type Loaded = { configured: boolean; signatureOn: boolean; suggestions: { contact: string[]; previous: string[] }; sender: { name: string; email: string } };

/**
 * Email any Report Center report as its A4 PDF (the same file as Export → PDF, with the stamp and orientation chosen).
 * Add any number of To and Cc addresses, check the wording and send; replies go to the sender. No history is kept:
 * only the addresses, suggested next time.
 */
export function ReportEmailDialog({ open, onOpenChange, companyId, companyName, title, period, makePdf }: {
  open: boolean; onOpenChange: (open: boolean) => void; companyId: number; companyName: string; title: string; period?: string;
  makePdf: () => Promise<{ blob: Blob; fileName: string }>;
}) {
  const [tab, setTab] = useState<"compose" | "signature">("compose");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/report-emails?companyId=${companyId}&title=${encodeURIComponent(title)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the email details.");
    setLoaded(data);
    return data as Loaded;
  }, [companyId, title]);

  // Opening: load earlier addresses, and start with the standard wording for this report.
  useEffect(() => {
    if (!open) return;
    let active = true;
    // The loader sets state only after its request finishes, not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then((data) => {
      if (!active) return;
      setTo([]); setCc([]); setShowCc(false); setTab("compose");
      const wording = defaultReportEmail({ title, period, company: companyName, sender: data.sender.name, signatureOn: data.signatureOn });
      setSubject(wording.subject); setBody(wording.body);
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not open the email."); });
    return () => { active = false; };
    // Load once per opening; later value changes must not overwrite what the person typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title]);

  const send = async () => {
    if (!to.length) return toast.error("Add at least one email address in To.");
    if (!subject.trim() || !body.trim()) return toast.error("Write a subject and a message.");
    setSending(true);
    try {
      const pdf = await makePdf();
      if (pdf.blob.size > MAX_ATTACHMENT_BYTES) throw new Error("The report PDF is larger than 4 MB. Narrow the filters or period and try again.");
      const form = new FormData();
      form.set("companyId", String(companyId)); form.set("title", title);
      form.set("to", to.join(",")); form.set("cc", cc.join(",")); form.set("subject", subject); form.set("body", body);
      form.set("pdf", pdf.blob, pdf.fileName);
      const response = await fetch("/api/report-emails", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The email could not be sent.");
      toast.success(`Emailed ${title} to ${data.recipients} ${data.recipients === 1 ? "address" : "addresses"}`);
      onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "The email could not be sent.", { duration: 15_000 }); }
    finally { setSending(false); }
  };

  const tabs = [{ key: "compose", label: "Compose", icon: Mail }, { key: "signature", label: "Signature", icon: PenLine }] as const;
  return <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="size-5 text-sky-600" />Email {title}</DialogTitle><DialogDescription>{period ? `${period} · ` : ""}Sent as the A4 PDF, as exported</DialogDescription></DialogHeader>
      <div role="tablist" aria-label="Email" className="flex gap-1 border-b">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-sky-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" />{label}</button>)}</div>
      {loaded && !loaded.configured ? <div role="alert" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><TriangleAlert className="mt-0.5 size-4 shrink-0" />Emails are not set up yet. An All-Admin can set the email server (turboSMTP or another) in Admin Controls → Email server.</div> : null}

      {tab === "compose" ? <div className="space-y-4">
        <AddressField id="report-email-to" label="To" addresses={to} onChange={setTo} placeholder="name@company.com — paste several at once" suggestions={[{ label: "Used before", addresses: loaded?.suggestions.previous ?? [] }]} />
        {showCc ? <AddressField id="report-email-cc" label="Cc" addresses={cc} onChange={setCc} placeholder="Copy to…" /> : <button type="button" className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => setShowCc(true)}>+ Add Cc</button>}
        <div className="space-y-1.5"><Label htmlFor="report-email-subject">Subject</Label><Input id="report-email-subject" value={subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="report-email-body">Message</Label><Textarea id="report-email-body" rows={9} value={body} onChange={(event) => setBody(event.target.value)} /><p className="text-xs text-muted-foreground">Replies go to {loaded?.sender.email || "you"}. Your signature is added under the message when it is turned on — <button type="button" className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300" onClick={() => setTab("signature")}>edit signature</button>.</p></div>
        <p className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm"><FileText className="size-4 shrink-0 text-rose-600" /><span>The report is attached as an A4 PDF <span className="text-muted-foreground">(current filters, orientation and stamp)</span></span></p>
      </div> : null}

      {tab === "signature" ? <EmailSignatureEditor companyId={companyId} onSaved={(signatureOn) => setLoaded((current) => current ? { ...current, signatureOn } : current)} /> : null}

      {tab === "compose" ? <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={sending || !loaded || !loaded.configured || !to.length} onClick={() => void send()}><Send className="size-4" />{sending ? "Preparing PDF and sending…" : `Send${to.length + cc.length > 1 ? ` to ${to.length + cc.length}` : ""}`}</Button></DialogFooter> : null}
    </DialogContent>
  </Dialog>;
}
