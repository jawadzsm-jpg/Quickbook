// Keyboard shortcuts that open the browser's DevTools or page source (used by app/devtools-deterrent.tsx).

const DEVTOOLS_KEYS = new Set(["KeyI", "KeyJ", "KeyC"]);

export function isDevtoolsShortcut(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, editable = false) {
  if (event.key === "F12") return true;
  // Windows / Linux: Ctrl+Shift+I, J or C. Mac: Cmd+Option+I, J or C (Option changes event.key, so match event.code).
  if (DEVTOOLS_KEYS.has(event.code) && ((event.ctrlKey && event.shiftKey) || (event.metaKey && event.altKey))) return true;
  // Mac Chrome also opens the element picker with Cmd+Shift+C.
  if (event.code === "KeyC" && event.metaKey && event.shiftKey) return true;
  // View source: Ctrl+U, Cmd+Option+U. Ctrl+U still underlines inside editable fields (e.g. the letterhead editor).
  if (event.code === "KeyU" && ((event.ctrlKey && !event.shiftKey && !event.altKey && !editable) || (event.metaKey && event.altKey))) return true;
  return false;
}
