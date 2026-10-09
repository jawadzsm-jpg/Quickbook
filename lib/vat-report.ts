export type VatRow = Record<string, string | number | null>;
export type VatColumn = { key: string; label: string; type?: "money" };
export const vatReportKeys = new Set(["vat-summary", "vat-detail", "vat-unassigned", "vat-exceptions", "vat-item-summary", "reverse-charge", "vat-code-list"]);
export const vatReportGroups = [
  { title: "VAT position & activity", description: "Review company-wide tax totals and the documents behind every VAT code.", keys: ["vat-summary", "vat-detail", "vat-item-summary"] },
  { title: "Review & reconciliation", description: "Find missing codes, calculation differences and reverse-charge purchases.", keys: ["vat-unassigned", "vat-exceptions", "reverse-charge"] },
  { title: "VAT code register", description: "Inspect current codes, rates, status and system control accounts.", keys: ["vat-code-list"] },
];
export const emptyVatFilters = { query: "", code: "", direction: "", account: "", status: "", sort: "default" };
export function filterVatRows<T extends VatRow>(rows: T[], columns: VatColumn[], filters: typeof emptyVatFilters) {
  const query = filters.query.trim().toLocaleLowerCase("en-AE");
  const result = rows.filter((row) => (!query || columns.some((column) => String(row[column.key] ?? "").toLocaleLowerCase("en-AE").includes(query))) && (["code", "direction", "account", "status"] as const).every((field) => !filters[field] || String(row[field] ?? "") === filters[field]));
  if (filters.sort === "vat") result.sort((a, b) => Math.abs(Number(b.vat ?? b.difference ?? b.amount ?? 0)) - Math.abs(Number(a.vat ?? a.difference ?? a.amount ?? 0)));
  if (filters.sort === "date") result.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  if (filters.sort === "code") result.sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? "")));
  return result;
}
export function vatColumnKind(column: VatColumn): "text" | "quantity" | "price" | "amount" {
  if (column.type === "money") return column.key === "unitPrice" ? "price" : "amount";
  return ["quantity", "rate"].includes(column.key) ? "quantity" : "text";
}
export function vatColumnWeight(column: VatColumn) {
  if (["description", "name", "account", "inputAccount", "outputAccount", "issue"].includes(column.key)) return 4;
  if (["party", "vendor"].includes(column.key)) return 3;
  if (["rate", "quantity"].includes(column.key)) return 1.5;
  if (["date", "code", "number"].includes(column.key)) return 2.6;
  return column.type === "money" ? 2.7 : 2.3;
}
export function vatColumnTotal(rows: VatRow[], column: VatColumn) {
  if (rows.some((row) => row.position) || !["quantity", "taxable", "vat", "expected", "posted", "difference"].includes(column.key)) return null;
  return rows.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0);
}
const total = (rows: VatRow[], key: string) => rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
const count = (rows: VatRow[], key: string) => new Set(rows.map((row) => row[key]).filter((value) => value !== null && value !== undefined && value !== "")).size;
const moneyCard = (label: string, value: number) => ({ label, value, format: "money" as const, tone: value < 0 ? "negative" : "accent" });
const numberCard = (label: string, value: number) => ({ label, value, format: "number" as const, tone: "neutral" });
export function vatSummary(report: { key?: string; rows: VatRow[] }) {
  if (!vatReportKeys.has(report.key || "")) return null;
  const { key, rows } = report;
  if (key === "vat-summary") {
    const labels: Record<string, string> = { output: "Output VAT incl. reverse charge", input: "Input VAT recorded", net: "Net VAT before adjustments", netAdjusted: "Net VAT after adjustments", outputDifference: "VAT Payable difference", inputDifference: "Recoverable VAT difference" };
    const cards = rows.filter((row) => labels[String(row.position)]).map((row) => moneyCard(labels[String(row.position)], Number(row.amount ?? 0)));
    return { cards: cards.length ? cards : [numberCard("Matching positions", 0)], note: "Company-wide document tax position in home currency, before manual adjustments. Includes credit-note reductions and reverse-charge output/input. This summary is not a completed VAT201 return; use VAT Management for adjustments and filing review. Control links show the current company VAT accounts." };
  }
  if (key === "vat-code-list") return { cards: [numberCard("VAT codes", rows.length), numberCard("Active", rows.filter((row) => row.status === "Active").length), numberCard("Inactive", rows.filter((row) => row.status === "Inactive").length)], note: "Current code register, independent of document dates. Input/output links show company system control accounts for taxable codes, not per-code posting overrides. Historical documents retain their saved code and rate." };
  if (key === "vat-exceptions") return { cards: [numberCard("Review lines", rows.length), moneyCard("Saved VAT", total(rows, "posted")), moneyCard("Expected at saved rate", total(rows, "expected")), moneyCard("Difference", total(rows, "difference"))], note: "Reviews saved VAT against taxable line value including freight and the saved rate, and flags missing/unknown codes or differences from current code rates. Credit notes reduce values. Review source documents before changing tax treatment." };
  return { cards: [moneyCard("Net line value before VAT", total(rows, "taxable")), moneyCard("Signed line VAT", total(rows, "vat")), numberCard(key === "vat-item-summary" ? "Item / code groups" : "Documents", key === "vat-item-summary" ? rows.length : count(rows, "transactionId")), numberCard("VAT codes", count(rows, "code"))], note: "Company-wide saved document lines in home currency; credit notes reduce values and freight is included in taxable value. Line VAT combines input and output activity and is not net VAT due. Actual posted VAT accounts and document numbers open their source history. Missing or multiple account matches require source review." };
}

