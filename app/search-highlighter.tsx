"use client";

import { useEffect } from "react";
import { matchRanges, searchTerms } from "@/lib/search";

// Highlights what the user typed in any search box inside that box's results, app-wide. It uses the browser's
// CSS Custom Highlight API, which paints ranges without touching the DOM, so React-rendered lists stay intact.
const SEARCH_INPUT = 'input[type="search"], input[placeholder^="Search" i], input[data-search]';
const RESULTS = 'table, [role="listbox"], [role="list"], [role="grid"], ul, ol';
const MAX_RANGES = 4000;

function resultsScope(input: HTMLInputElement): Element {
  for (let element = input.parentElement; element && element !== document.body; element = element.parentElement) {
    if (element.querySelector(RESULTS)) return element;
  }
  return input.closest('[role="dialog"]') ?? document.querySelector("main") ?? document.body;
}

export function SearchHighlighter() {
  useEffect(() => {
    if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;
    const highlight = new Highlight();
    CSS.highlights.set("app-search", highlight);
    const watched = new Map<HTMLInputElement, Element>();
    let frame = 0;
    // Lists re-render as a search narrows them, inputs can be cleared by code and pages unmount: repaint after any change
    // while a search is active (one observer, painting at most once per frame).
    const observer = new MutationObserver(() => schedule());
    let observing = false;

    const paint = () => {
      frame = 0;
      highlight.clear();
      let count = 0;
      for (const [input, scope] of watched) {
        const terms = searchTerms(input.value);
        if (!input.isConnected || !scope.isConnected || !terms.length) { watched.delete(input); continue; }
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => node.parentElement?.closest("input, textarea, select, script, style, [contenteditable=true], [data-no-highlight]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
        });
        for (let node = walker.nextNode() as Text | null; node && count < MAX_RANGES; node = walker.nextNode() as Text | null) {
          for (const [start, end] of matchRanges(node.data, terms)) {
            const range = document.createRange();
            range.setStart(node, start); range.setEnd(node, end);
            highlight.add(range);
            if (++count >= MAX_RANGES) break;
          }
        }
      }
      if (!watched.size && observing) { observer.disconnect(); observing = false; }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

    const onInput = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches(SEARCH_INPUT)) return;
      if (!watched.has(input) && input.value.trim()) watched.set(input, resultsScope(input));
      if (watched.size && !observing) { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); observing = true; }
      schedule();
    };
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      CSS.highlights.delete("app-search");
    };
  }, []);
  return null;
}
