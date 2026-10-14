"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Mail, RefreshCw, Send, Server } from "lucide-react";
import { finalDelivery, type DeliverySummary } from "@/lib/email-delivery";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Provider = "smtp" | "turbosmtp_api";
type SmtpForm = { provider: Provider; apiRegion: "global" | "eu"; host: string; port: string; secure: boolean; username: string; password: string; fromName: string; fromEmail: string; passwordConfigured: boolean };

const initialSmtp: SmtpForm = { provider: "smtp", apiRegion: "global", host: "smtp.gmail.com", port: "465", secure: true, username: "", password: "", fromName: "ComNet Accounting", fromEmail: "", passwordConfigured: false };
const presets = [
  { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: "465", secure: true },
  { label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: "587", secure: false },
  { label: "Zoho Mail", host: "smtp.zoho.com", port: "465", secure: true },
  { label: "turboSMTP", host: "pro.turbo-smtp.com", port: "465", secure: true },
];

export function SmtpSettings({ onStatus }: { onStatus?: (configured: boolean) => void }) {
  const [form, setForm] = useState<SmtpForm>(initialSmtp);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // The saved method and its login: the consumer key / SMTP username and the secret belong to one method only.
  const [saved, setSaved] = useState<{ provider: Provider; username: string; passwordConfigured: boolean }>({ provider: "smtp", username: "", passwordConfigured: false });
  const api = form.provider === "turbosmtp_api";
  // The last test email sent through the turboSMTP API and its delivery status from turboSMTP.
  const [testIds, setTestIds] = useState<string[]>([]);
  const [testDelivery, setTestDelivery] = useState<DeliverySummary | null>(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);

  async function checkTestDelivery(ids = testIds) {
    if (!ids.length) return;
    setCheckingDelivery(true);
    try {
      const response = await fetch("/api/email-settings/delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not get the delivery status.");
      setTestDelivery(data.delivery);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not get the delivery status.", { duration: 10_000 }); }
    finally { setCheckingDelivery(false); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/email-settings", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load email server settings");
      if (!active) return;
      setForm({ ...initialSmtp, ...data.settings, port: String(data.settings.port), password: "" });
      setSaved({ provider: data.settings.provider ?? "smtp", username: String(data.settings.username ?? ""), passwordConfigured: Boolean(data.settings.passwordConfigured) });
      setTestRecipient(String(data.testRecipient ?? ""));
      onStatus?.(Boolean(data.settings.passwordConfigured));
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load email server settings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onStatus]);

  function update(patch: Partial<SmtpForm>) { setForm((current) => ({ ...current, ...patch })); setDirty(true); }
  function chooseProvider(provider: Provider) {
    if (provider === form.provider) return;
    const same = provider === saved.provider;
    update({ provider, username: same ? saved.username : "", password: "", passwordConfigured: same && saved.passwordConfigured });
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/email-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, port: Number(form.port) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save email server settings");
      setForm((current) => ({ ...current, password: "", passwordConfigured: true }));
      setSaved({ provider: form.provider, username: form.username, passwordConfigured: true });
      setDirty(false);
      onStatus?.(true);
      toast.success("Email server settings saved securely");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save email server settings"); }
    finally { setSaving(false); }
  }

  // Send test email: a real message to the signed-in All-Admin, so sending limits and sender rules show up.
  async function sendTest() {
    setSendingTest(true);
    try {
      const response = await fetch("/api/email-settings/test-email", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The test email could not be sent");
      toast.success(`Test email sent to ${data.to}${data.signatureCompany ? ` with your ${data.signatureCompany} signature` : " (you have no email signature turned on)"} — check that inbox (and spam)`);
      // Why a signature logo may be missing: none set, sent inside the email (SMTP), or linked from the web (turboSMTP API).
      if (data.signatureImages === "no-logo") toast.warning("The signature has no logo: the company has no logo in Company setup.", { duration: 15_000 });
      else if (data.signatureImages === "inline") toast.info("The signature logo was sent inside the email.", { duration: 15_000 });
      else if (data.signatureImages === "linked") toast.warning("With the turboSMTP API the signature logo is linked from the web, and some mail apps hide web images until you allow them. To send the logo inside the email, choose SMTP server with the turboSMTP preset.", { duration: 30_000 });
      const ids = Array.isArray(data.messageIds) ? data.messageIds.map(String) : [];
      setTestIds(ids); setTestDelivery(null);
      // turboSMTP needs a few seconds to report on a new message.
      if (ids.length) window.setTimeout(() => void checkTestDelivery(ids), 8000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "The test email could not be sent", { duration: 15_000 }); }
    finally { setSendingTest(false); }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = await fetch("/api/email-settings", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "SMTP connection failed");
      toast.success("Connection successful — the email server accepted the saved login");
    } catch (error) { toast.error(error instanceof Error ? error.message : "SMTP connection failed"); }
    finally { setTesting(false); }
  }

  return <section className="min-w-0 rounded-2xl border bg-card text-card-foreground shadow-sm" aria-label="Email server">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5"><div className="flex gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300"><Server className="size-5" /></div><div><h2 className="text-lg font-semibold">Email server</h2><p className="mt-1 text-sm text-muted-foreground">Sends invitations, password resets, notifications and documents, through an SMTP server or the turboSMTP API. Shared by all companies.</p></div></div><Badge variant="secondary" className={form.passwordConfigured ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-800 dark:text-amber-300"}>{loading ? "Checking…" : form.passwordConfigured ? "Configured" : "Not configured"}</Badge></header>
    <form onSubmit={save} className="space-y-5 p-4 sm:p-5">
      <div role="radiogroup" aria-label="Sending method" className="grid gap-2 sm:grid-cols-2">{([["smtp", "SMTP server", "Gmail, Microsoft 365, Zoho, turboSMTP SMTP or any mail server"], ["turbosmtp_api", "turboSMTP API", "HTTPS sending with a turboSMTP consumer key and secret — no SMTP ports needed"]] as Array<[Provider, string, string]>).map(([value, label, detail]) => <button key={value} type="button" role="radio" aria-checked={form.provider === value} disabled={loading || saving} onClick={() => chooseProvider(value)} className={`rounded-xl border p-3 text-left transition-colors ${form.provider === value ? "border-primary bg-primary/10 ring-1 ring-primary" : "bg-background hover:bg-muted/60"}`}><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></button>)}</div>
      {!api && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Quick setup:</span>{presets.map((preset) => <Button key={preset.host} type="button" size="sm" variant={form.host === preset.host ? "secondary" : "outline"} disabled={loading} onClick={() => update({ host: preset.host, port: preset.port, secure: preset.secure })}>{preset.label}</Button>)}</div>}
      <fieldset disabled={loading || saving} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {api ? <div className="space-y-2 md:col-span-2 xl:col-span-4"><Label>Sending region</Label><Select value={form.apiRegion} onValueChange={(value) => update({ apiRegion: value === "eu" ? "eu" : "global" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">Global · api.turbo-smtp.com</SelectItem><SelectItem value="eu">EU · api.eu.turbo-smtp.com</SelectItem></SelectContent></Select></div> : <>
          <div className="space-y-2 xl:col-span-2"><Label htmlFor="smtp-host">SMTP host</Label><Input id="smtp-host" value={form.host} onChange={(event) => update({ host: event.target.value })} placeholder="smtp.gmail.com" required /></div>
          <div className="space-y-2"><Label htmlFor="smtp-port">Port</Label><Input id="smtp-port" type="number" min={1} max={65535} value={form.port} onChange={(event) => { const port = event.target.value; update({ port, ...(port === "465" ? { secure: true } : ["25", "587", "2525"].includes(port) ? { secure: false } : {}) }); }} required /></div>
          <div className="space-y-2"><Label>Security</Label><Select value={form.secure ? "tls" : "starttls"} onValueChange={(value) => update({ secure: value === "tls", port: value === "tls" ? "465" : "587" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tls">TLS · Port 465</SelectItem><SelectItem value="starttls">STARTTLS · Port 587</SelectItem></SelectContent></Select></div>
        </>}
        <div className="space-y-2 xl:col-span-2"><Label htmlFor="smtp-username">{api ? "Consumer key" : "SMTP username"}</Label><Input id="smtp-username" type="text" autoComplete={api ? "off" : "username"} value={form.username} onChange={(event) => update({ username: event.target.value, fromEmail: form.fromEmail || (!api && event.target.value.includes("@") ? event.target.value : "") })} placeholder={api ? "turboSMTP consumer key" : "accounts@company.com"} required /></div>
        <div className="space-y-2 xl:col-span-2"><Label htmlFor="smtp-password">{api ? "Consumer secret" : "SMTP password / app password"}</Label><div className="relative"><Input id="smtp-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(event) => update({ password: event.target.value })} placeholder={form.passwordConfigured ? "Saved — leave blank to keep it" : api ? "Enter consumer secret" : "Enter password"} className="pr-10" /><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
        <div className="space-y-2 xl:col-span-2"><Label htmlFor="smtp-from-name">Sender name</Label><Input id="smtp-from-name" value={form.fromName} onChange={(event) => update({ fromName: event.target.value })} required /></div>
        <div className="space-y-2 xl:col-span-2"><Label htmlFor="smtp-from-email">Sender email</Label><Input id="smtp-from-email" type="email" value={form.fromEmail} onChange={(event) => update({ fromEmail: event.target.value })} required /></div>
      </fieldset>
      {testIds.length > 0 && <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm"><span className="text-muted-foreground">Test email delivery:</span><span className={`font-medium ${testDelivery?.tone === "good" ? "text-emerald-700 dark:text-emerald-300" : testDelivery?.tone === "bad" ? "text-rose-600 dark:text-rose-400" : testDelivery?.tone === "waiting" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{checkingDelivery && !testDelivery ? "Asking turboSMTP…" : testDelivery?.label ?? "Waiting for turboSMTP's report…"}</span>{testDelivery?.checks.filter((entry) => entry.error).map((entry) => <span key={entry.id} className="basis-full break-words text-xs text-rose-600 dark:text-rose-400">{entry.error}</span>)}{!testDelivery || !finalDelivery(testDelivery.status) ? <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={checkingDelivery} onClick={() => void checkTestDelivery()}><RefreshCw className={`size-3 ${checkingDelivery ? "animate-spin" : ""}`} />Check delivery</Button> : null}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{dirty ? "Unsaved changes — save before testing." : `Test connection checks the saved login; Send test email sends a real email${testRecipient ? ` to ${testRecipient}` : " to you"}.`}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={loading || testing || dirty || !form.passwordConfigured} onClick={() => void testConnection()}><Mail className="size-4" />{testing ? "Testing…" : "Test connection"}</Button><Button type="button" variant="outline" disabled={loading || sendingTest || dirty || !form.passwordConfigured} onClick={() => void sendTest()}><Send className="size-4" />{sendingTest ? "Sending…" : "Send test email"}</Button><Button type="submit" disabled={loading || saving}><Send className="size-4" />{saving ? "Saving…" : "Save email settings"}</Button></div></div>
      {api ? <p className="text-xs leading-5 text-muted-foreground">In the turboSMTP dashboard create an API consumer key (Settings → API Keys) and copy the consumer key and its secret here — the secret is shown only once. The sender email must be a verified sender in turboSMTP. Choose EU only if your turboSMTP account sends from the EU infrastructure. The saved secret is encrypted and never shown again.</p> : <p className="text-xs leading-5 text-muted-foreground">For Gmail, enable two-step verification and use a Google app password—not your normal Gmail password. For turboSMTP, use host pro.turbo-smtp.com with port 465 (TLS), or 587 or 2525 (STARTTLS); the username is your turboSMTP account email or API consumer key, the password its password or consumer secret, and the sender email must be a verified sender in turboSMTP. The saved secret is encrypted and never shown again.</p>}
    </form>
  </section>;
}
