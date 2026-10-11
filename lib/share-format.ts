// WhatsApp-style formatting for the Inventory Overview "Edit before copying" box. Each change returns the new text and
// the selection to restore, so the text box keeps the formatted words selected.

export type ShareFormatChannel = "whatsapp" | "telegram" | "email";
export type InlineFormat = "bold" | "italic" | "underline" | "strike" | "code" | "spoiler";
export type LineFormat = "numbered" | "bulleted" | "quote";
export type FormatResult = { text: string; start: number; end: number };

// WhatsApp has no underline or spoiler. Telegram's "++underline++" is this app's own marker: Telegram copies paste as rich
// text (see telegramHtml), so it only shows as "++" where an app accepts plain text alone.
const inlineMarkers: Record<"whatsapp" | "telegram", Partial<Record<InlineFormat, string>>> = {
  whatsapp: { bold: "*", italic: "_", strike: "~", code: "`" },
  telegram: { bold: "**", italic: "__", underline: "++", strike: "~~", code: "`", spoiler: "||" },
};

/** The inline tools for each channel, in that app's own toolbar order. Email is plain text, so it has none. */
export const inlineFormatsFor = (channel: ShareFormatChannel): InlineFormat[] =>
  channel === "email" ? [] : channel === "telegram" ? ["bold", "italic", "underline", "strike", "code", "spoiler"] : ["bold", "italic", "strike", "code"];

/** Wrap the selection in the channel's marker, or unwrap it when it is already wrapped. An empty selection inserts a placeholder word. */
export function applyInlineFormat(text: string, start: number, end: number, format: InlineFormat, channel: "whatsapp" | "telegram"): FormatResult {
  const marker = inlineMarkers[channel][format];
  if (!marker) return { text, start, end };
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

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);

/** Turn the selection into a Markdown link "[text](url)"; Telegram copies paste it as a real link. Only http(s) URLs. */
export function applyLink(text: string, start: number, end: number, url: string): FormatResult | null {
  const href = url.trim();
  if (!/^https?:\/\/\S+$/i.test(href)) return null;
  const label = text.slice(start, end) || href;
  const link = `[${label}](${href})`;
  return { text: text.slice(0, start) + link + text.slice(end), start: start + 1, end: start + 1 + label.length };
}

/** Telegram markdown (**bold**, __italic__, ++underline++, ~~strike~~, `code`, ||spoiler||, [links](https://…), "> " quotes)
 * as HTML, so a Telegram copy pastes already formatted. */
export function telegramHtml(text: string) {
  const inline = (line: string) => {
    const codes: string[] = [];
    // Code spans first, so markers inside them stay literal.
    let html = escapeHtml(line).replace(/`([^`\n]+)`/g, (_, code: string) => `\u0000${codes.push(code) - 1}\u0000`);
    html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi, '<a href="$2">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<i>$1</i>").replace(/\+\+(.+?)\+\+/g, "<u>$1</u>")
      .replace(/~~(.+?)~~/g, "<s>$1</s>").replace(/\|\|(.+?)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");
    return html.replace(/\u0000(\d+)\u0000/g, (_, index: string) => `<code>${codes[Number(index)]}</code>`);
  };
  const blocks: string[] = [];
  let quote: string[] = [];
  const flush = () => { if (quote.length) blocks.push(`<blockquote>${quote.join("<br>")}</blockquote>`); quote = []; };
  for (const line of text.split("\n")) {
    if (line.startsWith("> ")) { quote.push(inline(line.slice(2))); continue; }
    flush();
    blocks.push(inline(line));
  }
  flush();
  return blocks.join("<br>").replace(/<\/blockquote><br>/g, "</blockquote>");
}
