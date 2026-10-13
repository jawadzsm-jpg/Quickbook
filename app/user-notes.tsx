"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, NotebookPen, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

type Note = { id: number; body: string; done: boolean; createdAt: string; updatedAt: string };

// Database timestamps can arrive as "2026-10-13 19:04:01.2+04"; normalise them so every browser parses them.
const parseTime = (value: string) => new Date(String(value).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
const when = (value: string) => { const date = parseTime(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }); };

/** My notes on Company Home: the signed-in user's private notes for the selected company. */
export function UserNotes({ companyId }: { companyId: number }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>) => {
    const response = await fetch(method === "GET" ? `/api/user-notes?companyId=${companyId}` : "/api/user-notes", method === "GET" ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not update your notes.");
    setNotes(Array.isArray(data.notes) ? data.notes : []);
  }, [companyId]);
  // The notes are set when the request finishes, not synchronously in the effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (companyId) call("GET").catch(() => setNotes([])); }, [call, companyId]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update your notes."); }
    finally { setBusy(false); }
  };
  const add = (event: FormEvent) => { event.preventDefault(); if (!draft.trim()) return; void run(async () => { await call("POST", { body: draft }); setDraft(""); }); };
  const saveEdit = (event: FormEvent) => { event.preventDefault(); if (!editing) return; void run(async () => { await call("PATCH", { id: editing.id, action: "update", body: editing.body }); setEditing(null); }); };

  const open = notes?.filter((note) => !note.done).length ?? 0;
  return <section aria-label="My notes" className="rounded-2xl border bg-card p-4 text-card-foreground shadow-sm">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 font-semibold"><NotebookPen className="size-4 text-amber-600" />My notes</p>
      <span className="text-xs text-muted-foreground">Only you see these · {notes ? `${open} open` : "…"}</span>
    </div>
    <form onSubmit={add} className="flex gap-2">
      <Textarea aria-label="New note" value={draft} maxLength={1000} rows={1} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Write a note… (Enter to add, Shift+Enter for a new line)" className="min-h-10 flex-1 resize-y" />
      <Button type="submit" disabled={busy || !draft.trim()} className="shrink-0 self-start"><Plus className="size-4" />Add</Button>
    </form>
    {notes === null ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : !notes.length ? <p className="mt-3 text-sm text-muted-foreground">No notes yet. Notes are private and kept for this company.</p> : <ul className="mt-3 divide-y rounded-lg border">{notes.map((note) => <li key={note.id} className="flex items-start gap-3 px-3 py-2">
      <Checkbox className="mt-1" checked={note.done} disabled={busy} aria-label={note.done ? "Mark as not done" : "Mark as done"} onCheckedChange={(checked) => void run(() => call("PATCH", { id: note.id, action: "update", done: checked === true }))} />
      {editing?.id === note.id ? <form onSubmit={saveEdit} className="flex min-w-0 flex-1 gap-2">
        <Textarea aria-label="Edit note" value={editing.body} maxLength={1000} rows={2} autoFocus onChange={(event) => setEditing({ ...editing, body: event.target.value })} className="min-h-10 flex-1 resize-y" />
        <div className="flex shrink-0 flex-col gap-1"><Button type="submit" size="icon" variant="ghost" className="size-8" disabled={busy || !editing.body.trim()} aria-label="Save note"><Check className="size-4" /></Button><Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setEditing(null)} aria-label="Cancel editing"><X className="size-4" /></Button></div>
      </form> : <div className="min-w-0 flex-1">
        <p className={`whitespace-pre-line break-words text-sm ${note.done ? "text-muted-foreground line-through" : ""}`}>{note.body}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{when(note.updatedAt)}</p>
      </div>}
      {editing?.id !== note.id && <div className="flex shrink-0 [&_button]:size-8">
        <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Edit note" title="Edit" onClick={() => setEditing({ id: note.id, body: note.body })}><Pencil className="size-3.5" /></Button>
        <Button type="button" size="icon" variant="ghost" className="text-destructive" disabled={busy} aria-label="Delete note" title="Delete" onClick={() => { if (window.confirm("Delete this note?")) void run(() => call("PATCH", { id: note.id, action: "delete" })); }}><Trash2 className="size-3.5" /></Button>
      </div>}
    </li>)}</ul>}
  </section>;
}
