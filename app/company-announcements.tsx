"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Active = { id: number; title: string; body: string; createdByName: string; createdAt: string; endsAt: string | null };
type Managed = { id: number; title: string; body: string; audience: "all" | "users"; userIds: number[]; createdByName: string; createdAt: string; endsAt: string | null; removedAt: string | null; seenBy: number };
type CompanyUser = { id: number; fullName: string; email: string; role: string };
type Draft = { id: number | null; title: string; body: string; audience: "all" | "users"; userIds: number[]; endsAt: string };

// Database timestamps can arrive as "2026-10-13 19:04:01.2+04"; normalise them so every browser parses them.
const parseTime = (value: string | null) => new Date(String(value ?? "").replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
const when = (value: string | null) => {
  if (!value) return "";
  const date = parseTime(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};
const emptyDraft: Draft = { id: null, title: "", body: "", audience: "all", userIds: [], endsAt: "" };
const status = (item: Managed) => item.removedAt ? "Removed" : item.endsAt && parseTime(item.endsAt).getTime() <= Date.now() ? "Ended" : "Showing";

async function send(method: "POST" | "PATCH", body: Record<string, unknown>) {
  const response = await fetch("/api/announcements", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not update announcements.");
  return data;
}

/**
 * Announcements page (sidebar → Overview): banners for the signed-in user (until "Got it"), and for administrators a window to post
 * an announcement to all users of the company or chosen users, edit it, end it or remove it.
 */
export function CompanyAnnouncements({ companyId, canManage, standalone = false }: { companyId: number; canManage: boolean; standalone?: boolean }) {
  const [active, setActive] = useState<Active[]>([]);
  const [managed, setManaged] = useState<Managed[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (manage = false) => {
    if (!companyId) return;
    const response = await fetch(`/api/announcements?companyId=${companyId}${manage ? "&manage=1" : ""}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setActive(Array.isArray(data.active) ? data.active : []);
    if (manage) { setManaged(Array.isArray(data.managed) ? data.managed : []); setUsers(Array.isArray(data.users) ? data.users : []); }
  }, [companyId]);
  // The list is set when the request finishes, not synchronously in the effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const dismiss = async (id: number) => {
    setActive((current) => current.filter((item) => item.id !== id));
    try { await send("PATCH", { companyId, id, action: "dismiss" }); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not hide the announcement."); void load(); }
  };
  const openManager = (startNew = false) => { setOpen(true); setDraft(startNew ? { ...emptyDraft } : null); void load(true); };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (draft.audience === "users" && !draft.userIds.length) return toast.error("Choose at least one user.");
    setBusy(true);
    try {
      const fields = { companyId, title: draft.title, body: draft.body, endsAt: draft.endsAt ? new Date(`${draft.endsAt}T23:59:00+04:00`).toISOString() : "" };
      if (draft.id) { await send("PATCH", { ...fields, id: draft.id, action: "update" }); toast.success("Announcement updated"); }
      else { const data = await send("POST", { ...fields, audience: draft.audience, userIds: draft.userIds }); toast.success(`Announcement posted to ${data.recipients} ${data.recipients === 1 ? "user" : "users"}`); }
      setDraft(null);
      await load(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the announcement."); }
    finally { setBusy(false); }
  };
  const remove = async (item: Managed) => {
    if (!window.confirm(`Remove "${item.title}"? It disappears from the Announcements page and the bell for everyone.`)) return;
    setBusy(true);
    try { await send("PATCH", { companyId, id: item.id, action: "remove" }); toast.success("Announcement removed"); await load(true); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove the announcement."); }
    finally { setBusy(false); }
  };

  if (!active.length && !canManage && !standalone) return null;
  return <section aria-label="Announcements" className="space-y-2">
    {standalone && !active.length ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No announcements right now. New ones also appear in the notifications bell.</p> : null}
    {active.map((item) => <article key={item.id} className="flex gap-3 rounded-2xl border border-sky-300/60 bg-sky-50 p-4 text-sky-950 shadow-sm dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-50">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300"><Megaphone className="size-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.title}</p>
        {item.body ? <p className="mt-1 whitespace-pre-line break-words text-sm">{item.body}</p> : null}
        <p className="mt-1.5 text-xs opacity-75">{item.createdByName ? `From ${item.createdByName} · ` : ""}{when(item.createdAt)}{item.endsAt ? ` · until ${when(item.endsAt)}` : ""}</p>
      </div>
      <Button type="button" size="sm" variant="outline" className="shrink-0 self-start bg-white/70 dark:bg-transparent" onClick={() => void dismiss(item.id)}>Got it</Button>
    </article>)}
    {canManage && <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => openManager(false)}><Megaphone className="size-4" />Announcements</Button>
      <Button type="button" size="sm" onClick={() => openManager(true)}><Plus className="size-4" />New announcement</Button>
    </div>}

    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setDraft(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Announcements</DialogTitle><DialogDescription>Shown on the Announcements page until each person presses Got it, and in the notifications bell.</DialogDescription></DialogHeader>
        {draft ? <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="announcement-title">Title</Label><Input id="announcement-title" value={draft.title} maxLength={120} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Office closed on Sunday" /></div>
          <div className="space-y-2"><Label htmlFor="announcement-body">Message</Label><Textarea id="announcement-body" value={draft.body} maxLength={2000} rows={4} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Write the details everyone needs to know." /></div>
          {draft.id === null && <fieldset className="space-y-2"><legend className="text-sm font-medium">Send to</legend>
            <div className="flex flex-wrap gap-2">{([["all", "All users of this company"], ["users", "Choose users"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={draft.audience === value} onClick={() => setDraft({ ...draft, audience: value })} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${draft.audience === value ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>{label}</button>)}</div>
            {draft.audience === "users" && <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">{users.map((entry) => <label key={entry.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"><Checkbox checked={draft.userIds.includes(entry.id)} onCheckedChange={(checked) => setDraft({ ...draft, userIds: checked === true ? [...draft.userIds, entry.id] : draft.userIds.filter((id) => id !== entry.id) })} /><span className="truncate">{entry.fullName || entry.email}</span></label>)}</div>}
          </fieldset>}
          <div className="space-y-2"><Label htmlFor="announcement-ends">Show until (optional)</Label><Input id="announcement-ends" type="date" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} className="w-48" /><p className="text-xs text-muted-foreground">Leave empty to show it until each person presses Got it.</p></div>
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Post announcement"}</Button></DialogFooter>
        </form> : <div className="space-y-3">
          <div className="flex justify-end"><Button type="button" size="sm" onClick={() => setDraft({ ...emptyDraft })}><Plus className="size-4" />New announcement</Button></div>
          {!managed.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No announcements yet.</p> : <ul className="divide-y rounded-lg border">{managed.map((item) => <li key={item.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1 basis-60">
              <p className="flex flex-wrap items-center gap-2 font-medium">{item.title}<Badge variant="secondary" className={status(item) === "Showing" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}>{status(item)}</Badge></p>
              {item.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{item.audience === "all" ? "All users" : `${item.userIds.length} chosen ${item.userIds.length === 1 ? "user" : "users"}`} · seen by {item.seenBy} · {when(item.createdAt)}{item.endsAt ? ` · until ${when(item.endsAt)}` : ""}</p>
            </div>
            {!item.removedAt && <div className="flex shrink-0 gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setDraft({ id: item.id, title: item.title, body: item.body, audience: item.audience, userIds: item.userIds, endsAt: item.endsAt ? parseTime(item.endsAt).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }) : "" })}><Pencil className="size-4" />Edit</Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void remove(item)}><Trash2 className="size-4" />Remove</Button>
            </div>}
          </li>)}</ul>}
          <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => setOpen(false)}><X className="size-4" />Close</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}
