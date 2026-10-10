// UAE e-invoicing readiness (Ministry of Finance framework: Peppol network, PINT-AE specification, structured XML, sent
// through an Accredited Service Provider). These checks only say what is missing; EasyBook does not create the XML yet.
// No database access, so screens and the server can share them.

export const MOF_EINVOICING_URL = "https://mof.gov.ae/en/about-us/initiatives/einvoicing/";

/** UAE Tax Registration Numbers have 15 digits (spaces and dashes ignored). */
export const isUaeTrn = (value: unknown) => /^\d{15}$/.test(String(value ?? "").replace(/[\s-]/g, ""));

type CompanyEInvoice = { trn?: string; addressLine1?: string; city?: string; country?: string; peppolParticipantId?: string; einvoiceAsp?: string };
type CustomerEInvoice = { name?: string; company?: string; billingName?: string; trn?: string; country?: string };
type InvoiceEInvoice = { number?: unknown; transactionDate?: unknown; currency?: unknown; exchangeRate?: unknown };

/** What the company still needs before it can send e-invoices. */
export function companyEInvoiceIssues(company: CompanyEInvoice) {
  const issues: string[] = [];
  if (!isUaeTrn(company.trn)) issues.push("Company TRN (15 digits)");
  if (!company.addressLine1?.trim() || !company.city?.trim()) issues.push("Company address and city");
  if (!company.country?.trim()) issues.push("Company country");
  if (!company.peppolParticipantId?.trim()) issues.push("Peppol participant ID");
  if (!company.einvoiceAsp?.trim()) issues.push("Accredited Service Provider");
  return issues;
}

/** A customer without a TRN is treated as B2C (outside the first B2B/B2G phase); otherwise list what is missing. */
export function customerEInvoiceStatus(customer: CustomerEInvoice): { status: "ready" | "b2c" | "issues"; issues: string[] } {
  const issues: string[] = [];
  if (!String(customer.billingName || customer.company || customer.name || "").trim()) issues.push("Customer legal name");
  if (!customer.country?.trim()) issues.push("Customer country");
  const trn = String(customer.trn ?? "").trim();
  if (trn && !isUaeTrn(trn) && (customer.country ?? "").toLowerCase().includes("emirates")) issues.push("Customer TRN must have 15 digits");
  if (issues.length) return { status: "issues", issues };
  return { status: trn ? "ready" : "b2c", issues: trn ? [] : ["No TRN: treated as B2C"] };
}

/** Readiness of one sales invoice: the company setup, the customer, and the invoice's own number, date and currency. */
export function invoiceEInvoiceStatus(invoice: InvoiceEInvoice, customer: CustomerEInvoice | undefined, company: CompanyEInvoice): { status: "ready" | "b2c" | "issues"; issues: string[] } {
  const issues = companyEInvoiceIssues(company).length ? ["Company e-invoicing setup incomplete"] : [];
  if (!String(invoice.number ?? "").trim() || !String(invoice.transactionDate ?? "").trim()) issues.push("Invoice number and date");
  if (String(invoice.currency ?? "AED") !== "AED" && !(Number(invoice.exchangeRate) > 0)) issues.push("Exchange rate to AED");
  if (!customer) return { status: "issues", issues: [...issues, "Customer not found in Customer Center"] };
  const buyer = customerEInvoiceStatus(customer);
  if (buyer.status === "issues") issues.push(...buyer.issues);
  if (issues.length) return { status: "issues", issues };
  return buyer.status === "b2c" ? { status: "b2c", issues: buyer.issues } : { status: "ready", issues: [] };
}
