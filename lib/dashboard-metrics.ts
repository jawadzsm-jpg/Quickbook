type DashboardAccount = {
  id?: unknown;
  active?: boolean;
  type?: unknown;
  systemRole?: unknown;
  balance?: unknown;
  baseBalance?: unknown;
};

const incomeTypes = new Set(["Income", "Other Income"]);
const expenseTypes = new Set(["Expense", "Other Expense", "Cost of Goods Sold"]);

const amount = (account: DashboardAccount) => {
  const value = Number(account.baseBalance ?? account.balance ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const total = (accounts: DashboardAccount[], predicate: (account: DashboardAccount) => boolean) =>
  Math.round(accounts.filter((account) => account.active !== false && predicate(account)).reduce((sum, account) => sum + amount(account), 0) * 100) / 100;

export function dashboardMetrics(accounts: DashboardAccount[]) {
  const active = accounts.filter((account) => account.active !== false);
  const linkedInventory = active.filter((account) => String(account.systemRole) === "INVENTORY");
  return {
    cash: total(active, (account) => String(account.systemRole) === "BANK" || String(account.type) === "Bank"),
    receivable: total(active, (account) => String(account.systemRole) === "AR" || String(account.type) === "Accounts Receivable"),
    payable: total(active, (account) => String(account.systemRole) === "AP" || String(account.type) === "Accounts Payable"),
    inventory: linkedInventory.length
      ? total(linkedInventory, () => true)
      : total(active, (account) => ["Other Current Asset", "Other Asset"].includes(String(account.type)) && /inventory/i.test(String((account as { name?: unknown }).name ?? ""))),
    sales: total(active, (account) => incomeTypes.has(String(account.type))),
    expenses: total(active, (account) => expenseTypes.has(String(account.type))),
  };
}
