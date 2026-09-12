"use client";

import { useEffect, useRef, useState } from "react";
import type { LockInput } from "@/lib/sku-locks";

/** Each editor owns one lease; changing selection retains its existing SKU reservations. */
export function useSkuLock(input: LockInput | null) {
  const [token] = useState(() => crypto.randomUUID());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(true);
  const signature = input ? JSON.stringify(input) : "";
  const [state, setState] = useState({ signature: "", ready: false, error: "" });
  const release = () => fetch("/api/sku-locks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), keepalive: true, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  useEffect(() => {
    alive.current = true;
    const leave = () => { alive.current = false; queue.current = queue.current.then(() => fetch("/api/sku-locks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), keepalive: true, signal: AbortSignal.timeout(10_000) }).catch(() => undefined)); };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); leave(); };
  }, [token]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const claim = async (renew: boolean) => {
      if (stopped || !alive.current) return;
      if (!renew) setState({ signature, ready: false, error: "" });
      try {
        const response = await fetch("/api/sku-locks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, input: JSON.parse(signature), renew }), signal: AbortSignal.timeout(10_000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not reserve the selected SKU.");
        if (!stopped && alive.current) {
          setState({ signature, ready: true, error: "" });
          timer = setTimeout(() => { queue.current = queue.current.then(() => claim(true)); }, 30_000);
        }
      } catch (error) {
        if (!stopped && alive.current) setState({ signature, ready: false, error: error instanceof Error ? error.message : "Reservation lost. Close and reopen this form." });
      }
    };
    queue.current = queue.current.then(async () => {
      if (stopped) return;
      if (signature) await claim(false);
      else { await release(); if (!stopped) setState({ signature: "", ready: false, error: "" }); }
    });
    return () => { stopped = true; clearTimeout(timer); };
    // release depends only on this editor's stable token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, token]);
  const ready = !signature || (state.signature === signature && state.ready);
  const headers: Record<string, string> = signature ? { "X-SKU-Lock": token } : {};
  return {
    ready, headers,
    blocked: Boolean(signature && state.signature === signature && state.error),
    message: !signature || ready ? "" : state.signature === signature && state.error ? state.error : "Checking SKU availability in this inventory…",
  };
}
export function SkuLockNotice({ message }: { message: string }) {
  return message ? <p role="status" className="my-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p> : null;
}