type VatAccount = { id: number; code: string; name: string; currency: string; systemRole?: string | null };
type VatCode = { code: string; name: string; rate: number; description: string; active: boolean };
type VatLine = { lineId: number; transactionId: number; itemId: number | null; date: string; number: string; type: string; party: string; description: string; vatCode: string; vatRate: number; quantity: number; unitPrice: number; subtotal: number; freightCharge: number; vatAmount: number; exchangeRate: number; transactionCurrency: string; isImport: boolean; isFreightCharge: boolean };
type VatJournal = { transactionId: number | null; account: string; accountId?: number | null; debit: number; credit: number; date?: string };
/** Documents whose freight was saved as its own "Freight Charges" line (bills do this, with that line's own VAT). */
export function freightLineDocuments(lines: Array<{ transactionId: number; isFreightCharge?: boolean | null }>) {
  return new Set(lines.filter((line) => line.isFreightCharge).map((line) => line.transactionId));
}
/** Value before VAT. Line freight counts here only when the document has no separate freight line (older documents),
 * so freight is never taxed twice. */
export function vatTaxableValue(line: { subtotal: number; freightCharge?: number; transactionId?: number }, freightLines?: Set<number>) {
  const freightSeparate = freightLines && line.transactionId !== undefined && freightLines.has(line.transactionId);
  return Number(line.subtotal) + (freightSeparate ? 0 : Number(line.freightCharge || 0));
}
const cents = (value: number) => Math.round(value * 100) / 100;
/** UAE treatment: any code other than 5% must be zero-rated, exempt or out of scope; out-of-scope lines carry no VAT. */
export function vatTreatmentIssue(code: string, rate: number, vatAmount: number) {
  const upper = code.toUpperCase();
  if (Math.abs(rate - 5) > 0.001 && !["ZERO", "EXEMPT", "OUT_OF_SCOPE"].includes(upper)) return "Rate is not a UAE VAT treatment (5%, zero, exempt or out of scope)";
  if (upper === "OUT_OF_SCOPE" && Math.abs(vatAmount) > 0.001) return "Out-of-scope line carries VAT";
  return "";
}
export function vatSignedValues(line: Pick<VatLine, "type" | "subtotal" | "freightCharge" | "vatAmount" | "exchangeRate" | "quantity" | "isFreightCharge" | "transactionId">, freightLines?: Set<number>) {
  const sign = ["credit memo", "vendor credit"].includes(line.type) ? -1 : 1;
  return { taxable: sign * cents(vatTaxableValue(line, freightLines) * line.exchangeRate), vat: sign * cents(line.vatAmount * line.exchangeRate), quantity: line.isFreightCharge ? 0 : sign * line.quantity };
}
export function buildVatReport(key: string, lines: VatLine[], accounts: VatAccount[], journal: VatJournal[], codes: VatCode[], outputVat: number, inputVat: number, period: { start?: string; end?: string } = {}) {
  const money = { type: "money" as const };
  const freightLines = freightLineDocuments(lines);
  const control = (role: string, field = "account") => {
    const matches = accounts.filter((account) => account.systemRole === role);
    const account = matches.length === 1 ? matches[0] : undefined;
    return { [field]: account ? `${account.code} · ${account.name}` : "VAT control needs review", [`${field}AccountId`]: account?.id ?? 0 };
  };
  const names = new Map<string, VatAccount[]>();
  accounts.forEach((account) => names.set(account.name, [...(names.get(account.name) ?? []), account]));
  const journalById = new Map<number, Set<string>>();
  journal.forEach((entry) => { if (entry.transactionId && (entry.debit || entry.credit) && names.get(entry.account)?.some((account) => ["INPUT_VAT", "OUTPUT_VAT"].includes(account.systemRole || ""))) { const group = journalById.get(entry.transactionId) ?? new Set<string>(); group.add(entry.account); journalById.set(entry.transactionId, group); } });
  const postedAccount = (line: VatLine) => {
    const matches = [...(journalById.get(line.transactionId) ?? [])];
    if (matches.length !== 1) return { account: matches.length ? "Multiple VAT accounts · open source" : line.vatAmount ? "Posted VAT account needs review" : "No VAT posting", accountAccountId: 0, accountTransactionId: matches.length ? line.transactionId : 0 };
    const candidates = (names.get(matches[0]) ?? []).filter((account) => ["INPUT_VAT", "OUTPUT_VAT"].includes(account.systemRole || ""));
    const account = candidates.length === 1 ? candidates[0] : undefined;
    return { account: account ? `${account.code} · ${account.name}` : `${matches[0]} · account link needs review`, accountAccountId: account?.id ?? 0, accountTransactionId: 0 };
  };
  const codeMap = new Map(codes.map((code) => [code.code.toUpperCase(), code]));
  const direction = (line: VatLine) => ["invoice", "sales receipt", "statement charge", "credit memo"].includes(line.type) ? "Output" : line.isImport || ["REVERSE", "REVERSE_CHARGE", "RCM"].includes(line.vatCode.toUpperCase()) ? "Reverse charge / import" : "Input";
  const issue = (line: VatLine) => {
    const problems: string[] = [], code = codeMap.get(line.vatCode.toUpperCase());
    if (!code) problems.push(line.vatCode ? "Unknown VAT code" : "Missing VAT code");
    if (Math.abs(line.vatAmount - vatTaxableValue(line, freightLines) * line.vatRate / 100) > .011) problems.push("VAT calculation differs");
    if (code && Math.abs(code.rate - line.vatRate) > .001) problems.push("Saved rate differs from current code");
    const treatment = code ? vatTreatmentIssue(code.code, code.rate, line.vatAmount) : "";
    if (treatment) problems.push(treatment);
    return problems.join("; ");
  };
  const detail = (line: VatLine): VatRow => ({ transactionId: line.transactionId, lineId: line.lineId, itemId: line.itemId, date: line.date, number: line.number, type: line.type, party: line.party, description: line.description, code: line.vatCode || "Unassigned", rate: `${line.vatRate}%`, direction: direction(line), ...postedAccount(line), ...vatSignedValues(line, freightLines), unitPrice: line.unitPrice * line.exchangeRate, issue: issue(line) });
  const core: VatColumn[] = [{ key: "date", label: "Date" }, { key: "number", label: "Document" }, { key: "type", label: "Type" }, { key: "party", label: "Customer / supplier" }, { key: "description", label: "Item / description" }, { key: "code", label: "VAT code" }, { key: "rate", label: "Rate" }];
  const amounts: VatColumn[] = [{ key: "taxable", label: "Value before VAT", ...money }, { key: "vat", label: "Signed VAT", ...money }, { key: "account", label: "Posted VAT account" }];
  let title = "VAT Detail Report", rows: VatRow[] = lines.map(detail), columns: VatColumn[] = [...core, { key: "direction", label: "Tax direction" }, { key: "quantity", label: "Qty" }, { key: "unitPrice", label: "Unit price", ...money }, ...amounts];
  if (key === "vat-summary") {
    title = "VAT Position Summary";
    rows = [{ position: "output", name: "Output VAT including reverse charge / imports", amount: outputVat, ...control("OUTPUT_VAT") }, { position: "input", name: "Input VAT recorded", amount: inputVat, ...control("INPUT_VAT") }, { position: "net", name: "Net VAT before manual adjustments", amount: outputVat - inputVat, account: "Output less input", accountAccountId: 0 }];
    // Ledger reconciliation for the same period: posted movement on the VAT Payable (OUTPUT_VAT) and Recoverable VAT
    // (INPUT_VAT) accounts, and manual VAT adjustments (journals with no source document) shown separately.
    const roleAccount = (role: string) => { const matches = accounts.filter((account) => account.systemRole === role); return matches.length === 1 ? matches[0] : undefined; };
    const outputAccount = roleAccount("OUTPUT_VAT"), inputAccount = roleAccount("INPUT_VAT");
    const onAccount = (entry: VatJournal, account?: VatAccount) => Boolean(account) && (entry.accountId ? entry.accountId === account!.id : entry.account === account!.name);
    const inPeriod = (entry: VatJournal) => (!period.start || !entry.date || entry.date >= period.start) && (!period.end || !entry.date || entry.date <= period.end);
    const periodJournal = journal.filter(inPeriod);
    const sumOf = (entries: VatJournal[], account: VatAccount | undefined, sign: 1 | -1) => cents(entries.filter((entry) => onAccount(entry, account)).reduce((total, entry) => total + sign * (Number(entry.credit) - Number(entry.debit)), 0));
    const ledgerOutput = sumOf(periodJournal, outputAccount, 1), ledgerInput = sumOf(periodJournal, inputAccount, -1);
    const manual = periodJournal.filter((entry) => !entry.transactionId);
    const adjustOutput = sumOf(manual, outputAccount, 1), adjustInput = sumOf(manual, inputAccount, -1);
    const link = (account?: VatAccount) => ({ account: account ? `${account.code} · ${account.name}` : "VAT control needs review", accountAccountId: account?.id ?? 0 });
    rows.push(
      { position: "adjustments", name: "Manual VAT adjustments (journals, output less input)", amount: cents(adjustOutput - adjustInput), account: "Journal entries without a source document", accountAccountId: 0 },
      { position: "netAdjusted", name: "Net VAT after manual adjustments", amount: cents(outputVat - inputVat + adjustOutput - adjustInput), account: "Net VAT position", accountAccountId: 0 },
      { position: "ledgerOutput", name: "VAT Payable ledger movement", amount: ledgerOutput, ...link(outputAccount) },
      { position: "outputDifference", name: "Difference: output VAT + adjustments vs VAT Payable ledger", amount: cents(outputVat + adjustOutput - ledgerOutput), ...link(outputAccount) },
      { position: "ledgerInput", name: "Recoverable VAT ledger movement", amount: ledgerInput, ...link(inputAccount) },
      { position: "inputDifference", name: "Difference: input VAT + adjustments vs Recoverable VAT ledger", amount: cents(inputVat + adjustInput - ledgerInput), ...link(inputAccount) },
    );
    columns = [{ key: "name", label: "VAT position" }, { key: "account", label: "Company VAT control" }, { key: "amount", label: "Amount", ...money }];
  } else if (key === "vat-unassigned") {
    title = "Unassigned VAT Amounts Detail Report"; rows = lines.filter((line) => !codeMap.has(line.vatCode.toUpperCase())).map(detail); columns = [...core, { key: "issue", label: "Review reason" }, ...amounts];
  } else if (key === "vat-exceptions") {
    title = "VAT Exception Report"; rows = lines.filter((line) => issue(line)).map((line) => { const signed = vatSignedValues(line, freightLines), expected = (["credit memo", "vendor credit"].includes(line.type) ? -1 : 1) * vatTaxableValue(line, freightLines) * line.vatRate / 100 * line.exchangeRate; return { ...detail(line), expected, posted: signed.vat, difference: signed.vat - expected }; });
    columns = [...core, { key: "issue", label: "Review reason" }, { key: "expected", label: "Expected VAT", ...money }, { key: "posted", label: "Saved VAT", ...money }, { key: "difference", label: "Difference", ...money }, { key: "account", label: "Posted VAT account" }];
  } else if (key === "vat-item-summary") {
    title = "VAT Item Summary"; const groups = new Map<string, VatRow>();
    lines.forEach((line) => { const groupKey = JSON.stringify([line.itemId || line.description, line.vatCode, line.vatRate, direction(line)]), values = vatSignedValues(line, freightLines), old = groups.get(groupKey) ?? { name: line.description, code: line.vatCode || "Unassigned", rate: `${line.vatRate}%`, direction: direction(line), quantity: 0, taxable: 0, vat: 0 }; groups.set(groupKey, { ...old, quantity: Number(old.quantity) + values.quantity, taxable: Number(old.taxable) + values.taxable, vat: Number(old.vat) + values.vat }); });
    rows = [...groups.values()]; columns = [{ key: "name", label: "Item / description" }, { key: "code", label: "VAT code" }, { key: "rate", label: "Rate" }, { key: "direction", label: "Tax direction" }, { key: "quantity", label: "Qty" }, ...amounts.filter((column) => column.key !== "account")];
  } else if (key === "reverse-charge") {
    title = "Reverse Charge and Import VAT List"; rows = lines.filter((line) => direction(line) === "Reverse charge / import").map(detail); columns = [...core, { key: "direction", label: "Tax direction" }, ...amounts];
  } else if (key === "vat-code-list") {
    title = "VAT Code List"; rows = codes.map((code) => ({ code: code.code, name: code.name, rate: `${code.rate}%`, description: code.description, status: code.active ? "Active" : "Inactive", ...(code.rate > 0 ? { ...control("INPUT_VAT", "inputAccount"), ...control("OUTPUT_VAT", "outputAccount") } : { inputAccount: "—", outputAccount: "—" }) }));
    columns = [{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "rate", label: "Rate" }, { key: "description", label: "Details" }, { key: "status", label: "Status" }, { key: "inputAccount", label: "System input VAT control" }, { key: "outputAccount", label: "System output VAT control" }];
  }
  return { title, rows, columns };
}
