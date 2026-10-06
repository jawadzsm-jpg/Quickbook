"use client";

import { useEffect } from "react";

// App-wide: when a save fails (browser validation or an error toast), outline every empty required
// field in the window the user was working in, so "X is required" messages point at the exact field.
// A field is required when its control has `required`/`aria-required` or its label ends with "*".

const MISSING = "data-required-missing";
const MISSING_LABEL = "data-required-missing-label";
const CONTROL = "input, textarea, select, [data-slot='select-trigger'], [role='combobox']";
const OPEN_WINDOW = "[data-slot='dialog-content'][data-state='open'], [data-slot='sheet-content'][data-state='open'], [role='dialog'][data-state='open']";
const ACTION_WINDOW_MS = 4000;

function visible(element: HTMLElement) {
  if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

function isEmpty(control: HTMLElement) {
  if (control.matches("[data-slot='select-trigger'], [role='combobox']:not(input)")) return control.hasAttribute("data-placeholder");
  if (control instanceof HTMLInputElement) {
    if (["checkbox", "radio"].includes(control.type)) return control.required && !control.checked;
    if (control.type === "file") return !control.files?.length;
    return !control.value.trim();
  }
  if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) return !control.value.trim();
  return false;
}

function usable(control: HTMLElement) {
  if (control.matches("[type='hidden'], [disabled], [readonly], [aria-disabled='true']")) return false;
  if (control.closest("[data-slot='select-content'], [aria-hidden='true']")) return false;
  return visible(control);
}

function labelFor(control: HTMLElement): HTMLElement | null {
  if (control.id) {
    const label = document.querySelector<HTMLElement>(`label[for="${CSS.escape(control.id)}"]`);
    if (label) return label;
  }
  const wrapping = control.closest("label");
  if (wrapping) return wrapping;
  const container = control.parentElement?.closest("div");
  return container?.querySelector<HTMLElement>(":scope > label, :scope > [data-slot='label']") ?? null;
}

function controlForLabel(label: HTMLElement): HTMLElement | null {
  const target = label instanceof HTMLLabelElement && label.htmlFor ? document.getElementById(label.htmlFor) : null;
  if (target?.matches(CONTROL) && usable(target)) return target;
  // Radix selects render a hidden native <select> beside the trigger; pick the control people actually see.
  return [...(label.parentElement?.querySelectorAll<HTMLElement>(CONTROL) ?? [])].find(usable) ?? null;
}

function requiredControls(root: ParentNode) {
  const found = new Set<HTMLElement>();
  root.querySelectorAll<HTMLElement>("[required], [aria-required='true']").forEach((control) => { if (control.matches(CONTROL)) found.add(control); });
  root.querySelectorAll<HTMLElement>("label, [data-slot='label']").forEach((label) => {
    if (!/\*\s*$/.test(label.textContent ?? "")) return;
    const control = controlForLabel(label);
    if (control) found.add(control);
  });
  return [...found].filter(usable);
}

function clearMarks(root: ParentNode = document) {
  root.querySelectorAll(`[${MISSING}]`).forEach((element) => element.removeAttribute(MISSING));
  root.querySelectorAll(`[${MISSING_LABEL}]`).forEach((element) => element.removeAttribute(MISSING_LABEL));
}

function mark(control: HTMLElement) {
  control.setAttribute(MISSING, "");
  labelFor(control)?.setAttribute(MISSING_LABEL, "");
}

function highlight(root: ParentNode, focusFirst: boolean) {
  clearMarks(root);
  const missing = requiredControls(root).filter(isEmpty);
  missing.forEach(mark);
  const first = missing[0];
  if (first && focusFirst) {
    first.scrollIntoView({ block: "center", behavior: "smooth" });
    first.focus({ preventScroll: true });
  }
  return missing.length;
}

function refreshMarks() {
  document.querySelectorAll<HTMLElement>(`[${MISSING}]`).forEach((control) => {
    if (control.isConnected && isEmpty(control) && usable(control)) return;
    control.removeAttribute(MISSING);
    labelFor(control)?.removeAttribute(MISSING_LABEL);
  });
}

export function RequiredFieldHighlighter() {
  useEffect(() => {
    let actionRoot: ParentNode | null = null;
    let actionAt = 0;
    let refreshTimer = 0;

    const rootFor = (element: Element | null): ParentNode => element?.closest(OPEN_WINDOW) ?? element?.closest("form") ?? element?.closest("section, main") ?? document;
    const remember = (element: Element | null) => { actionRoot = rootFor(element); actionAt = Date.now(); };

    const onSubmit = (event: Event) => remember(event.target as Element);
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest("button, [role='button']");
      if (button) remember(button);
    };
    // Browser validation blocks the submit before React sees it; outline every missing field, not just the first.
    let invalidFrame = 0;
    const onInvalid = (event: Event) => {
      const control = event.target as HTMLElement;
      cancelAnimationFrame(invalidFrame);
      invalidFrame = requestAnimationFrame(() => highlight(control.closest("form") ?? rootFor(control), false));
    };
    const scheduleRefresh = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(refreshMarks, 60); };

    // An error toast right after a save means the save was rejected: point at what is still empty.
    const toasts = new MutationObserver((mutations) => {
      const errorShown = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node instanceof Element && (node.matches("[data-sonner-toast][data-type='error']") || node.querySelector("[data-sonner-toast][data-type='error']"))));
      if (!errorShown || !actionRoot || Date.now() - actionAt > ACTION_WINDOW_MS) return;
      const root = actionRoot instanceof Element && !actionRoot.isConnected ? document : actionRoot;
      highlight(root, true);
    });
    toasts.observe(document.body, { childList: true, subtree: true });

    // Dropdowns change attributes rather than firing input events, so watch the marked triggers too.
    const selects = new MutationObserver(scheduleRefresh);
    const watchSelects = () => { selects.disconnect(); document.querySelectorAll(`:is([data-slot='select-trigger'], [role='combobox'])[${MISSING}]`).forEach((trigger) => selects.observe(trigger, { attributes: true, attributeFilter: ["data-placeholder"] })); };
    const marks = new MutationObserver(watchSelects);
    marks.observe(document.body, { attributes: true, attributeFilter: [MISSING], subtree: true });

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", scheduleRefresh, true);
    document.addEventListener("change", scheduleRefresh, true);
    return () => {
      toasts.disconnect(); selects.disconnect(); marks.disconnect();
      window.clearTimeout(refreshTimer); cancelAnimationFrame(invalidFrame);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", scheduleRefresh, true);
      document.removeEventListener("change", scheduleRefresh, true);
    };
  }, []);
  return null;
}
