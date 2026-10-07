"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

const format = (date: Date) => date.toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/** Live UAE date and time on one line in the app header, for every user. */
export function WorkspaceClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  // Rendered only after mount so server and browser HTML match.
  if (!now) return null;
  return <time dateTime={now.toISOString()} title="UAE time" className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/80 bg-muted/40 px-2.5 text-xs font-medium tabular-nums text-foreground sm:text-sm">
    <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{format(now)}
  </time>;
}
