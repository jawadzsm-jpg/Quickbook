// Company Setup → Fonts & text: the app font and text sizes per app area, saved per company (migration 0136) and applied
// app-wide as CSS variables on <html> (app/globals.css "App typography"). Shared by the client and the branding API.

/** Text-size areas: each is a percentage of the default size, stored in its own `companies` column. */
export const TEXT_SIZE_AREAS = [
  { key: "appTextBase", cssVar: "--app-text-base", label: "Base text", detail: "Pages, cards, menus, dialogs and everything not listed below." },
  { key: "appTextSidebar", cssVar: "--app-text-sidebar", label: "Sidebar", detail: "Navigation sections and links." },
  { key: "appTextTables", cssVar: "--app-text-tables", label: "Tables and lists", detail: "Lists, registers and on-screen reports." },
  { key: "appTextForms", cssVar: "--app-text-forms", label: "Forms and inputs", detail: "Fields, dropdowns and field labels." },
  { key: "appTextHeadings", cssVar: "--app-text-headings", label: "Headings", detail: "Page, section, card and dialog titles." },
  { key: "appTextPrint", cssVar: "--app-text-print", label: "Printed reports", detail: "Report tables when printed or saved as PDF from the browser." },
] as const;

export type TextSizeKey = (typeof TEXT_SIZE_AREAS)[number]["key"];
export const TEXT_SIZE_MIN = 80;
export const TEXT_SIZE_MAX = 140;
export const TEXT_SIZE_STEP = 5;
export const TEXT_SIZE_DEFAULT = 100;

/** The default stack (unchanged from before this setting existed). */
export const DEFAULT_FONT_STACK = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
// Arabic text in a Latin-only font falls back to Noto Sans Arabic (downloaded only when Arabic text is shown), then the system.
const ARABIC_FALLBACK = 'var(--font-app-noto-sans-arabic), "Geeza Pro", Tahoma';
const SYSTEM_TAIL = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

type FontChoice = { key: string; label: string; group: "System" | "Google"; arabic: boolean; stack: string };

/** Fonts a company can choose. Google fonts are self-hosted by next/font (app/fonts.ts) under `--font-app-<key>`. */
export const APP_FONTS: FontChoice[] = [
  { key: "", label: "Default", group: "System", arabic: true, stack: DEFAULT_FONT_STACK },
  { key: "arial", label: "Arial", group: "System", arabic: true, stack: `Arial, Helvetica, ${ARABIC_FALLBACK}, sans-serif` },
  { key: "tahoma", label: "Tahoma", group: "System", arabic: true, stack: `Tahoma, Geneva, ${ARABIC_FALLBACK}, sans-serif` },
  { key: "segoe", label: "Segoe UI / system", group: "System", arabic: true, stack: `"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, ${ARABIC_FALLBACK}, sans-serif` },
  { key: "verdana", label: "Verdana", group: "System", arabic: true, stack: `Verdana, Geneva, ${ARABIC_FALLBACK}, sans-serif` },
  { key: "georgia", label: "Georgia (serif)", group: "System", arabic: true, stack: `Georgia, "Times New Roman", ${ARABIC_FALLBACK}, serif` },
  { key: "times", label: "Times New Roman (serif)", group: "System", arabic: true, stack: `"Times New Roman", Times, ${ARABIC_FALLBACK}, serif` },
  ...([
    ["inter", "Inter", false], ["roboto", "Roboto", false], ["open-sans", "Open Sans", false], ["lato", "Lato", false],
    ["poppins", "Poppins", false], ["source-sans-3", "Source Sans 3", false], ["nunito-sans", "Nunito Sans", false],
    ["cairo", "Cairo (Arabic + Latin)", true], ["tajawal", "Tajawal (Arabic + Latin)", true], ["ibm-plex-sans-arabic", "IBM Plex Sans Arabic (Arabic + Latin)", true],
    ["almarai", "Almarai (Arabic + Latin)", true], ["readex-pro", "Readex Pro (Arabic + Latin)", true],
    ["noto-sans-arabic", "Noto Sans Arabic (Arabic + Latin)", true], ["noto-kufi-arabic", "Noto Kufi Arabic (Arabic + Latin)", true],
  ] as const).map(([key, label, arabic]): FontChoice => ({ key, label, group: "Google", arabic, stack: `var(--font-app-${key}), ${arabic ? "" : `${ARABIC_FALLBACK}, `}${SYSTEM_TAIL}` })),
];

export type AppTypography = { appFont: string } & Record<TextSizeKey, number>;

export const DEFAULT_TYPOGRAPHY: AppTypography = { appFont: "", ...Object.fromEntries(TEXT_SIZE_AREAS.map((area) => [area.key, TEXT_SIZE_DEFAULT])) as Record<TextSizeKey, number> };

export function fontStack(key: string) {
  return (APP_FONTS.find((font) => font.key === key) ?? APP_FONTS[0]).stack;
}

/** Validates a saved or submitted typography object; returns an error message for the first bad value. */
export function parseTypography(value: unknown): { ok: true; value: AppTypography } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Choose a font and text sizes." };
  const input = value as Record<string, unknown>;
  if (typeof input.appFont !== "string" || !APP_FONTS.some((font) => font.key === input.appFont)) return { ok: false, error: "Choose a font from the list." };
  const result = { appFont: input.appFont } as AppTypography;
  for (const area of TEXT_SIZE_AREAS) {
    const size = input[area.key];
    if (typeof size !== "number" || !Number.isInteger(size) || size < TEXT_SIZE_MIN || size > TEXT_SIZE_MAX) return { ok: false, error: `${area.label} text size must be ${TEXT_SIZE_MIN}–${TEXT_SIZE_MAX}%.` };
    result[area.key] = size;
  }
  return { ok: true, value: result };
}

/** CSS variables to set on <html> (or on a preview container with the `app-typography-scope` class). */
export function typographyVariables(settings: Partial<AppTypography>): Record<string, string> {
  const vars: Record<string, string> = { "--font-sans": fontStack(settings.appFont ?? "") };
  for (const area of TEXT_SIZE_AREAS) {
    const size = Number(settings[area.key]);
    vars[area.cssVar] = String((Number.isFinite(size) && size >= TEXT_SIZE_MIN && size <= TEXT_SIZE_MAX ? size : TEXT_SIZE_DEFAULT) / 100);
  }
  return vars;
}
