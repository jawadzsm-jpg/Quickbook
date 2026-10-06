import { contentBox, type Layout } from "@/lib/layout/schema";

export type FitIssue = { id: string; message: string };
export type FitReport = { breaks: number[]; pages: number; issues: FitIssue[] };

type Atom = { top: number; bottom: number; repeatHeading: number; label: string; id: string };

/**
 * Predict printed page breaks from the rendered canvas (all values in mm from the top of the content box).
 * It mirrors the print CSS: keep-together rows and avoid-break sections move whole to the next page,
 * line-item tables break between rows and repeat their heading. Elements are tagged by the editor with
 * data-row-id / data-section-id / data-repeat.
 */
export function measurePageFit(doc: HTMLElement, layout: Layout, sectionLabel: (id: string) => string): FitReport {
  const box = contentBox(layout.page);
  const docRect = doc.getBoundingClientRect();
  if (!docRect.width) return { breaks: [], pages: 1, issues: [] };
  const mmPerPx = box.width / docRect.width;
  const toMm = (rect: DOMRect) => ({ top: (rect.top - docRect.top) * mmPerPx, bottom: (rect.bottom - docRect.top) * mmPerPx, height: rect.height * mmPerPx });
  const issues: FitIssue[] = [];

  const rows = [...doc.querySelectorAll<HTMLElement>("[data-row-id]")];
  const repeatedHeight = (kind: string) => rows.filter((row) => row.dataset.repeat === kind).reduce((sum, row) => sum + toMm(row.getBoundingClientRect()).height + parseFloat(getComputedStyle(row).marginTop) * mmPerPx, 0);
  const available = box.height - repeatedHeight("header") - repeatedHeight("footer");
  if (available < 30) issues.push({ id: "page", message: "Repeating header and footer rows leave less than 30 mm for the page body." });

  const atoms: Atom[] = [];
  for (const row of rows.filter((element) => element.dataset.repeat === "none")) {
    const rowBox = toMm(row.getBoundingClientRect());
    const table = row.querySelector<HTMLElement>("[data-section-type='lineItems'] table");
    if (table && row.dataset.keep !== "true") {
      // A line-item row breaks between table rows; its heading repeats on each continued page.
      const head = table.querySelector("thead");
      const heading = head ? toMm(head.getBoundingClientRect()).height : 0;
      const before = toMm(table.getBoundingClientRect()).top;
      if (before > rowBox.top + 0.5) atoms.push({ top: rowBox.top, bottom: before + heading + 1, repeatHeading: 0, label: "Line items", id: row.dataset.rowId! });
      for (const line of table.querySelectorAll("tbody tr")) {
        const lineBox = toMm(line.getBoundingClientRect());
        atoms.push({ top: lineBox.top, bottom: lineBox.bottom, repeatHeading: head && !table.classList.contains("lb-no-repeat") ? heading : 0, label: "A line item", id: row.dataset.rowId! });
      }
      continue;
    }
    atoms.push({ top: rowBox.top, bottom: rowBox.bottom, repeatHeading: 0, label: row.dataset.label || "A row", id: row.dataset.rowId! });
  }

  const breaks: number[] = [];
  let pageStart = atoms[0]?.top ?? 0;
  for (const atom of atoms) {
    const height = atom.bottom - atom.top;
    if (height > available + 0.5) issues.push({ id: atom.id, message: `${atom.label} is ${Math.round(height)} mm tall, more than one page (${Math.round(available)} mm). The browser will split it.` });
    if (atom.bottom - pageStart > available && atom.top > pageStart + 0.5) {
      breaks.push(atom.top);
      pageStart = atom.top - atom.repeatHeading;
    }
  }

  for (const section of doc.querySelectorAll<HTMLElement>("[data-section-id]")) {
    if (section.scrollWidth > section.clientWidth + 2) issues.push({ id: section.dataset.sectionId!, message: `${sectionLabel(section.dataset.sectionId!)} is wider than its column; long unbroken text or a wide image will be clipped.` });
  }
  for (const overlay of layout.overlays.filter((item) => item.print)) {
    const right = overlay.xMm + overlay.widthMm, bottom = overlay.yMm + overlay.heightMm;
    if (overlay.xMm < layout.page.margins.left || overlay.yMm < layout.page.margins.top || right > box.pageWidth - layout.page.margins.right || bottom > box.pageHeight - layout.page.margins.bottom) {
      issues.push({ id: overlay.id, message: `The ${overlay.kind} overlay extends into the page margin and may be cut off by the printer.` });
    }
  }
  return { breaks, pages: breaks.length + 1, issues };
}
