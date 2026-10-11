import { bankForCurrency, type CompanyBankFields } from "@/lib/bank-accounts";
import type { DocumentData, DocumentLine } from "@/lib/layout/document-data";
import { contactAddressLines } from "@/lib/contact-address";


export type CompanyBranding = {
  name: string; logoData: string; rightLogoData?: string; stampData?: string; phone: string; email?: string; trn: string;
  addressLine1: string; addressLine2: string; city: string; country: string;
} & CompanyBankFields;
type RecordData = Record<string, unknown>;

const text = (value: unknown) => value === null || value === undefined ? "" : String(value);
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const round = (value: number) => Math.round(value * 100) / 100;

/** Company details for a document; bank details follow the document currency when an account exists for it. */
export function companyDocumentData(setup: CompanyBranding, currency?: string): DocumentData["company"] {
  const bank = bankForCurrency(setup, currency || setup.bankCurrency || setup.baseCurrency);
  return {
    name: setup.name, addressLines: [setup.addressLine1, setup.addressLine2, [setup.city, setup.country].filter(Boolean).join(", ")].filter((line) => line.trim()),
    phone: setup.phone, email: setup.email ?? "", trn: setup.trn, leftLogo: setup.logoData, rightLogo: setup.rightLogoData ?? "", stamp: setup.stampData ?? "",
    bank: { name: bank?.bankName ?? "", accountName: bank?.accountName ?? "", accountNumber: bank?.accountNumber ?? "", iban: bank?.iban ?? "", swift: bank?.swift ?? "", stamp: bank?.stampData ?? "" },
  };
}

/** Map a saved invoice (record, posted lines, customer contact) onto the layout renderer's input. */
export function transactionDocumentData(record: RecordData, lines: RecordData[], contact: RecordData | null | undefined, setup: CompanyBranding): DocumentData {
  const documentLines: DocumentLine[] = lines.filter((line) => !line.isFreightCharge && !line.pending).map((line) => {
    const quantity = number(line.quantity); const unitPrice = number(line.unitPrice);
    const subtotal = line.subtotal !== undefined ? number(line.subtotal) : round(quantity * unitPrice);
    const vatAmount = number(line.vatAmount);
    return {
      sku: text(line.sku || line.itemNumber), description: text(line.description || line.itemDescription || line.name), quantity, unitPrice,
      serialNumber: text(line.serialNumber), comments: text(line.comments), subtotal, vatRate: number(line.vatRate), vatAmount,
      total: line.total !== undefined ? number(line.total) : round(subtotal + vatAmount),
    };
  });
  const total = number(record.total);
  const paid = number(record.paidAmount ?? record.amountPaid);
  const billingName = text(contact?.billingName || contact?.company || record.party);
  return {
    company: companyDocumentData(setup, text(record.currency)),
    billTo: [billingName, ...contactAddressLines({ addressLine1: contact?.addressLine1 || contact?.address, addressLine2: contact?.addressLine2 }, false), [...contactAddressLines({ city: contact?.city, region: contact?.region, postalCode: contact?.postalCode }, false), text(contact?.country)].filter(Boolean).join(", "), contact?.trn ? `TRN ${text(contact.trn)}` : ""].filter(Boolean),
    shipTo: text(record.deliveryAddress || contact?.shippingAddress).split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    details: {
      number: text(record.number), date: text(record.transactionDate), dueDate: text(record.dueDate), terms: text(record.terms || contact?.paymentTerms),
      salesman: text(record.salesman), reference: text(record.referenceNo || record.reference), trn: text(contact?.trn), source: text(record.sourceDocumentNumber), status: text(record.status),
    },
    currency: text(record.currency) || "AED",
    lines: documentLines,
    totals: { subtotal: number(record.subtotal), vat: number(record.vatAmount), total, paid, balance: record.balance !== undefined ? number(record.balance) : round(total - paid) },
    message: text(record.memo), terms: "", status: text(record.status),
  };
}

