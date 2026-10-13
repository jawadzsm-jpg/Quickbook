"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = { enabled: boolean; enabledAt: string | null; backupCodesLeft: number };
type Setup = { secret: string; qrCode: string; otpauthUri: string };

async function call(body: Record<string, unknown>) {
  const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not update two-step sign-in.");
  return data;
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(`EasyBook backup codes (each works once)\n${codes.join("\n")}`); toast.success("Backup codes copied"); }
    catch { toast.error("Could not copy. Write the codes down instead."); }
  };
  return <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
    <p className="text-sm font-semibold">Save your backup codes now</p>
    <p className="text-xs text-muted-foreground">Each code signs you in once if you lose your phone. They are not shown again.</p>
    <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm">{codes.map((code) => <li key={code} className="rounded bg-background px-2 py-1 text-center">{code}</li>)}</ul>
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void copy()}><Copy className="size-4" />Copy</Button><Button type="button" size="sm" onClick={onDone}>I saved them</Button></div>
  </div>;
}

/** Two-step sign-in with an authenticator app: turn on (QR code + first code), new backup codes, turn off. */
export function TwoStepSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/auth/mfa", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load two-step sign-in.");
    setStatus(data);
  }, []);
  // The status is set when the request finishes, not synchronously in the effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch((error) => toast.error(error instanceof Error ? error.message : "Could not load two-step sign-in.")); }, [load]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update two-step sign-in."); }
    finally { setBusy(false); }
  };
  const start = () => run(async () => { setSetup(await call({ action: "start" })); setCode(""); });
  const enable = (event: FormEvent) => { event.preventDefault(); void run(async () => { const data = await call({ action: "enable", code }); setSetup(null); setCode(""); setCodes(data.backupCodes); toast.success("Two-step sign-in is on"); await load(); }); };
  const newCodes = (event: FormEvent) => { event.preventDefault(); void run(async () => { const data = await call({ action: "backup-codes", code }); setCode(""); setCodes(data.backupCodes); await load(); }); };
  const disable = (event: FormEvent) => { event.preventDefault(); void run(async () => { await call({ action: "disable", code, password }); setCode(""); setPassword(""); setDisabling(false); toast.success("Two-step sign-in is off"); await load(); }); };

  if (!status) return <p role="status" className="text-sm text-muted-foreground">Loading…</p>;
  if (codes) return <BackupCodes codes={codes} onDone={() => setCodes(null)} />;

  if (!status.enabled) {
    if (!setup) return <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm"><ShieldOff className="size-4 text-muted-foreground" />Two-step sign-in is <Badge variant="secondary">Off</Badge></p>
      <p className="text-sm text-muted-foreground">Add a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) to your password. Someone who learns your password still cannot sign in without your phone.</p>
      <Button type="button" disabled={busy} onClick={() => void start()}><ShieldCheck className="size-4" />{busy ? "Starting…" : "Turn on two-step sign-in"}</Button>
    </div>;
    return <form onSubmit={enable} className="space-y-3">
      <p className="text-sm">1. Scan this QR code with your authenticator app.</p>
      <div className="flex flex-wrap items-center gap-4"><Image src={setup.qrCode} alt="QR code for your authenticator app" width={176} height={176} unoptimized className="size-44 rounded-lg border bg-white p-2" /><div className="min-w-0 flex-1 basis-40 space-y-1"><p className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key in the app:</p><p className="break-all rounded bg-muted px-2 py-1 font-mono text-sm">{setup.secret}</p></div></div>
      <div className="space-y-2"><Label htmlFor="mfa-enable-code">2. Enter the 6-digit code the app shows</Label><Input id="mfa-enable-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} required className="font-mono tracking-[0.3em]" /></div>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setSetup(null)}>Cancel</Button><Button type="submit" disabled={busy || code.replace(/\s/g, "").length !== 6}>{busy ? "Checking…" : "Turn on"}</Button></div>
    </form>;
  }

  return <div className="space-y-4">
    <p className="flex flex-wrap items-center gap-2 text-sm"><ShieldCheck className="size-4 text-emerald-600" />Two-step sign-in is <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">On</Badge><span className="text-muted-foreground">· {status.backupCodesLeft} backup {status.backupCodesLeft === 1 ? "code" : "codes"} left</span></p>
    {!disabling ? <form onSubmit={newCodes} className="space-y-2 rounded-lg border p-3">
      <Label htmlFor="mfa-codes-code">New backup codes</Label>
      <p className="text-xs text-muted-foreground">Replaces your old backup codes. Enter a current authenticator code to confirm.</p>
      <div className="flex gap-2"><Input id="mfa-codes-code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={11} value={code} onChange={(event) => setCode(event.target.value)} required className="font-mono" /><Button type="submit" variant="outline" disabled={busy}>Get new codes</Button></div>
    </form> : null}
    {disabling ? <form onSubmit={disable} className="space-y-3 rounded-lg border border-destructive/40 p-3">
      <p className="text-sm font-medium">Turn off two-step sign-in</p>
      <div className="space-y-2"><Label htmlFor="mfa-off-password">Password</Label><Input id="mfa-off-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor="mfa-off-code">Authenticator or backup code</Label><Input id="mfa-off-code" autoComplete="one-time-code" maxLength={11} value={code} onChange={(event) => setCode(event.target.value)} required className="font-mono" /></div>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setDisabling(false); setCode(""); setPassword(""); }}>Cancel</Button><Button type="submit" variant="destructive" disabled={busy}>{busy ? "Turning off…" : "Turn off"}</Button></div>
    </form> : <Button type="button" variant="ghost" className="text-destructive" onClick={() => { setDisabling(true); setCode(""); }}><ShieldOff className="size-4" />Turn off two-step sign-in</Button>}
  </div>;
}
