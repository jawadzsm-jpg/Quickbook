/**
 * "Shrink text to fit the row": a section marked `lb-fit` gets a smaller font until it is no taller than the
 * tallest other section in its row (for example warranty terms next to the totals, ending level with Paid).
 * The renderer is static markup, so this runs after each render: editor canvas, preview and the print frame.
 */
export function fitRowText(root: ParentNode | null | undefined) {
  if (!root) return;
  for (const section of root.querySelectorAll<HTMLElement>(".lb-fit")) {
    const base = section.style.getPropertyValue("--lb-base-size");
    const basePt = Number.parseFloat(base);
    if (!Number.isFinite(basePt) || basePt <= 0) continue;
    section.style.fontSize = base;
    const row = section.parentElement;
    if (!row) continue;
    // Measure natural heights: rows stretch their cells to the tallest one.
    const previousAlign = row.style.alignItems;
    row.style.alignItems = "start";
    const target = Math.max(0, ...[...row.children].filter((cell): cell is HTMLElement => cell !== section && cell instanceof HTMLElement && cell.classList.contains("lb-section")).map((cell) => cell.offsetHeight));
    if (target > 0 && section.offsetHeight > target) {
      let low = basePt * 0.4, high = basePt;
      for (let step = 0; step < 12; step++) {
        const middle = (low + high) / 2;
        section.style.fontSize = `${middle}pt`;
        if (section.offsetHeight <= target) low = middle; else high = middle;
      }
      section.style.fontSize = `${Math.floor(low * 100) / 100}pt`;
    }
    row.style.alignItems = previousAlign;
  }
}
