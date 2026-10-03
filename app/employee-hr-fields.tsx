"use client";

type Account = { id: number; name?: unknown; code?: unknown; type?: unknown; active?: unknown; systemRole?: unknown };

export function EmployeeHrFields({ form, onChange, accounts }: { form: Record<string, string>; onChange: (form: Record<string, string>) => void; accounts: Account[] }) {
  const expenses = accounts.filter(account => account.active && account.type === "Expense");
  const fallback = expenses.find(account => account.systemRole === "PAYROLL");
  const update = (key: string, value: string) => onChange({ ...form, [key]: value });
  return <section className="employee-hr-fields sm:col-span-2"><h3>Salary, loan & vacation</h3><p>Amounts in {form.currency || "AED"}. Saving this profile does not post a payment or loan transaction.</p><div className="grid gap-4 sm:grid-cols-2"><label>Monthly salary<input type="number" min="0" max="1000000000000" step="0.01" value={form.salaryAmount || "0"} onChange={event => update("salaryAmount", event.target.value)} /></label><label>Recorded loan balance<input type="number" min="0" max="1000000000000" step="0.01" value={form.loanBalance || "0"} onChange={event => update("loanBalance", event.target.value)} /></label><label className="sm:col-span-2">Salary expense account<select value={form.salaryExpenseAccountId || String(fallback?.id || "")} onChange={event => update("salaryExpenseAccountId", event.target.value)}><option value="">Select salary expense account</option>{expenses.map(account => <option key={account.id} value={account.id}>{String(account.code)} · {String(account.name)}</option>)}</select></label><label>Vacation departure date<input type="date" value={form.vacationDeparture || ""} onChange={event => update("vacationDeparture", event.target.value)} /></label><label>Vacation return date<input type="date" min={form.vacationDeparture || undefined} value={form.vacationReturn || ""} onChange={event => update("vacationReturn", event.target.value)} /></label></div><p>Salary cheques for this employee use the linked expense account. Loan balances are maintained manually; payments and deductions do not update this field automatically.</p></section>;
}

export function EmployeeHrDetails({ record, accounts }: { record: Record<string, unknown>; accounts: Account[] }) {
  const account = accounts.find(account => account.id === Number(record.salaryExpenseAccountId));
  const amount = (value: unknown) => `${String(record.currency || "AED")} ${Number(value || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <dl className="employee-hr-details"><div><dt>Monthly salary</dt><dd>{amount(record.salaryAmount)}</dd></div><div><dt>Recorded loan</dt><dd>{amount(record.loanBalance)}</dd></div><div><dt>Salary account</dt><dd>{account ? `${account.code} · ${account.name}` : "Not configured"}</dd></div><div><dt>Vacation departure</dt><dd>{String(record.vacationDeparture || "—")}</dd></div><div><dt>Vacation return</dt><dd>{String(record.vacationReturn || "—")}</dd></div></dl>;
}
