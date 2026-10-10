"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_LOCK_PIN_HEADER, PERIOD_LOCKED } from "@/lib/period-lock-shared";

type Prompt = { message: string; wrongPin: boolean; resolve: (pin: string | null) => void };

// A save, edit or delete dated in a filed VAT or corporate tax period is refused with PERIOD_LOCKED. This wraps fetch
// once for the whole app: it asks for the Admin PIN and repeats the same request with it, so every screen gets the
// prompt. Cancelling returns the refusal unchanged, and the screen shows its usual error.
export function PeriodLockPinPrompt() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [pin, setPin] = useState("");
  const promptRef = useRef<Prompt | null>(null);

  useEffect(() => {
    const original = window.fetch;
    const ask = (message: string, wrongPin: boolean) => new Promise<string | null>((resolve) => {
      const next = { message, wrongPin, resolve };
      promptRef.current = next;
      setPin("");
      setPrompt(next);
    });
    window.fetch = async (input, init) => {
      const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "GET" || method === "HEAD") return original(input, init);
      const replay = input instanceof Request ? input.clone() : null;
      let response = await original(input, init);
      let message = "This date is in a filed period.";
      while (response.status === 423) {
        const data = await response.clone().json().catch(() => null) as { code?: string; error?: string; pinConfigured?: boolean; wrongPin?: boolean } | null;
        if (data?.code !== PERIOD_LOCKED || !data.pinConfigured) return response;
        // After a wrong PIN, keep explaining which filed period is locked.
        if (!data.wrongPin && data.error) message = data.error;
        const entered = await ask(message, data.wrongPin === true);
        if (!entered) return response;
        const headers = new Headers(init?.headers ?? replay?.headers);
        headers.set(PERIOD_LOCK_PIN_HEADER, entered);
        response = await original(replay ? replay.clone() : input, { ...init, headers });
      }
      return response;
    };
    return () => { window.fetch = original; };
  }, []);

  const finish = (value: string | null) => {
    const current = promptRef.current;
    promptRef.current = null;
    setPrompt(null);
    current?.resolve(value);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (pin.trim()) finish(pin.trim()); };

  return <Dialog open={Boolean(prompt)} onOpenChange={(open) => { if (!open) finish(null); }}>
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="size-4" />Filed period locked</DialogTitle>
          <DialogDescription>{prompt?.message}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="period-lock-pin">Administrator PIN</Label>
          <Input id="period-lock-pin" type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(event) => setPin(event.target.value)} aria-invalid={prompt?.wrongPin || undefined} />
          {prompt?.wrongPin ? <p role="alert" className="text-sm text-destructive">Incorrect Admin PIN. Try again or cancel.</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => finish(null)}>Cancel</Button>
          <Button type="submit" disabled={!pin.trim()}>Allow change</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
