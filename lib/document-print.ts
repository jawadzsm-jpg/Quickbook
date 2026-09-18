import type { DocumentDesign } from '@/lib/document-design';

const PAPER_SIZES_MM = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
} as const;

export function documentPaperDimensions(design: DocumentDesign): [number, number] {
  const [baseWidth, baseHeight] = design.paper === 'Custom'
    ? [design.customPaperWidth, design.customPaperHeight]
    : PAPER_SIZES_MM[design.paper];
  return design.orientation === 'landscape'
    ? [baseHeight, baseWidth]
    : [baseWidth, baseHeight];
}

export function documentPageSizeCss(design: DocumentDesign): string {
  const [width, height] = documentPaperDimensions(design);
  return `${width}mm ${height}mm`;
}

export function documentPageRule(design: DocumentDesign): string {
  if (design.printerMode !== 'specified') return '';
  const pageNumbers = design.printPageNumbers
    ? '@bottom-center{content:"Page " counter(page) " of " counter(pages);font:10px Arial,sans-serif;color:#475569;}'
    : '';
  return `@page{size:${documentPageSizeCss(design)};margin:${design.margin}mm;${pageNumbers}}`;
}
