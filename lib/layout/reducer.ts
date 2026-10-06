import { newId, newOverlay, newRow, newSection } from "./defaults";
import type { Layout, Overlay, Row, Section, SectionType } from "./schema";

/** Where a section lands: inside an existing row at `index`, or as a new row inserted at `rowIndex`. */
export type DropTarget = { kind: "row"; rowId: string; index: number } | { kind: "newRow"; rowIndex: number };

export type SectionPatch = Partial<Pick<Section, "screen" | "print" | "avoidBreakInside">> & { props?: Record<string, unknown>; style?: Partial<Section["style"]> };
export type RowPatch = Partial<Pick<Row, "gapMm" | "spaceBeforeMm" | "keepTogether" | "repeat" | "ratios">>;

export type LayoutAction =
  | { type: "replace"; layout: Layout }
  | { type: "moveSection"; sectionId: string; target: DropTarget }
  | { type: "moveRow"; rowId: string; toIndex: number }
  | { type: "addSection"; sectionType: SectionType; target: DropTarget }
  | { type: "duplicateSection"; sectionId: string }
  | { type: "removeSection"; sectionId: string }
  | { type: "updateSection"; sectionId: string; patch: SectionPatch }
  | { type: "updateRow"; rowId: string; patch: RowPatch }
  | { type: "updatePage"; patch: Partial<Omit<Layout["page"], "margins">> & { margins?: Partial<Layout["page"]["margins"]> } }
  | { type: "updateTheme"; patch: Partial<Layout["theme"]> }
  | { type: "updateMeta"; patch: Partial<Pick<Layout, "name" | "enabled">> }
  | { type: "addOverlay"; kind: Overlay["kind"] }
  | { type: "updateOverlay"; overlayId: string; patch: Partial<Omit<Overlay, "id">> }
  | { type: "removeOverlay"; overlayId: string };

export const MAX_SECTIONS_PER_ROW = 3;

function findSection(layout: Layout, sectionId: string) {
  for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex++) {
    const index = layout.rows[rowIndex].sections.findIndex((section) => section.id === sectionId);
    if (index >= 0) return { rowIndex, index, section: layout.rows[rowIndex].sections[index] };
  }
  return null;
}

/** Remove a section from its row, dropping the row (and its ratio) when it becomes empty. */
function detach(rows: Row[], sectionId: string): { rows: Row[]; section: Section | null; removedRowIndex: number | null } {
  let taken: Section | null = null;
  let removedRowIndex: number | null = null;
  const next: Row[] = [];
  rows.forEach((row, rowIndex) => {
    const index = row.sections.findIndex((section) => section.id === sectionId);
    if (index < 0) return next.push(row);
    taken = row.sections[index];
    const sections = row.sections.filter((_, position) => position !== index);
    if (!sections.length) { removedRowIndex = rowIndex; return; }
    next.push({ ...row, sections, ratios: row.ratios.filter((_, position) => position !== index) });
  });
  return { rows: next, section: taken, removedRowIndex };
}

/** Insert a section at a drop target; a full row spills the section into a new row just below it. */
function attach(rows: Row[], section: Section, target: DropTarget): Row[] {
  if (target.kind === "newRow") {
    const next = [...rows];
    next.splice(Math.max(0, Math.min(target.rowIndex, rows.length)), 0, newRow([section]));
    return next;
  }
  const rowIndex = rows.findIndex((row) => row.id === target.rowId);
  if (rowIndex < 0) return [...rows, newRow([section])];
  const row = rows[rowIndex];
  if (row.sections.length >= MAX_SECTIONS_PER_ROW) return attach(rows, section, { kind: "newRow", rowIndex: rowIndex + 1 });
  const index = Math.max(0, Math.min(target.index, row.sections.length));
  const sections = [...row.sections]; sections.splice(index, 0, section);
  const ratios = [...row.ratios]; ratios.splice(index, 0, 1);
  const next = [...rows]; next[rowIndex] = { ...row, sections, ratios };
  return next;
}

const hasBodyRow = (rows: Row[]) => rows.some((row) => row.repeat === "none");

