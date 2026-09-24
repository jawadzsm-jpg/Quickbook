"use client";

import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const TRANSIENT_LAYER_SELECTOR = [
  '[data-slot="select-content"][data-state="open"]',
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[data-slot="popover-content"][data-state="open"]',
  '[data-slot="command-dialog"][data-state="open"]',
  '[role="listbox"]',
  '[role="menu"]',
].join(",");

type PendingClose = {
  closeControl: HTMLElement;
  saveControl: HTMLButtonElement;
};

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

function findSaveButton(container: HTMLElement) {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
  );

  return buttons.find((button) =>
    /^(save|create|add|update|post|transfer|receive)\b/i.test(
      button.textContent?.trim() ?? ""
    )
  );
}

function closeButtonFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const matched = target.closest<HTMLElement>(CLOSE_SELECTOR);
  if (matched) return matched;
  const button = target.closest<HTMLButtonElement>('button:not([disabled])');
  const label = button?.textContent?.trim().toLowerCase();
  return label === "close" || label === "cancel" ? button : null;
}

function hasOpenTransientLayer() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(TRANSIENT_LAYER_SELECTOR)
  ).some(isVisible);
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
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const pendingCloseRef = useRef<PendingClose | null>(null);
  const bypassNextClose = useRef(false);

  const updatePendingClose = (next: PendingClose | null) => {
    pendingCloseRef.current = next;
    setPendingClose(next);
  };

  useEffect(() => {
    const requestClose = (topWindow: HTMLElement, closeControl: HTMLElement) => {
      const saveControl = findSaveButton(topWindow);
      if (!saveControl) {
        bypassNextClose.current = true;
        closeControl.click();
        return;
      }
      updatePendingClose({ closeControl, saveControl });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
        return;
      }

      if (pendingCloseRef.current) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        updatePendingClose(null);
        return;
      }

      // Let an open select, menu, or popover consume Escape before its parent dialog.
      if (hasOpenTransientLayer()) return;

      const topWindow = getTopWindow();
      if (!topWindow) return;

      const closeControl =
        topWindow.querySelector<HTMLElement>(CLOSE_SELECTOR) ??
        findTextCloseButton(topWindow);

      if (!closeControl) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      requestClose(topWindow, closeControl);
    };

    const onClick = (event: MouseEvent) => {
      if (bypassNextClose.current) {
        bypassNextClose.current = false;
        return;
      }
      if (!(event.target instanceof Element) || event.target.closest("[data-escape-confirm]")) return;
      const closeControl = closeButtonFromTarget(event.target);
      if (!closeControl) return;
      const topWindow = closeControl.closest<HTMLElement>(WINDOW_SELECTOR);
      if (!topWindow || !isVisible(topWindow)) return;
      const saveControl = findSaveButton(topWindow);
      if (!saveControl) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      updatePendingClose({ closeControl, saveControl });
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const discardAndClose = () => {
    const target = pendingCloseRef.current;
    updatePendingClose(null);
    if (!target) return;
    bypassNextClose.current = true;
    target.closeControl.click();
  };

  const saveChanges = () => {
    const target = pendingCloseRef.current;
    updatePendingClose(null);
    if (!target) return;
    const form = target.saveControl.form;
    if (form && target.saveControl.type === "submit") form.requestSubmit(target.saveControl);
    else target.saveControl.click();
  };

  return (
    <AlertDialog open={Boolean(pendingClose)} onOpenChange={(open) => { if (!open) updatePendingClose(null); }}>
      <AlertDialogContent data-escape-confirm>
        <AlertDialogHeader>
          <AlertDialogTitle>Save before closing?</AlertDialogTitle>
          <AlertDialogDescription>
            This window contains editable information. Save your changes, keep editing, or discard the changes and close it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => updatePendingClose(null)}>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={discardAndClose}>Discard &amp; close</AlertDialogAction>
          <AlertDialogAction onClick={saveChanges}>Save changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
