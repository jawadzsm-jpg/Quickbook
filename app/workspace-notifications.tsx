"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, LoaderCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Notice = { id: number; companyId: number; companyName: string; kind: string; title: string; body: string; transactionId: number | null; createdAt: string; readAt: string | null };

/** "12 Oct, 4:05 PM" in UAE time. */
function noticeTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Notifications bell: cheque notices (and later reminders) for administrators and accountants. Opening a notice marks
 * it read and opens its document; email copies can be turned off here.
 */
export function WorkspaceNotifications({ onOpenDocument }: { onOpenDocument?: (transactionId: number, companyId: number) => void }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { notifications?: Notice[]; unread?: number; emailEnabled?: boolean };
      setNotices(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(Number(data.unread) || 0);
      setEmailEnabled(data.emailEnabled !== false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [refresh]);

  const update = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not update notifications.");
  };
  const markRead = async (ids: number[] | "all") => {
    try {
      await update(ids === "all" ? { all: true } : { ids });
      const now = new Date().toISOString();
      setNotices((current) => current.map((notice) => ids === "all" || ids.includes(notice.id) ? { ...notice, readAt: notice.readAt ?? now } : notice));
      setUnread((count) => ids === "all" ? 0 : Math.max(0, count - notices.filter((notice) => ids.includes(notice.id) && !notice.readAt).length));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update notifications."); }
  };
  const toggleEmail = async (enabled: boolean) => {
    setEmailEnabled(enabled);
    try { await update({ emailEnabled: enabled }); toast.success(enabled ? "Notification emails turned on" : "Notification emails turned off"); }
    catch (error) { setEmailEnabled(!enabled); toast.error(error instanceof Error ? error.message : "Could not save the email setting."); }
  };
  const openNotice = (notice: Notice) => {
    if (!notice.readAt) void markRead([notice.id]);
    if (notice.transactionId && onOpenDocument) { setOpen(false); onOpenDocument(notice.transactionId, notice.companyId); }
  };

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void refresh(); }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} title="Notifications" className="relative">
        <Bell className="size-4" />
        {unread > 0 ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid min-w-3.5 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-3.5 text-white">{unread > 9 ? "9+" : unread}</span> : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div><p className="font-semibold">Notifications</p><p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "All caught up"}</p></div>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" disabled={!unread} onClick={() => void markRead("all")}><CheckCheck className="size-3.5" />Mark all read</Button>
      </div>
      <div className="max-h-[min(28rem,65vh)] overflow-y-auto">
        {loading && !notices.length ? <div className="grid min-h-28 place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /></div>
          : !notices.length ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet. Cheques written in your companies appear here.</div>
            : notices.map((notice) => <button key={notice.id} type="button" onClick={() => openNotice(notice)} className={`flex w-full gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/60 ${notice.readAt ? "" : "bg-primary/5"}`}>
              <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${notice.readAt ? "bg-transparent" : "bg-primary"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${notice.readAt ? "font-medium" : "font-semibold"}`}>{notice.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{notice.body}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{notice.companyName} · {noticeTime(notice.createdAt)}</span>
              </span>
            </button>)}
      </div>
      <label className="flex cursor-pointer items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground"><Checkbox checked={emailEnabled} onCheckedChange={(checked) => void toggleEmail(checked === true)} /><Mail className="size-3.5" />Also email me these notifications</label>
    </PopoverContent>
  </Popover>;
}
