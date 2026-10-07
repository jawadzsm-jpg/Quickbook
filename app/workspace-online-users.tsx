"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Globe2, LoaderCircle, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type OnlineUser = { id: number; fullName: string; email: string; avatarData: string; ipAddress: string; lastSeenAt: string };

/** Last activity as date and time on one line, in UAE time, e.g. "07 Oct 2026, 4:05 PM". */
function lastSeenLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export function WorkspaceOnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/online-users", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { users?: OnlineUser[] };
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 45_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [refresh]);

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void refresh(); }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon" aria-label={`Online users${users.length ? ` (${users.length})` : ""}`} title="Online users" className="relative">
        <UsersRound className="size-4" />
        {users.length > 0 ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid min-w-3.5 place-items-center rounded-full bg-emerald-400 px-1 text-[9px] font-bold leading-3.5 text-slate-950">{users.length > 9 ? "9+" : users.length}</span> : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div><p className="font-semibold">Online Users</p><p className="text-xs text-muted-foreground">Active in the last 2 minutes</p></div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><span className="size-2 rounded-full bg-emerald-500" />{users.length} online</span>
      </div>
      <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
        {loading && users.length === 0 ? <div className="grid min-h-28 place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /></div> : users.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">No users are currently online.</div> : users.map((user) => {
          const displayName = user.fullName || user.email;
          return <div key={user.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            {user.avatarData ? <Image src={user.avatarData} alt={`${displayName} profile`} width={48} height={48} unoptimized className="size-12 shrink-0 rounded-full border object-cover" /> : <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/12 font-semibold text-primary">{displayName.slice(0, 2).toUpperCase()}</div>}
            <div className="min-w-0 flex-1"><p className="truncate font-medium text-foreground">{displayName}</p><p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">{user.ipAddress ? <><Globe2 className="size-3.5 shrink-0" /><span className="truncate font-mono text-xs">{user.ipAddress}</span><span aria-hidden="true">·</span></> : null}<span className="shrink-0 whitespace-nowrap text-xs">{lastSeenLabel(user.lastSeenAt)}</span></p></div>
          </div>;
        })}
      </div>
    </PopoverContent>
  </Popover>;
}
