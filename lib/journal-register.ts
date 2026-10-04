import type { ReportExportData } from './report-export';

export type JournalLine = { id: number; accountName: string; accountId?: number | null; accountCode?: string; accountCurrency?: string; debit: number; credit: number; originalDebit: number | null; originalCredit: number | null };
export type JournalEntry = { currency: string | null; exchangeRate: number; id: number; entryDate: string; reference: string; description: string; transactionId: number | null; source: 'Manual' | 'Transaction' | 'Stock revaluation' | 'Automatic'; canManage: boolean; revision: string; debit: number; credit: number; lines: JournalLine[] };
export type JournalFilters = { query: string; source: string; account: string; currency: string };
export const emptyJournalFilters: JournalFilters = { query: '', source: '', account: '', currency: '' };
const round = (n: number) => Math.round(n * 100) / 100;

export function filterJournals(entries: JournalEntry[], filters: JournalFilters, homeCurrency: string) {
  const query = filters.query.trim().toLocaleLowerCase();
  return entries.filter(entry => (!filters.source || entry.source === filters.source) &&
    (!filters.currency || (entry.currency || homeCurrency) === filters.currency) &&
    (!filters.account || entry.lines.some(line => String(line.accountId || '') === filters.account)) &&
    (!query || [entry.reference, entry.description, entry.source, entry.entryDate, entry.currency || homeCurrency, ...entry.lines.flatMap(line => [line.accountName, line.accountCode || ''])].some(value => value.toLocaleLowerCase().includes(query))));
}
export function journalTotals(entries: JournalEntry[]) {
  return { count: entries.length, debit: round(entries.reduce((n, e) => n + e.debit, 0)), credit: round(entries.reduce((n, e) => n + e.credit, 0)), unbalanced: entries.filter(e => Math.abs(round(e.debit - e.credit)) >= 0.01).length };
}
export function journalReport(entries: JournalEntry[], currency: string, from: string, to: string, filters: JournalFilters, detail = false): ReportExportData {
  const period = [from ? `From ${from}` : '', to ? `Through ${to}` : '', filters.query ? `Search: ${filters.query}` : '', filters.source, filters.currency ? `Entry currency: ${filters.currency}` : '', filters.account ? `Account: ${entries.flatMap(e=>e.lines).find(l=>String(l.accountId)===filters.account)?.accountName || filters.account} (complete journals)` : ''].filter(Boolean).join(' · ') || 'All dates';
  const baseColumns = [{key:'date',label:'Date'},{key:'reference',label:'Reference'},{key:'description',label:'Description'},{key:'source',label:'Source'}];
  const amounts = [{key:'debit',label:`Debit (${currency})`,type:'money' as const},{key:'credit',label:`Credit (${currency})`,type:'money' as const}];
  return { key: detail ? 'posted-journal-lines' : 'posted-journals', title: detail ? 'Posted Journal Account Detail' : 'Posted Journal Entries', generatedAt:new Date().toISOString(), currency, period:{label:period},
    accountLinkIssues:[...new Set(entries.flatMap(e=>e.lines.filter(l=>!l.accountId).map(l=>`Account “${l.accountName}” has no unique Chart of Accounts link. Recorded amounts are retained.`)))],
    columns: [...baseColumns, ...(detail ? [{key:'account',label:'Account'}] : [{key:'entryCurrency',label:'Entry currency'}]), ...amounts],
    rows: entries.flatMap(e=>{ const header={entryId:e.id,date:e.entryDate,reference:e.reference,description:e.description,source:e.source,entryCurrency:e.currency || currency}; return detail ? e.lines.map(l=>({...header,account:`${l.accountCode ? `${l.accountCode} · ` : ''}${l.accountName}${l.accountCurrency ? ` (${l.accountCurrency})` : ''}`,debit:l.debit,credit:l.credit})) : [{...header,debit:e.debit,credit:e.credit}]; }) };
}
export function journalReportSummary(report: Pick<ReportExportData,'key'|'rows'>) {
  if (!['posted-journals','posted-journal-lines'].includes(report.key || '')) return null;
  const debit=round(report.rows.reduce((n,r)=>n+Number(r.debit||0),0)), credit=round(report.rows.reduce((n,r)=>n+Number(r.credit||0),0));
  return { cards:[{label:'Journal entries',value:new Set(report.rows.map(r=>r.entryId)).size,format:'number' as const},{label:'Total debits',value:debit,format:'money' as const},{label:'Total credits',value:credit,format:'money' as const},{label:'Difference',value:round(debit-credit),format:'money' as const}].map(card=>({...card,tone:'neutral' as const})), note:'Home-currency totals cover all matching complete journals, including all their accounts. Screen pagination does not limit exports. Entries with identical references remain separate journals.' };
}
