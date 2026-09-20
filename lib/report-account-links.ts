export type ReportAccount = { id: number; code: string; name: string; currency: string };
export type ReportAccountColumn = { key: string; label: string };
export type ReportAccountRow = Record<string, string | number | null>;

function accountColumn(column: ReportAccountColumn) {
  return /account/i.test(column.key) || (/account/i.test(column.label) && ["name", "parent"].includes(column.key));
}

function normalized(value: unknown) {
  return String(value ?? "").trim();
}

export function linkReportAccounts(rows: ReportAccountRow[], columns: ReportAccountColumn[], accounts: ReportAccount[]) {
  const candidatesByName = new Map<string, ReportAccount[]>();
  const candidatesByCode = new Map<string, ReportAccount[]>();
  for (const account of accounts) {
    candidatesByName.set(account.name, [...(candidatesByName.get(account.name) ?? []), account]);
    candidatesByCode.set(account.code, [...(candidatesByCode.get(account.code) ?? []), account]);
  }
  const issues = new Set<string>();
  const linkedRows = rows.map((row) => {
    const linked = { ...row };
    for (const column of columns.filter(accountColumn)) {
      if (Number(linked[`${column.key}AccountId`]) > 0) continue;
      const raw = normalized(row[column.key]);
      if (!raw || raw === "—") continue;
      const coded = raw.match(/^([^·]+?)\s*·\s*(.+)$/);
      const parenthesized = raw.match(/^(.*?)\s+\(([A-Z]{3})\)$/);
      const name = coded?.[2].trim() || parenthesized?.[1].trim() || raw;
      const explicitCurrency = normalized(row.accountCurrency || row.currency || parenthesized?.[2]).toUpperCase();
      let candidates = coded ? (candidatesByCode.get(coded[1].trim()) ?? []).filter((account) => account.name === name) : candidatesByName.get(name) ?? [];
      if (candidates.length > 1 && explicitCurrency) candidates = candidates.filter((account) => account.currency.toUpperCase() === explicitCurrency);
      if (candidates.length === 1) linked[`${column.key}AccountId`] = candidates[0].id;
      else if (candidates.length > 1) issues.add(`Account “${raw}” has duplicate Chart of Accounts matches. No account link was selected.`);
    }
    return linked;
  });
  return { rows: linkedRows, issues: [...issues] };
}
