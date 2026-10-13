"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IDLE_NOTICE_KEY, idleTimeoutLabel } from "@/lib/idle-timeout";

// Automatic sign-out after inactivity. Keyboard, mouse, touch and scrolling count as activity; background refreshes do
// not. Open tabs share the last activity time, so working in one tab keeps the others signed in. A countdown shows for
// the final minute. The server applies the same limit (`lib/auth.ts`), so a sleeping computer cannot keep a session.
const ACTIVITY_KEY = "comnet_last_activity";
const WARNING_MS = 60_000;
const PING_MS = 60_000;
const SHARE_MS = 5_000;
const activityEvents = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

function sharedActivity() {
  try { return Number(window.localStorage.getItem(ACTIVITY_KEY)) || 0; } catch { return 0; }
}

export function IdleSignOut({ minutes: initialMinutes }: { minutes: number }) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [remaining, setRemaining] = useState<number | null>(null);
  const minutesRef = useRef(initialMinutes);
  const lastActivity = useRef(0);
  const lastPing = useRef(0);
  const lastShare = useRef(0);
  const signingOut = useRef(false);

  const signOut = useCallback(async (notice = "") => {
    if (signingOut.current) return;
    signingOut.current = true;
    try { if (notice) window.sessionStorage.setItem(IDLE_NOTICE_KEY, notice); } catch { /* Storage may be disabled. */ }
    try { await fetch("/api/auth/session", { method: "DELETE" }); } catch { /* The page reload shows the sign-in screen either way. */ }
    window.location.reload();
  }, []);

  const idleNotice = useCallback(() => `You were signed out after ${idleTimeoutLabel(minutesRef.current)} without activity. Sign in again to continue.`, []);

  const ping = useCallback(async () => {
    lastPing.current = Date.now();
    try {
      const response = await fetch("/api/auth/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
      if (response.status === 401) return void signOut("Your session has ended. Sign in again to continue.");
      if (!response.ok) return;
      const data = await response.json() as { idleTimeoutMinutes?: unknown };
      if (typeof data.idleTimeoutMinutes === "number") { minutesRef.current = data.idleTimeoutMinutes; setMinutes(data.idleTimeoutMinutes); }
    } catch { /* Offline: the next activity tries again. */ }
  }, [signOut]);

  const recordActivity = useCallback((force = false) => {
    if (signingOut.current) return;
    const now = Date.now();
    // Activity after the limit (for example on waking a sleeping computer) does not revive the session.
    const limit = minutesRef.current * 60_000;
    if (limit > 0 && lastActivity.current && now - Math.max(lastActivity.current, sharedActivity()) >= limit) return void signOut(idleNotice());
    lastActivity.current = now;
    setRemaining(null);
    if (force || now - lastShare.current >= SHARE_MS) {
      lastShare.current = now;
      try { window.localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* Storage may be disabled. */ }
    }
    if (force || now - lastPing.current >= PING_MS) void ping();
  }, [idleNotice, ping, signOut]);

  useEffect(() => {
    const now = Date.now();
    lastActivity.current = now;
    lastPing.current = now;
    lastShare.current = now;
    try { window.localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* Storage may be disabled. */ }
    const onActivity = () => recordActivity();
    for (const event of activityEvents) window.addEventListener(event, onActivity, { capture: true, passive: true });
    return () => { for (const event of activityEvents) window.removeEventListener(event, onActivity, { capture: true }); };
  }, [recordActivity]);

  useEffect(() => {
    minutesRef.current = minutes;
    if (!minutes) return;
    const limit = minutes * 60_000;
    const tick = () => {
      if (signingOut.current) return;
      lastActivity.current = Math.max(lastActivity.current, sharedActivity());
      const left = lastActivity.current + limit - Date.now();
      if (left <= 0) void signOut(idleNotice());
      else setRemaining(left <= WARNING_MS ? left : null);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [minutes, idleNotice, signOut]);

  if (remaining === null || !minutes) return null;
  const seconds = Math.ceil(remaining / 1000);
  return <div role="alertdialog" aria-labelledby="idle-sign-out-title" aria-describedby="idle-sign-out-text" className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-md rounded-2xl border border-amber-500/40 bg-card p-4 text-card-foreground shadow-2xl">
    <p id="idle-sign-out-title" className="flex items-center gap-2 font-semibold"><TimerReset className="size-4 text-amber-600" />Are you still there?</p>
    <p id="idle-sign-out-text" className="mt-1 text-sm text-muted-foreground">You will be signed out for inactivity in <span className="font-mono font-semibold text-foreground" aria-live="polite">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>.</p>
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}><LogOut className="size-4" />Sign out</Button>
      <Button type="button" size="sm" autoFocus onClick={() => recordActivity(true)}>Stay signed in</Button>
    </div>
  </div>;
}
