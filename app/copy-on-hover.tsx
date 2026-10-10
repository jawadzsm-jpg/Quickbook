"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const HOVER_DELAY_MS = 400;

// The older copy command works during a click even where the Clipboard API is refused or missing (plain http).
function copyWithSelection(value: string) {
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try { return document.execCommand("copy"); } finally { field.remove(); }
}

// Copies `value` when the pointer rests on it briefly, or at once on click. Browsers that only allow
// clipboard writes after a click (Safari) still copy on click; a refused hover copy stays silent. The click does not
// reach the surrounding row, so a value inside a clickable line copies instead of opening it.
export function CopyOnHover({ value, label, display = value }: { value: string; label: string; display?: string }) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (fromClick: boolean) => {
    let copied = false;
    try { await navigator.clipboard.writeText(value); copied = true; } catch { copied = fromClick && copyWithSelection(value); }
    if (copied) toast.success(`${label} ${value} copied`, { id: "copy-on-hover" });
    else if (fromClick) toast.error(`Could not copy ${label} ${value}.`, { id: "copy-on-hover" });
  };
  return <span role="button" tabIndex={0} title={`Copy ${label} ${value}`} className="cursor-copy rounded px-1 -mx-1 hover:bg-emerald-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
    onMouseEnter={() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void copy(false), HOVER_DELAY_MS); }}
    onMouseLeave={() => window.clearTimeout(timer.current)}
    onClick={(event) => { event.stopPropagation(); window.clearTimeout(timer.current); void copy(true); }}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void copy(true); } }}>{display}</span>;
}
