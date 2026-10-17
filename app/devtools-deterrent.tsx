"use client";

import { useEffect } from "react";
import { isDevtoolsShortcut } from "@/lib/devtools-shortcuts";

// Discourages casual use of the browser's Inspect / DevTools: the right-click menu (except in text fields, so Paste
// still works) and the F12, Ctrl+Shift+I/J/C (Cmd+Option+I/J/C and Cmd+Shift+C on Mac) and view-source shortcuts do nothing.
// This is a deterrent only: DevTools can still be opened from the browser menu, so access control stays on the
// server. Off in local development (`next dev`) unless NEXT_PUBLIC_DEVTOOLS_DETERRENT=1.

function isEditable(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

export function DevtoolsDeterrent() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEVTOOLS_DETERRENT !== "1") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isDevtoolsShortcut(event, isEditable(event.target))) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!isEditable(event.target)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, []);
  return null;
}
