import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, journalEntries, journalLines } from '@/db/schema';
import { calculateIncomeTax, validateTaxAccounts, type TaxConfig } from './income-tax';
import { linkReportAccounts } from './report-account-links';
export async function loadIncomeTax(companyId:number,currency:string,config:TaxConfig) {
  const db=getDb();
    const chart=await db.select().from(accounts).where(eq(accounts.companyId,companyId));
    validateTaxAccounts(config,chart,currency);
    const postings=await db.select({id:journalLines.id,accountName:journalLines.accountName,currency:journalEntries.currency,debit:journalLines.debit,credit:journalLines.credit}).from(journalLines).innerJoin(journalEntries,eq(journalEntries.id,journalLines.journalEntryId)).where(and(eq(journalEntries.companyId,companyId),eq(journalEntries.posted,true),gte(journalEntries.entryDate,config.from),lte(journalEntries.entryDate,config.to)));
    const linked=linkReportAccounts(postings.map(p=>({...p,currency:p.currency||currency})),[{key:'accountName',label:'Account'}],chart);
    return calculateIncomeTax(config,currency,chart,linked.rows.map(p=>({id:Number(p.id),accountName:String(p.accountName),currency:String(p.currency),debit:Number(p.debit),credit:Number(p.credit),accountId:Number(p.accountNameAccountId)||undefined})),linked.issues);
}
