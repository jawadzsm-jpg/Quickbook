"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const HOVER_DELAY_MS = 400;

// Copies `value` when the pointer rests on it briefly, or at once on click. Browsers that only allow
// clipboard writes after a click (Safari) still copy on click; a refused hover copy stays silent.
export function CopyOnHover({ value, label }: { value: string; label: string }) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (fromClick: boolean) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} ${value} copied`, { id: "copy-on-hover" });
    } catch {
      if (fromClick) toast.error(`Could not copy ${label} ${value}.`, { id: "copy-on-hover" });
    }
  };
  return <span role="button" tabIndex={0} title={`Copy ${label} ${value}`} className="cursor-copy rounded px-1 -mx-1 hover:bg-emerald-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
    onMouseEnter={() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void copy(false), HOVER_DELAY_MS); }}
    onMouseLeave={() => window.clearTimeout(timer.current)}
    onClick={() => { window.clearTimeout(timer.current); void copy(true); }}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void copy(true); } }}>{value}</span>;
}
