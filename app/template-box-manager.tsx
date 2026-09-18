"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultElementProperties,
  propertyTargets,
  type DesignField,
  type DocumentDesign,
  type ElementProperties,
} from "@/lib/document-design";

type GroupKey = "headers" | "columns" | "footer";

export function TemplateBoxManager({
  design,
  onChange,
}: {
  design: DocumentDesign;
  onChange: (patch: Partial<DocumentDesign>) => void;
}) {
  const targets = useMemo(() => propertyTargets(design), [design]);
  const [selected, setSelected] = useState(targets[0]?.key || "title");

  useEffect(() => {
    if (!targets.some((target) => target.key === selected)) setSelected(targets[0]?.key || "title");
  }, [selected, targets]);

  const hidden = design.hiddenElements.includes(selected);
  const customId = selected.startsWith("custom.") ? selected.slice("custom.".length) : "";
  const customBox = customId ? design.customBoxes.find((box) => box.id === customId) : undefined;
  const fieldMatch = selected.match(/^(headers|columns|footer)\.(.+)$/);
  const group = fieldMatch?.[1] as GroupKey | undefined;
  const fieldKey = fieldMatch?.[2];
  const field = group && fieldKey ? design[group].find((entry) => entry.key === fieldKey) : undefined;

  const inherited: ElementProperties = {
    ...defaultElementProperties,
    font: design.font,
    size: selected === "title" ? design.titleSize : selected === "company" ? design.companySize : design.fontSize,
    color: selected === "title" || selected === "company" ? design.color : "#111111",
    align: selected === "title" || selected === "company" ? "center" : "left",
  };
  const properties = design.properties[selected] || inherited;

  const updateProperties = (patch: Partial<ElementProperties>) =>
    onChange({ properties: { ...design.properties, [selected]: { ...properties, ...patch } } });

  const updateField = (patch: Partial<DesignField>) => {
    if (!group || !fieldKey) return;
    onChange({ [group]: design[group].map((entry) => entry.key === fieldKey ? { ...entry, ...patch } : entry) } as Partial<DocumentDesign>);
  };

  const addBox = () => {
    if (design.customBoxes.length >= 50) return;
    const id = `box-${crypto.randomUUID()}`;
    const key = `custom.${id}`;
    onChange({
      customBoxes: [...design.customBoxes, { id, text: "New text box", screen: true, print: true }],
      properties: {
        ...design.properties,
        [key]: {
          ...defaultElementProperties,
          font: design.font,
          size: design.fontSize,
          top: true,
          right: true,
          bottom: true,
          left: true,
          offsetX: 40,
          offsetY: 220,
          boxWidth: 220,
          boxHeight: 60,
        },
      },
    });
    setSelected(key);
  };

  const removeBox = () => {
    if (customBox) {
      const nextProperties = { ...design.properties };
      delete nextProperties[selected];
      onChange({
        customBoxes: design.customBoxes.filter((box) => box.id !== customBox.id),
        properties: nextProperties,
      });
      return;
    }
    if (!design.hiddenElements.includes(selected)) onChange({ hiddenElements: [...design.hiddenElements, selected] });
  };

  const restoreBox = () => onChange({ hiddenElements: design.hiddenElements.filter((key) => key !== selected) });

  const updateText = (text: string) => {
    if (customBox) {
      onChange({ customBoxes: design.customBoxes.map((box) => box.id === customBox.id ? { ...box, text } : box) });
      return;
    }
    if (selected === "title") {
      onChange({ title: text.slice(0, 80) });
      return;
    }
    if (field) updateField({ label: text.slice(0, 80) });
  };

  const textValue = customBox?.text ?? (selected === "title" ? design.title : field?.label ?? "");
  const canEditText = Boolean(customBox || selected === "title" || field);
  const setVisibility = (target: "screen" | "print", value: boolean) => {
    if (customBox) {
      onChange({ customBoxes: design.customBoxes.map((box) => box.id === customBox.id ? { ...box, [target]: value } : box) });
    } else if (field) {
      updateField({ [target]: value });
    }
  };
  const screenVisible = customBox?.screen ?? field?.screen;
  const printVisible = customBox?.print ?? field?.print;

  const number = (
    key: "offsetX" | "offsetY" | "boxWidth" | "boxHeight",
    short: string,
    label: string,
    min: number,
    max: number,
  ) => <label className="grid gap-1 text-xs font-medium">
    <span><strong>{short}</strong> — {label}</span>
    <Input
      type="number"
      min={min}
      max={max}
      value={properties[key]}
      onChange={(event) => updateProperties({ [key]: Math.min(max, Math.max(min, Math.round(Number(event.target.value) || 0))) })}
    />
  </label>;

  return <div className="space-y-4 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-semibold">Box controls</p>
        <p className="text-xs text-muted-foreground">Add or remove boxes, change text, resize it, or position it with L / D / W / H.</p>
      </div>
      <Button type="button" onClick={addBox} disabled={design.customBoxes.length >= 50}>+ Add text box</Button>
    </div>

    <label className="grid gap-1 text-sm font-medium">
      Select box
      <select className="rounded-md border bg-background p-2" value={selected} onChange={(event) => setSelected(event.target.value)}>
        {targets.map((target) => <option key={target.key} value={target.key}>
          {design.hiddenElements.includes(target.key) ? "[Removed] " : ""}{target.label}
        </option>)}
      </select>
    </label>

    {canEditText && <label className="grid gap-1 text-sm font-medium">
      Change text
      {customBox
        ? <Textarea rows={3} maxLength={2000} value={textValue} onChange={(event) => updateText(event.target.value)} />
        : <Input required maxLength={80} value={textValue} onChange={(event) => updateText(event.target.value)} />}
    </label>}

    {(screenVisible !== undefined || printVisible !== undefined) && <div className="flex flex-wrap gap-5 text-sm">
      {screenVisible !== undefined && <label className="flex items-center gap-2"><input type="checkbox" checked={screenVisible} onChange={(event) => setVisibility("screen", event.target.checked)} />Show on screen</label>}
      {printVisible !== undefined && <label className="flex items-center gap-2"><input type="checkbox" checked={printVisible} onChange={(event) => setVisibility("print", event.target.checked)} />Show on PDF / print</label>}
    </div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {number("offsetX", "L", "Left / right (px)", -1200, 1200)}
      {number("offsetY", "D", "Up / down (px)", -1600, 1600)}
      {number("boxWidth", "W", "Width (0 = auto)", 0, 1200)}
      {number("boxHeight", "H", "Height (0 = auto)", 0, 800)}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Text size</span>
      <Button type="button" size="sm" variant="outline" disabled={properties.size <= 8} onClick={() => updateProperties({ size: Math.max(8, properties.size - 1) })}>Smaller −</Button>
      <span className="min-w-10 text-center text-sm">{properties.size}px</span>
      <Button type="button" size="sm" variant="outline" disabled={properties.size >= 40} onClick={() => updateProperties({ size: Math.min(40, properties.size + 1) })}>Bigger +</Button>
    </div>

    <div className="flex flex-wrap gap-2">
      {hidden
        ? <Button type="button" variant="outline" onClick={restoreBox}>Restore selected box</Button>
        : <Button type="button" variant="destructive" onClick={removeBox}>Remove selected box</Button>}
      {design.hiddenElements.length > 0 && <Button type="button" variant="outline" onClick={() => onChange({ hiddenElements: [] })}>Restore all removed boxes</Button>}
      <Button type="button" variant="outline" onClick={() => updateProperties({ offsetX: 0, offsetY: 0, boxWidth: customBox ? 220 : 0, boxHeight: customBox ? 60 : 0 })}>Reset L / D / W / H</Button>
    </div>

    <p className="text-xs text-muted-foreground">Drag a visible box in the A4 preview to move it. Drag the blue bottom-right handle to resize it. The same saved layout is used by the selected document template and its PDF output.</p>
  </div>;
}
