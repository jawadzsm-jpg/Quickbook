"use client";

import { useRef, type ReactNode } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Undo2, Redo2 } from "lucide-react";
import type { LetterheadTemplate } from "@/lib/letterhead";

export function LetterheadRichEditor({ template, onChange }: { template: LetterheadTemplate; onChange: (body: string, bodyHtml: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  const initialized = useRef(false);
  const setEditor = (node: HTMLDivElement | null) => {
    editor.current = node;
    if (node && !initialized.current) {
      if (template.bodyHtml) node.innerHTML = template.bodyHtml;
      else node.innerText = template.body;
      initialized.current = true;
    }
  };
  const remember = () => {
    const selected = window.getSelection();
    if (selected?.rangeCount && editor.current?.contains(selected.anchorNode)) selection.current = selected.getRangeAt(0).cloneRange();
  };
  const change = () => {
    const node = editor.current;
    if (node) onChange(node.innerText.slice(0, 6000), node.innerHTML.slice(0, 12000));
  };
  const command = (name: string, value?: string) => {
    editor.current?.focus();
    if (selection.current) {
      const selected = window.getSelection();
      selected?.removeAllRanges();
      selected?.addRange(selection.current);
    }
    document.execCommand(name, false, value);
    remember();
    change();
  };
  const button = (label: string, name: string, icon: ReactNode) => <button type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={() => command(name)} className="rounded border p-2 hover:bg-slate-100">{icon}</button>;
  return <div className="space-y-2">
    <span className="text-sm font-medium">Letter content</span>
    <div role="toolbar" aria-label="Letter formatting" className="flex flex-wrap items-center gap-1 rounded-t-md border bg-slate-50 p-2">
      {button("Bold", "bold", <Bold className="size-4" />)}
      {button("Italic", "italic", <Italic className="size-4" />)}
      {button("Underline", "underline", <Underline className="size-4" />)}
      {button("Align left", "justifyLeft", <AlignLeft className="size-4" />)}
      {button("Align center", "justifyCenter", <AlignCenter className="size-4" />)}
      {button("Align right", "justifyRight", <AlignRight className="size-4" />)}
      {button("Bulleted list", "insertUnorderedList", <List className="size-4" />)}
      {button("Numbered list", "insertOrderedList", <ListOrdered className="size-4" />)}
      {button("Undo", "undo", <Undo2 className="size-4" />)}
      {button("Redo", "redo", <Redo2 className="size-4" />)}
      <label className="flex items-center gap-1 px-1 text-xs">Size <select aria-label="Text size" className="rounded border bg-white p-1" defaultValue="3" onChange={(event) => command("fontSize", event.target.value)}><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Heading</option></select></label>
      <label className="flex items-center gap-1 px-1 text-xs">Color <input aria-label="Text color" type="color" defaultValue="#24282d" onChange={(event) => command("foreColor", event.target.value)} /></label>
    </div>
    <div ref={setEditor} contentEditable role="textbox" aria-label="Letter content" aria-multiline="true" suppressContentEditableWarning
      onInput={change} onKeyUp={remember} onMouseUp={remember}
      onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); change(); }}
      onDrop={(event) => { event.preventDefault(); editor.current?.focus(); document.execCommand("insertText", false, event.dataTransfer.getData("text/plain")); change(); }}
      className="min-h-48 max-h-96 overflow-y-auto rounded-b-md border border-t-0 bg-white p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-400" />
    <p className="text-xs text-slate-500">Paste text here, select words to format them, then drag the text handle in the A4 preview to position it.</p>
  </div>;
}
