"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PrintOrientation } from "@/lib/document-print";

export type { PrintOrientation } from "@/lib/document-print";

export function PrintOrientationSelect({
  value,
  onValueChange,
  className,
}: {
  value: PrintOrientation;
  onValueChange: (value: PrintOrientation) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Label className="whitespace-nowrap text-xs font-semibold text-muted-foreground">A4 layout</Label>
      <Select value={value} onValueChange={(next) => onValueChange(next as PrintOrientation)}>
        <SelectTrigger className="h-9 w-[132px] bg-background" aria-label="A4 print orientation">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="portrait">Portrait</SelectItem>
          <SelectItem value="landscape">Landscape</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
