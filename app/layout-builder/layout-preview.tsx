"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { DocumentData } from "@/lib/layout/document-data";
import { contentBox, type Layout } from "@/lib/layout/schema";
import { layoutCss } from "@/lib/layout/styles";
import { LayoutDocument } from "./layout-document";

const PX_PER_MM = 96 / 25.4;

/** Read-only, true-size page preview scaled to the available width (the same markup that prints). */
export function LayoutPreview({ layout, data }: { layout: Layout; data: DocumentData }) {
  const box = contentBox(layout.page);
  const hostRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const host = hostRef.current, paper = paperRef.current;
    if (!host || !paper) return;
    const observer = new ResizeObserver(() => { setScale(Math.min(1.2, host.clientWidth / (box.pageWidth * PX_PER_MM))); setHeight(paper.offsetHeight); });
    observer.observe(host); observer.observe(paper);
    return () => observer.disconnect();
  }, [box.pageWidth]);
  const { margins } = layout.page;
  return <div ref={hostRef} className="min-w-0">
    <style>{layoutCss(layout)}</style>
    <div style={{ width: box.pageWidth * PX_PER_MM * scale, height: height ? height * scale : undefined, overflow: "hidden", margin: "0 auto" }}>
      <div ref={paperRef} className="relative bg-white shadow-md ring-1 ring-slate-200" style={{ width: `${box.pageWidth}mm`, minHeight: `${box.pageHeight}mm`, padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <LayoutDocument layout={layout} data={data} mode="screen" />
      </div>
    </div>
  </div>;
}
