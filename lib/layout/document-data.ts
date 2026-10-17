import type { LetterheadTemplate } from "@/lib/letterhead";
import type { LetterheadCompany } from "@/app/letterhead-page";
import type { DetailField } from "./schema";

/** The company stamp or the bank details box, placed freely on the first page (millimetres from the content area's top-left). */
export type DocumentStamp = { kind: "company" | "bank" | "status" | "copy" | "delivered"; left: number; top: number; src?: string; title?: string; lines?: string[]; remark?: string; text?: string };

/** Everything a layout needs to render one document. Real invoices and the editor's mock data share this shape. */
export type DocumentLine = { sku: string; description: string; quantity: number; unitPrice: number; serialNumber: string; comments: string; subtotal: number; vatRate: number; vatAmount: number; total: number };
export type DocumentData = {
  company: { name: string; addressLines: string[]; phone: string; email: string; trn: string; leftLogo: string; rightLogo: string; stamp: string; bank: { name: string; accountName: string; accountNumber: string; iban: string; swift: string; stamp: string } };
  billTo: string[];
  shipTo: string[];
  details: Partial<Record<DetailField, string>>;
  currency: string;
  lines: DocumentLine[];
  totals: { subtotal: number; vat: number; total: number; paid: number; balance: number };
  /** Sum of line quantities, printed above the totals on invoices, proformas, estimates, sales orders, bills and purchase orders. */
  totalQuantity?: number;
  message: string;
  terms: string;
  status: string;
  stamps?: DocumentStamp[];
  /** Letterhead assigned to this document type: replaces the company header and adds its footer on every page. */
  letterhead?: { template: LetterheadTemplate; company: LetterheadCompany };
};

export type MockSize = "short" | "medium" | "long";
export const mockSizes: Record<MockSize, { label: string; lines: number }> = { short: { label: "3 lines", lines: 3 }, medium: { label: "25 lines", lines: 25 }, long: { label: "120 lines", lines: 120 } };

const products = [
  { sku: "73B1DA", description: "DELL ALIENWARE 16 AURORA AC16250 73B1DA | BRAND NEW | CORE 7-240H | 16GB RAM | 512GB SSD | NVIDIA GEFORCE RTX 5050 8GB | 16 INCH | 2.5K 2560 X 1600 | ENGLISH KEYBOARD | BACKLIT | WIN 11 HOME | BLUE | MANUFACTURER WARRANTY ONLY", price: 4220.5 },
  { sku: "7C6051", description: "HP ALL IN ONE 27 CR0163NH | 13TH GEN I7-1355U | 512GB SSD | INTEL IRIS XE | 27 INCH FHD | WIRED KEYBOARD AND MOUSE | SHELL WHITE", price: 1100 },
  { sku: "LG27UP", description: "LG 27UP850 27\" 4K UHD IPS MONITOR | USB-C 96W", price: 1349 },
  { sku: "MX-KEYS", description: "Logitech MX Keys S wireless keyboard", price: 389 },
  { sku: "SVC-INST", description: "On-site installation and configuration service", price: 250 },
];

const round = (value: number) => Math.round(value * 100) / 100;

export function mockDocument(size: MockSize = "short"): DocumentData {
  const lines: DocumentLine[] = Array.from({ length: mockSizes[size].lines }, (_, index) => {
    const product = products[index % products.length];
    const quantity = (index % 4) + 1;
    const subtotal = round(quantity * product.price);
    const vatAmount = round(subtotal * 0.05);
    return { sku: product.sku, description: product.description, quantity, unitPrice: product.price, serialNumber: index % 3 === 0 ? `SN${100200 + index}` : "", comments: "", subtotal, vatRate: 5, vatAmount, total: round(subtotal + vatAmount) };
  });
  const subtotal = round(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const vat = round(lines.reduce((sum, line) => sum + line.vatAmount, 0));
  const total = round(subtotal + vat);
  return {
    company: {
      name: "ComNet International", addressLines: ["Shop # 13 & 14, Bayat Center Building", "Naif Road, Deira, Dubai", "United Arab Emirates"],
      phone: "+971 4 393 8050", email: "sales@comnet.example", trn: "100349940500003", leftLogo: "", rightLogo: "", stamp: "",
      bank: { name: "Emirates NBD", accountName: "ComNet International LLC", accountNumber: "1015 4567 8901", iban: "AE07 0260 0010 1545 6789 01", swift: "EBILAEAD", stamp: "" },
    },
    billTo: ["Techno Com Trading LLC", "Office 402, Al Fahidi Street", "Dubai, United Arab Emirates", "TRN 100200300400003"],
    shipTo: ["Techno Com Warehouse", "Al Quoz Industrial 3", "Dubai, United Arab Emirates"],
    details: { number: "C001-MAIN-INV-0042", date: "2026-10-06", dueDate: "2026-11-05", terms: "Net 30", salesman: "Sara Rep", reference: "PO-7781", trn: "100200300400003", source: "SO-0019", status: "Open" },
    currency: "AED", lines,
    totals: { subtotal, vat, total, paid: 0, balance: total },
    message: "Thank you for your business.",
    terms: "Goods once sold will not be taken back. Warranty is provided by the manufacturer only. Payment due within 30 days of the invoice date.",
    status: "Open",
  };
}
