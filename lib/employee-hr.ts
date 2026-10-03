import { isIsoDate } from "./validation";
import { RequestError } from "./errors";

export const employeeHrFields = ["salaryAmount", "salaryExpenseAccountId", "loanAccountId", "loanBalance", "vacationDeparture", "vacationReturn", "bankLoanPayments"] as const;
type HrAccount = { id: number; companyId: number; name: string; type: string; active: boolean; systemRole: string | null; currency: string };

export function employeeHrValues(payload: Record<string, unknown>, companyId: number, accounts: HrAccount[], existing: Record<string, unknown> = {}) {
  const value = (key: string) => payload[key] === undefined ? existing[key] : payload[key];
  const amount = (key: string) => {
    const number = Number(value(key) ?? 0);
    if (!Number.isFinite(number) || number < 0 || number > 1e12) throw new RequestError("Salary and recorded loan balance must be valid non-negative amounts.");
    return Math.round(number * 100) / 100;
  };
  const departure = String(value("vacationDeparture") ?? "");
  const returned = String(value("vacationReturn") ?? "");
  if ((departure && !isIsoDate(departure)) || (returned && !isIsoDate(returned))) throw new RequestError("Enter valid vacation dates.");
  if (returned && (!departure || returned < departure)) throw new RequestError("Vacation return must be on or after departure.");
  const salaryAmount = amount("salaryAmount");
  const requested = Number(value("salaryExpenseAccountId") || 0);
  const account = requested ? accounts.find(account => account.id === requested) : accounts.find(account => account.companyId === companyId && account.active && account.type === "Expense" && account.systemRole === "PAYROLL");
  if (requested && (!Number.isInteger(requested) || requested < 1)) throw new RequestError("Select a valid salary expense account.");
  if (account && (account.companyId !== companyId || !account.active || account.type !== "Expense" || accounts.filter(candidate => candidate.companyId === companyId && candidate.name === account.name).length !== 1)) throw new RequestError("Select an active, uniquely named Expense account in this company for salary.");
  if ((requested || salaryAmount > 0) && !account) throw new RequestError("Select an active salary expense account in this company.");
  const loanAccountId = employeeLoanAccount(value("loanAccountId"), companyId, String(value("currency") || "AED"), accounts)?.id ?? null;
  return { loanAccountId, salaryAmount, salaryExpenseAccountId: account?.id ?? null, loanBalance: amount("loanBalance"), vacationDeparture: departure, vacationReturn: returned };
}

export function redactEmployeeHr<T extends Record<string, unknown>>(record: T, allowed: boolean) {
  if (allowed) return record;
  const result = { ...record };
  for (const key of employeeHrFields) delete result[key];
  return result;
}


export function employeeLoanAccount(value: unknown, companyId: number, currency: string, accounts: HrAccount[]) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  const account = accounts.find(account => account.id === id);
  if (!Number.isSafeInteger(id) || id <= 0 || !account || account.companyId !== companyId || !account.active || account.type !== "Other Current Asset" || account.systemRole || account.currency !== currency || accounts.filter(candidate => candidate.companyId === companyId && candidate.name === account.name).length !== 1) throw new RequestError("Select an active, uniquely named loan/advance account of type Other Current Asset in this company and employee currency.");
  return account;
}
