"use client";

import { useEffect } from "react";

const WINDOW_SELECTOR = [
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="sheet-content"][data-state="open"]',
  '[data-slot="drawer-content"][data-state="open"]',
  '[data-slot="alert-dialog-content"][data-state="open"]',
  '[role="dialog"][aria-modal="true"]',
].join(",");

const CLOSE_SELECTOR = [
  '[data-esc-close]',
  '[data-slot="dialog-close"]',
  '[data-slot="sheet-close"]',
  '[data-slot="drawer-close"]',
  '[data-slot="alert-dialog-cancel"]',
  'button[aria-label*="close" i]',
  'button[title*="close" i]',
].join(",");

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || "1") !== 0 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function zIndexOf(element: HTMLElement) {
  const value = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
  return Number.isFinite(value) ? value : 0;
}

function findTextCloseButton(container: HTMLElement) {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
  );

  return buttons.find((button) => {
    const label = button.textContent?.trim().toLowerCase();
    return label === "close" || label === "cancel";
  });
}

function getTopWindow() {
  const windows = Array.from(
    document.querySelectorAll<HTMLElement>(WINDOW_SELECTOR)
  ).filter(isVisible);

  if (windows.length === 0) return null;

  return windows
    .map((element, index) => ({
      element,
      index,
      zIndex: zIndexOf(element),
    }))
    .sort((a, b) => a.zIndex - b.zIndex || a.index - b.index)
    .at(-1)?.element ?? null;
}

export function EscapeWindowCloser() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
        return;
      }

      const topWindow = getTopWindow();
      if (!topWindow) return;

      const closeControl =
        topWindow.querySelector<HTMLElement>(CLOSE_SELECTOR) ??
        findTextCloseButton(topWindow);

      if (!closeControl) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeControl.click();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