export function layoutReducer(layout: Layout, action: LayoutAction): Layout {
  switch (action.type) {
    case "replace": return action.layout;
    case "moveSection": {
      const origin = findSection(layout, action.sectionId);
      if (!origin) return layout;
      const { rows, section, removedRowIndex } = detach(layout.rows, action.sectionId);
      let target = action.target;
      // Indices were measured before the section was taken out; correct them for the removal.
      if (target.kind === "newRow" && removedRowIndex !== null && removedRowIndex < target.rowIndex) target = { ...target, rowIndex: target.rowIndex - 1 };
      if (target.kind === "row" && layout.rows[origin.rowIndex].id === target.rowId && origin.index < target.index) target = { ...target, index: target.index - 1 };
      const next = attach(rows, section!, target);
      return hasBodyRow(next) ? { ...layout, rows: next } : layout;
    }
    case "moveRow": {
      const from = layout.rows.findIndex((row) => row.id === action.rowId);
      if (from < 0) return layout;
      const rows = [...layout.rows];
      const [row] = rows.splice(from, 1);
      rows.splice(Math.max(0, Math.min(action.toIndex, rows.length)), 0, row);
      return { ...layout, rows };
    }
    case "addSection": return { ...layout, rows: attach(layout.rows, newSection(action.sectionType), action.target) };
    case "duplicateSection": {
      const origin = findSection(layout, action.sectionId);
      if (!origin) return layout;
      const copy = { ...structuredClone(origin.section), id: newId(origin.section.type) };
      return { ...layout, rows: attach(layout.rows, copy, { kind: "row", rowId: layout.rows[origin.rowIndex].id, index: origin.index + 1 }) };
    }
    case "removeSection": {
      const { rows } = detach(layout.rows, action.sectionId);
      return rows.length && hasBodyRow(rows) ? { ...layout, rows } : layout;
    }
    case "updateSection": return { ...layout, rows: layout.rows.map((row) => ({ ...row, sections: row.sections.map((section) => section.id !== action.sectionId ? section : {
      ...section, ...action.patch, props: { ...section.props, ...action.patch.props }, style: { ...section.style, ...action.patch.style },
    } as Section) })) };
    case "updateRow": {
      const rows = layout.rows.map((row) => row.id !== action.rowId ? row : { ...row, ...action.patch, ratios: action.patch.ratios && action.patch.ratios.length === row.sections.length ? action.patch.ratios : row.ratios });
      return hasBodyRow(rows) ? { ...layout, rows } : layout;
    }
    case "updatePage": return { ...layout, page: { ...layout.page, ...action.patch, margins: { ...layout.page.margins, ...action.patch.margins } } };
    case "updateTheme": return { ...layout, theme: { ...layout.theme, ...action.patch } };
    case "updateMeta": return { ...layout, ...action.patch };
    case "addOverlay": return layout.overlays.length >= 12 ? layout : { ...layout, overlays: [...layout.overlays, newOverlay(action.kind)] };
    case "updateOverlay": return { ...layout, overlays: layout.overlays.map((overlay) => overlay.id === action.overlayId ? { ...overlay, ...action.patch } : overlay) };
    case "removeOverlay": return { ...layout, overlays: layout.overlays.filter((overlay) => overlay.id !== action.overlayId) };
  }
}

// History: every committed action is one undo step, except rapid edits that share a coalesce key
// (typing in a field, dragging a slider) which collapse into a single step.
export type History = { past: Layout[]; present: Layout; future: Layout[]; lastKey: string | null; lastAt: number };
export type HistoryAction = { type: "apply"; action: LayoutAction; coalesceKey?: string; at?: number } | { type: "undo" } | { type: "redo" } | { type: "reset"; layout: Layout };

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

export const initialHistory = (layout: Layout): History => ({ past: [], present: layout, future: [], lastKey: null, lastAt: 0 });

export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "reset") return initialHistory(action.layout);
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future], lastKey: null, lastAt: 0 };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), lastKey: null, lastAt: 0 };
  }
  const next = layoutReducer(state.present, action.action);
  if (next === state.present) return state;
  const at = action.at ?? Date.now();
  const coalesce = Boolean(action.coalesceKey) && action.coalesceKey === state.lastKey && at - state.lastAt < COALESCE_MS;
  return {
    past: coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next, future: [], lastKey: action.coalesceKey ?? null, lastAt: at,
  };
}
