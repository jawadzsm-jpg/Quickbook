import { RequestError } from "./errors";
import { isIsoDate } from "./validation";

export type StaffSalaryLine = { employeeId: number | null; name: string; personalNumber: string; cardDetails: string; bankName: string; iban: string; salary: number };
export type StaffSalaryData = { title: string; referenceNo: string; month: string; startDate: string; endDate: string; companyCode: string; phone: string; currency: string; serviceFee: number; charges: number; notes: string; lines: StaffSalaryLine[] };
export type StaffLetterhead = { name: string; logoData: string; rightLogoData: string; addressLine1: string; addressLine2: string; city: string; country: string; phone: string; email: string; letterheadDesign: string; documentColor: string };
export type StaffSalaryRecord = { id: number; revision: number; data: StaffSalaryData; letterhead: StaffLetterhead };
const money = (value: unknown) => { const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new RequestError("Enter valid non-negative salary and charge amounts."); return Math.round(n * 100) / 100; };
export function staffSalaryTotals(data: StaffSalaryData) { const salary = Math.round(data.lines.reduce((sum, line) => sum + line.salary, 0) * 100) / 100; return { salary, charges: data.charges, grandTotal: Math.round((salary + data.charges) * 100) / 100 }; }
export function validateStaffSalaryData(value: unknown): StaffSalaryData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Enter salary sheet details.");
  const raw = value as Record<string, unknown>;
  const text = (v: unknown, max: number, required = false) => { if (typeof v !== "string" || v.length > max || (required && !v.trim())) throw new RequestError("Complete the salary sheet fields within their length limits."); return v.trim(); };
  const month = text(raw.month, 7, true), startDate = text(raw.startDate, 10, true), endDate = text(raw.endDate, 10, true);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate || !startDate.startsWith(month) || !endDate.startsWith(month)) throw new RequestError("Select a valid salary month and dates within that month.");
  const currency = text(raw.currency, 3, true).toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) throw new RequestError("Choose a three-letter currency.");
  if (!Array.isArray(raw.lines) || raw.lines.length < 1 || raw.lines.length > 200) throw new RequestError("Add between 1 and 200 employee rows.");
  const ids = new Set<number>();
  const lines = raw.lines.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new RequestError("Enter valid employee rows.");
    const row = entry as Record<string, unknown>; const employeeId = row.employeeId === null || row.employeeId === "" || row.employeeId === undefined ? null : Number(row.employeeId);
    if (employeeId !== null && (!Number.isSafeInteger(employeeId) || employeeId <= 0 || ids.has(employeeId))) throw new RequestError("Select each employee only once.");
    if (employeeId !== null) ids.add(employeeId);
    return { employeeId, name: text(row.name, 180, true), personalNumber: text(row.personalNumber, 60), cardDetails: text(row.cardDetails, 80), bankName: text(row.bankName, 120), iban: text(row.iban, 60), salary: money(row.salary) };
  });
  return { title: text(raw.title, 120, true), referenceNo: text(raw.referenceNo ?? "", 80), month, startDate, endDate, companyCode: text(raw.companyCode, 80), phone: text(raw.phone, 100), currency, serviceFee: money(raw.serviceFee), charges: money(raw.charges), notes: text(raw.notes, 1000), lines };
}

/** Stable filename uses the saved name and salary period, not the download date. */
export function staffSalaryFilename(record: StaffSalaryRecord) {
  const title = record.data.title.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 100) || "Staff Salary Sheet";
  return `${title}_${record.data.month}_${record.data.startDate}_to_${record.data.endDate}_HR-${record.id}.pdf`;
}
