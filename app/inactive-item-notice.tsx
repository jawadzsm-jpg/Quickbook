"use client";
import { useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { itemPartNumber } from "@/lib/inactive-item-match";

type InactiveItem = Record<string, unknown> & { id: number };

/** Makes an inactive item active again (records item-status, written to the audit log). Returns true when it worked. */
export async function reactivateItem(item: InactiveItem, companyId?: number) {
  try {
    const response = await fetch("/api/records", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "items", editMode: "item-status", companyId: Number(item.companyId ?? companyId), id: item.id, expectedStatus: "inactive", status: "active" }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not reactivate this item.");
    toast.success(`${String(item.name ?? "Item")} is active again.`);
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not reactivate this item.");
    return false;
  }
}

/**
 * "You have this item — it is in Inactive items": shown when a part number / SKU / item no. search matches items that
 * the list or picker hides because they are inactive. Open shows them (e.g. the Inactive items filter); Reactivate needs
 * inventory:manage and is left out when `onReactivated` is not given.
 */
export function InactiveItemNotice({ matches, companyId, onOpen, onReactivated, compact = false }: {
  matches: InactiveItem[]; companyId?: number; compact?: boolean;
  onOpen?: (item: InactiveItem) => void;
  onReactivated?: (item: InactiveItem) => void;
}) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  if (!matches.length) return null;
  return <div role="status" className={`border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 ${compact ? "border-b px-3 py-2 text-xs" : "rounded-lg border p-3 text-sm"}`}>
    <p className="flex items-center gap-2 font-semibold"><Archive className="size-4 shrink-0" />You have {matches.length === 1 ? "this item" : "these items"} — {matches.length === 1 ? "it is" : "they are"} in Inactive items.</p>
    <ul className="mt-1.5 grid gap-1.5">
      {matches.map((item) => {
        const codes = [item.itemNumber ? `Item #${String(item.itemNumber)}` : "", item.sku ? `SKU ${String(item.sku)}` : "", itemPartNumber(item) ? `Part ${itemPartNumber(item)}` : ""].filter(Boolean).join(" · ");
        return <li key={item.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 break-words"><span className="font-medium">{String(item.name ?? "")}</span>{codes ? <span className="block text-xs opacity-80">{codes}{item.locationName ? ` · ${String(item.locationName)}` : ""}</span> : null}</span>
          {onOpen ? <Button type="button" size="sm" variant="outline" className="h-7 bg-background" onClick={() => onOpen(item)}>Open</Button> : null}
          {onReactivated ? <Button type="button" size="sm" className="h-7" disabled={pendingId !== null} onClick={async () => {
            setPendingId(item.id);
            const done = await reactivateItem(item, companyId);
            setPendingId(null);
            if (done) onReactivated(item);
          }}><RotateCcw className="size-3.5" />{pendingId === item.id ? "Reactivating…" : "Reactivate"}</Button> : null}
        </li>;
      })}
    </ul>
  </div>;
}
