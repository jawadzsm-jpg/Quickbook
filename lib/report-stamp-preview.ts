import type { PrintOrientation } from "./document-print";
import { reportStampAfterTable, reportStampPage } from "./report-stamp";

// Approximates the shared report PDF layout (lib/report-export.ts) so the stamp guide can show the page where
// the table ends and where the stamp will really print. Measurements are millimetres on A4.
export const PREVIEW_LAYOUT = { headerHeight: 38, summaryTitleY: 43, cardsTop: 47, cardRowHeight: 18, noteLineHeight: 3.2, laterTableTop: 44, headRowHeight: 8, rowHeight: 7, footer: 17, boxGap: 8, boxWidth: 80 } as const;

export type PreviewBox = { lines: number; remarkLines: number };
export type StampPreviewLayout = {
  page: number; pages: number;
  /** Summary cards and note only appear when the table ends on page 1. */
  showSummary: boolean; cardsTop: number; cardRows: number; noteTop: number;
  tableTop: number; firstRow: number; lastRow: number; tableBottom: number;
  boxes: Array<{ top: number; height: number }>;
  stamp: { top: number; requestedTop: number; moved: boolean };
};

export const bankBoxHeight = (box: PreviewBox) => 5 + (box.lines + 1) * 3.6 + (box.remarkLines ? box.remarkLines * 3.6 + 1.5 : 0);

export function stampPreviewLayout({ orientation, summaryCards, noteLines, rows, boxes = [], stampTop, stampHeight = 23 }: {
  orientation: PrintOrientation; summaryCards: number; noteLines: number; rows: number; boxes?: PreviewBox[]; stampTop: number; stampHeight?: number;
}): StampPreviewLayout {
  const L = PREVIEW_LAYOUT, page = reportStampPage(orientation), bottom = page.height - L.footer;
  const cardColumns = Math.max(1, Math.min(3, summaryCards));
  const cardRows = summaryCards ? Math.ceil(summaryCards / cardColumns) : 0;
  const noteTop = L.cardsTop + cardRows * L.cardRowHeight + 3;
  const firstTableTop = summaryCards ? noteTop + noteLines * L.noteLineHeight + 4 : L.laterTableTop + 2;
  let current = 1, tableTop = firstTableTop, y = firstTableTop + L.headRowHeight, firstRow = 0;
  for (let index = 0; index < rows; index++) {
    if (y + L.rowHeight > bottom) { current++; tableTop = L.laterTableTop; y = tableTop + L.headRowHeight; firstRow = index; }
    y += L.rowHeight;
  }
  let contentBottom = y;
  const placedBoxes: StampPreviewLayout["boxes"] = [];
  for (const box of boxes) {
    const height = bankBoxHeight(box);
    let top = contentBottom + L.boxGap;
    if (top + height > bottom) { current++; tableTop = L.laterTableTop; firstRow = rows; placedBoxes.length = 0; top = 46; }
    placedBoxes.push({ top, height });
    contentBottom = top + height;
  }
  const placement = reportStampAfterTable(page.height, contentBottom, stampTop, stampHeight);
  if (placement.newPage) { current++; firstRow = rows; placedBoxes.length = 0; }
  const tableOnPage = firstRow < rows;
  return {
    page: current, pages: current,
    showSummary: current === 1 && summaryCards > 0, cardsTop: L.cardsTop, cardRows, noteTop,
    tableTop: tableOnPage ? tableTop : 0, firstRow, lastRow: rows, tableBottom: tableOnPage ? y : 0,
    boxes: placedBoxes,
    stamp: { top: placement.top, requestedTop: stampTop, moved: placement.newPage || Math.abs(placement.top - stampTop) > 0.5 },
  };
}
