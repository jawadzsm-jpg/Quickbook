import type { ReportExportData } from "./report-export";

export type RecordListKind = "transactions" | "contacts" | "items" | "accounts";
export type RecordListRow = Record<string, string | number | boolean>;

const titles: Record<string, string> = {
  sales: "Sales Transactions",
  purchases: "Purchase Transactions",
  banking: "Banking Transactions",
  "write-cheque": "Cheque Register",
  "receive-payment": "Customer Payments",
  customers: "Customer List",
  vendors: "Vendor List",
  employees: "Employee List",
  inventory: "Inventory List",
  accounts: "Chart of Accounts",
};

export function filterRecordListByDate<T extends RecordListRow>(records: T[], kind: RecordListKind, dateFrom: string, dateTo: string): T[] {
  if (kind !== "transactions" || (!dateFrom && !dateTo)) return records;
  return records.filter((record) => {
    const transactionDate = String(record.transactionDate || "");
    return Boolean(transactionDate) && (!dateFrom || transactionDate >= dateFrom) && (!dateTo || transactionDate <= dateTo);
  });
}

function periodLabel(dateFrom: string, dateTo: string) {
  if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`;
  if (dateFrom) return `From ${dateFrom}`;
  if (dateTo) return `Through ${dateTo}`;
  return "All dates";
}

export function recordListReport(view: string, kind: RecordListKind, records: RecordListRow[], currency: string, dateFrom: string, dateTo: string, generatedAt = new Date().toISOString()): ReportExportData {
  const title = titles[view] || `${view.replaceAll("-", " ")} List`.replace(/\b\w/g, (letter) => letter.toUpperCase());
  const period = { label: kind === "transactions" ? periodLabel(dateFrom, dateTo) : "Current list" };

  if (kind === "transactions") return {
    title, generatedAt, currency, period,
    columns: [
      { key: "date", label: "Date" }, { key: "type", label: "Type" }, { key: "number", label: "Reference" },
      { key: "name", label: "Name" }, { key: "status", label: "Status" }, { key: "currency", label: "Currency" },
      { key: "amount", label: "Amount", type: "money" },
    ],
    rows: records.map((record) => ({ date: String(record.transactionDate || ""), type: String(record.type || ""), number: String(record.number || ""), name: String(record.party || ""), status: String(record.status || ""), currency: String(record.currency || currency), amount: Number(record.total || 0) })),
  };

  if (kind === "contacts") return {
    title, generatedAt, currency, period,
    columns: [
      { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "currency", label: "Currency" },
      { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "status", label: "Status" },
      { key: "balance", label: "Balance", type: "money" },
    ],
    rows: records.map((record) => ({ name: String(record.name || ""), company: String(record.company || ""), currency: String(record.currency || currency), email: String(record.email || ""), phone: String(record.phone || ""), status: String(record.status || ""), balance: Number(record.balance || 0) })),
  };

  if (kind === "items") return {
    title, generatedAt, currency, period,
    columns: [
      { key: "itemNumber", label: "Item No." }, { key: "sku", label: "SKU" }, { key: "name", label: "Item" },
      { key: "category", label: "Category" }, { key: "quantity", label: "On Hand" }, { key: "reorderPoint", label: "Reorder" },
      { key: "salesPrice", label: "Sales Price", type: "money" }, { key: "cost", label: "Average Cost", type: "money" },
    ],
    rows: records.map((record) => ({ itemNumber: String(record.itemNumber || ""), sku: String(record.sku || ""), name: String(record.name || ""), category: String(record.category || ""), quantity: Number(record.quantity || 0), reorderPoint: Number(record.reorderPoint || 0), salesPrice: Number(record.salesPrice || 0), cost: Number(record.cost || 0) })),
  };

  return {
    title, generatedAt, currency, period,
    columns: [
      { key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "linkedUse", label: "Linked Use" },
      { key: "currency", label: "Currency" }, { key: "type", label: "Type" }, { key: "status", label: "Status" },
      { key: "balance", label: "Balance", type: "money" },
    ],
    rows: records.map((record) => ({ code: String(record.code || ""), name: String(record.name || ""), linkedUse: String(record.systemRole || "Unlinked"), currency: String(record.currency || currency), type: String(record.type || ""), status: record.active ? "Active" : "Inactive", balance: Number(record.balance || 0) })),
  };
}
