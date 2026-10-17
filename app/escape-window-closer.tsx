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
  window: HTMLElement;
  closeControl: HTMLElement;
  saveControls: HTMLButtonElement[];
  tracked: boolean;
};

// Output buttons such as "Save as PDF" produce a file; they never save the window's edits.
const OUTPUT_LABEL = /\b(pdf|print|download|e-?mail)\b/i;

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
    return (label === "close" || label === "cancel") && !button.hasAttribute("data-not-close");
  });
}

/**
 * The window's save button, which makes closing ask "Save before closing?". Windows (or parts of them) marked
 * data-no-save-prompt hold nothing to save, e.g. Workspace shortcuts, whose "Receive Payment" is a link, not a save.
 */
function findSaveButton(container: HTMLElement) {
  if (container.closest("[data-no-save-prompt]")) return undefined;
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
  ).filter((button) => !button.closest("[data-no-save-prompt]"));

  return buttons.find((button) => {
    const label = button.textContent?.trim() ?? "";
    return /^(save|create|add|update|post|transfer|receive)\b/i.test(label) && !OUTPUT_LABEL.test(label);
  });
}

/**
 * What closing this window would lose, or null when it can close straight away. Windows marked
 * data-unsaved-tracking (customer and vendor document windows) report their own edits: each part holding unsaved
 * edits carries data-unsaved, and its own save button carries data-save-changes. Untracked windows fall back to
 * their first save-like button.
 */
function findUnsavedWork(container: HTMLElement) {
  if (container.matches("[data-unsaved-tracking]")) {
    const parts = [container, ...Array.from(container.querySelectorAll<HTMLElement>("[data-unsaved]"))]
      .filter((part) => part.hasAttribute("data-unsaved"));
    if (parts.length === 0) return null;
    const saveControls = parts.flatMap((part) => {
      const control = part.matches("[data-save-changes]") ? part : part.querySelector<HTMLElement>("[data-save-changes]");
      return control instanceof HTMLButtonElement ? [control] : [];
    });
    return { saveControls, tracked: true };
  }
  const saveControl = findSaveButton(container);
  return saveControl ? { saveControls: [saveControl], tracked: false } : null;
}

function pressSave(control: HTMLButtonElement) {
  const form = control.form;
  if (form && control.type === "submit") form.requestSubmit(control);
  else control.click();
}

// Buttons marked data-not-close only cancel an inline edit (e.g. Ship To's Cancel); they leave the window open.
function closeButtonFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest("[data-not-close]")) return null;
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
      const unsaved = findUnsavedWork(topWindow);
      if (!unsaved) {
        bypassNextClose.current = true;
        closeControl.click();
        return;
      }
      updatePendingClose({ window: topWindow, closeControl, ...unsaved });
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
      const unsaved = findUnsavedWork(topWindow);
      if (!unsaved) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      updatePendingClose({ window: topWindow, closeControl, ...unsaved });
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

  // Presses the window's own save buttons. A tracked window then closes once its edits are saved; it stays open
  // when a save fails or cannot run (the part shows its own error), so nothing is lost.
  const saveChanges = () => {
    const target = pendingCloseRef.current;
    updatePendingClose(null);
    if (!target) return;
    const ready = target.saveControls.filter((control) => !control.disabled);
    ready.forEach(pressSave);
    if (!target.tracked || ready.length === 0) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const open = target.window.isConnected && isVisible(target.window);
      if (!open) return window.clearInterval(timer);
      const unsaved = findUnsavedWork(target.window);
      if (!unsaved) {
        window.clearInterval(timer);
        const closeControl = target.closeControl.isConnected
          ? target.closeControl
          : target.window.querySelector<HTMLElement>(CLOSE_SELECTOR) ?? findTextCloseButton(target.window);
        if (!closeControl) return;
        bypassNextClose.current = true;
        closeControl.click();
        return;
      }
      const saving = ready.some((control) => control.isConnected && control.disabled);
      if ((!saving && Date.now() - started > 400) || Date.now() - started > 60_000) window.clearInterval(timer);
    }, 100);
  };

  return (
    <AlertDialog open={Boolean(pendingClose)} onOpenChange={(open) => { if (!open) updatePendingClose(null); }}>
      <AlertDialogContent data-escape-confirm>
        <AlertDialogHeader>
          <AlertDialogTitle>Save before closing?</AlertDialogTitle>
          <AlertDialogDescription>
            This window has unsaved changes. Save them, keep editing, or discard them and close the window.
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
