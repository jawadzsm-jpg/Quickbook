// WhatsApp-style formatting for the Inventory Overview "Edit before copying" box. Each change returns the new text and
// the selection to restore, so the text box keeps the formatted words selected.

export type ShareFormatChannel = "whatsapp" | "telegram" | "email";
export type InlineFormat = "bold" | "italic" | "strike" | "code";
export type LineFormat = "numbered" | "bulleted" | "quote";
export type FormatResult = { text: string; start: number; end: number };

const inlineMarkers: Record<"whatsapp" | "telegram", Record<InlineFormat, string>> = {
  whatsapp: { bold: "*", italic: "_", strike: "~", code: "`" },
  telegram: { bold: "**", italic: "__", strike: "~~", code: "`" },
};

/** Email is plain text, so it has no inline markers. */
export const inlineFormatsFor = (channel: ShareFormatChannel): InlineFormat[] => channel === "email" ? [] : ["bold", "italic", "strike", "code"];

/** Wrap the selection in the channel's marker, or unwrap it when it is already wrapped. An empty selection inserts a placeholder word. */
export function applyInlineFormat(text: string, start: number, end: number, format: InlineFormat, channel: "whatsapp" | "telegram"): FormatResult {
  const marker = inlineMarkers[channel][format];
  const selected = text.slice(start, end);
  if (text.slice(start - marker.length, start) === marker && text.slice(end, end + marker.length) === marker) {
    return { text: text.slice(0, start - marker.length) + selected + text.slice(end + marker.length), start: start - marker.length, end: end - marker.length };
  }
  if (selected.length > marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(marker.length, -marker.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  const word = selected || "text";
  return { text: text.slice(0, start) + marker + word + marker + text.slice(end), start: start + marker.length, end: start + marker.length + word.length };
}

const linePattern: Record<LineFormat, RegExp> = { numbered: /^\d+\. /, bulleted: /^- /, quote: /^> / };

/** Prefix every selected line ("1. ", "- " or "> "), or remove the prefix when every selected line already has it. */
export function applyLineFormat(text: string, start: number, end: number, format: LineFormat): FormatResult {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", Math.max(end - (end > start && text[end - 1] === "\n" ? 1 : 0), start));
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const formatted = lines.every((line) => linePattern[format].test(line))
    ? lines.map((line) => line.replace(linePattern[format], ""))
    : lines.map((line, index) => (format === "numbered" ? `${index + 1}. ` : format === "bulleted" ? "- " : "> ") + line.replace(linePattern[format], ""));
  const block = formatted.join("\n");
  return { text: text.slice(0, lineStart) + block + text.slice(lineEnd), start: lineStart, end: lineStart + block.length };
}
