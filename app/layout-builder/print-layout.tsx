import type { DocumentData } from "@/lib/layout/document-data";
import type { Layout } from "@/lib/layout/schema";
import { layoutCss, layoutPageCss } from "@/lib/layout/styles";
import { fitRowText } from "@/lib/layout/fit-rows";
import { LayoutDocument } from "./layout-document";

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);

export type PrintCopy = { data: DocumentData; label?: string };
const copyCss = `.lb-copy{position:relative;break-after:page;page-break-after:always}.lb-copy:last-child{break-after:auto;page-break-after:auto}
.lb-copy-label{position:absolute;right:0;top:0;z-index:5;border:1px solid #0f172a;border-radius:999px;padding:1mm 3mm;font:700 8pt Arial,sans-serif;letter-spacing:.08em;color:#0f172a;background:#fff}`;

/** Full standalone HTML: the same markup and CSS as the editor, plus print page rules. Each copy starts on a new page. */
export async function layoutHtml(layout: Layout, documents: DocumentData | PrintCopy[], title: string) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const copies = Array.isArray(documents) ? documents : [{ data: documents }];
  const body = copies.map(({ data, label }) => `<section class="lb-copy">${label ? `<span class="lb-copy-label">${escapeHtml(label)}</span>` : ""}${renderToStaticMarkup(<LayoutDocument layout={layout} data={data} mode="print" />)}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${layoutCss(layout)}${layoutPageCss(layout)}${copyCss}</style></head><body>${body}</body></html>`;
}

/**
 * Print through the browser's own engine so text stays vector and selectable, pages follow the CSS page
 * rules exactly, and "Save as PDF" in the print dialog produces the PDF.
 */
export async function printLayout(layout: Layout, documents: DocumentData | PrintCopy[], title: string) {
  const html = await layoutHtml(layout, documents, title);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  try {
    const view = frame.contentWindow!;
    view.document.open();
    view.document.write(html);
    view.document.close();
    // Wait for logos and images so they are on the first printed page, but never hang the print.
    const images = [...view.document.images].map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = image.onerror = () => resolve(); }));
    await Promise.race([Promise.all(images), new Promise((resolve) => setTimeout(resolve, 4000))]);
    await view.document.fonts?.ready;
    fitRowText(view.document);
    const previousTitle = document.title;
    document.title = title; // Chrome names the saved PDF after the top-level document title.
    view.addEventListener("afterprint", () => { document.title = previousTitle; cleanup(); }, { once: true });
    view.focus();
    view.print();
    setTimeout(() => { document.title = previousTitle; }, 60_000);
  } catch (error) {
    cleanup();
    throw error;
  }
}
