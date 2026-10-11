// Category colours: a fixed palette with light and dark shades, so every category header stays readable in both
// themes. Categories without a saved choice get an automatic colour from their name.

export type CategoryColor = { id: string; label: string; swatch: string; row: string; dot: string; text: string };

// Literal class names (not built from strings) so Tailwind keeps them in the build.
export const categoryPalette: CategoryColor[] = [
  { id: "sky", label: "Sky", swatch: "bg-sky-400", row: "bg-sky-100 border-l-sky-500 dark:bg-sky-950/70", dot: "bg-sky-500", text: "text-sky-950 dark:text-sky-100" },
  { id: "blue", label: "Blue", swatch: "bg-blue-500", row: "bg-blue-100 border-l-blue-500 dark:bg-blue-950/70", dot: "bg-blue-500", text: "text-blue-950 dark:text-blue-100" },
  { id: "indigo", label: "Indigo", swatch: "bg-indigo-500", row: "bg-indigo-100 border-l-indigo-500 dark:bg-indigo-950/70", dot: "bg-indigo-500", text: "text-indigo-950 dark:text-indigo-100" },
  { id: "violet", label: "Violet", swatch: "bg-violet-500", row: "bg-violet-100 border-l-violet-500 dark:bg-violet-950/70", dot: "bg-violet-500", text: "text-violet-950 dark:text-violet-100" },
  { id: "fuchsia", label: "Fuchsia", swatch: "bg-fuchsia-500", row: "bg-fuchsia-100 border-l-fuchsia-500 dark:bg-fuchsia-950/70", dot: "bg-fuchsia-500", text: "text-fuchsia-950 dark:text-fuchsia-100" },
  { id: "rose", label: "Rose", swatch: "bg-rose-500", row: "bg-rose-100 border-l-rose-500 dark:bg-rose-950/70", dot: "bg-rose-500", text: "text-rose-950 dark:text-rose-100" },
  { id: "orange", label: "Orange", swatch: "bg-orange-500", row: "bg-orange-100 border-l-orange-500 dark:bg-orange-950/70", dot: "bg-orange-500", text: "text-orange-950 dark:text-orange-100" },
  { id: "amber", label: "Amber", swatch: "bg-amber-400", row: "bg-amber-100 border-l-amber-500 dark:bg-amber-950/70", dot: "bg-amber-500", text: "text-amber-950 dark:text-amber-100" },
  { id: "lime", label: "Lime", swatch: "bg-lime-500", row: "bg-lime-100 border-l-lime-500 dark:bg-lime-950/70", dot: "bg-lime-500", text: "text-lime-950 dark:text-lime-100" },
  { id: "emerald", label: "Emerald", swatch: "bg-emerald-500", row: "bg-emerald-100 border-l-emerald-500 dark:bg-emerald-950/70", dot: "bg-emerald-500", text: "text-emerald-950 dark:text-emerald-100" },
  { id: "teal", label: "Teal", swatch: "bg-teal-500", row: "bg-teal-100 border-l-teal-500 dark:bg-teal-950/70", dot: "bg-teal-500", text: "text-teal-950 dark:text-teal-100" },
  { id: "slate", label: "Slate", swatch: "bg-slate-500", row: "bg-slate-200 border-l-slate-500 dark:bg-slate-800/80", dot: "bg-slate-500", text: "text-slate-950 dark:text-slate-100" },
];

export const isCategoryColor = (value: unknown): value is string => categoryPalette.some((color) => color.id === value);

/** The key a category's colour is saved under: trimmed, upper-case ("Laptop " → "LAPTOP"). */
export const categoryColorKey = (category: unknown) => String(category ?? "").trim().toLocaleUpperCase("en") || "GENERAL";

/** The automatic colour for a category: the same name always gets the same colour. */
export function autoCategoryColor(category: unknown) {
  let hash = 0;
  for (const character of categoryColorKey(category)) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return categoryPalette[hash % categoryPalette.length];
}

/** The saved colour for a category, or its automatic one. */
export function categoryColor(category: unknown, saved: Record<string, string> = {}) {
  const id = saved[categoryColorKey(category)];
  return categoryPalette.find((color) => color.id === id) ?? autoCategoryColor(category);
}
