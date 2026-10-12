import { sql, type SQL } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

type Executor={execute:(query:SQL)=>Promise<{rows:Record<string,unknown>[]}>};
const direct=['cargos','stock_holds','item_offers','inventory_locations','vat_codes','exchange_rates','memorised_reports','vat_adjustments','vat_returns','contacts','items','transactions','warranty_slips','rcm_declarations','inventory_check_reports','accounts','journal_entries','audit_log','packing_lists','staff_salary_sheets','item_logistics_options','income_tax_working_papers','record_attachments','warehouses','warehouse_stock','warehouse_transfers'];
const children:Record<string,[string,string]>={inventory_movements:['transactions','transaction_id'],transaction_lines:['transactions','transaction_id'],journal_lines:['journal_entries','journal_entry_id'],inventory_check_lines:['inventory_check_reports','report_id'],packing_list_lines:['packing_lists','packing_list_id'],invoice_payment_allocations:['transactions','payment_id'],bill_payment_allocations:['transactions','payment_id'],purchase_receipt_allocations:['transactions','receipt_id'],sales_invoice_allocations:['transactions','invoice_id']};
export const backupTables=['companies','company_settings',...direct,...Object.keys(children),'stock_transfers','specification_options','category_colors'];
export function backupScope(table:string,companyId:number):SQL {
  if(!backupTables.includes(table))throw new Error('Unsupported backup table.');
  if(table==='companies')return sql`t.id=${companyId}`;
  if(table==='specification_options'||table==='category_colors')return sql`true`;
  if(table==='stock_transfers')return sql`(t.source_company_id=${companyId} OR t.destination_company_id=${companyId})`;
  if(children[table]){const [parent,column]=children[table];return sql`EXISTS (SELECT 1 FROM ${sql.identifier(parent)} p WHERE p.id=t.${sql.identifier(column)} AND p.company_id=${companyId})`;}
  return sql`t.company_id=${companyId}`;
}
export async function companySnapshot(db:Executor,companyId:number,backupId:string) {
  const createdAt=new Date().toISOString();
  const tables:Record<string,Record<string,unknown>[]>={};let bytes=0,rows=0;
  for(const table of backupTables){
    const key=table==='company_settings'?'company_id':'id';let last=0;tables[table]=[];
    while(true){
      const result=await db.execute(sql`SELECT to_jsonb(t) - 'negative_stock_pin_hash' AS row FROM ${sql.identifier(table)} t WHERE ${backupScope(table,companyId)} AND t.${sql.identifier(key)}>${last} ORDER BY t.${sql.identifier(key)} LIMIT 10`);
      if(!result.rows.length)break;
      for(const resultRow of result.rows){const row=resultRow.row as Record<string,unknown>;bytes+=Buffer.byteLength(JSON.stringify(row));if(bytes>128*1024*1024)throw new Error('BACKUP_SIZE_LIMIT');tables[table].push(row);rows++;last=Number(row[key]);}
    }
  }
  if(tables.companies.length!==1)throw new Error('Company not found.');
  const manifest={format:'comnet-company-backup',version:1,backupId,companyId,companyName:tables.companies[0].name,createdAt,timeZone:'Asia/Dubai',schemaVersion:'0081',appRevision:process.env.VERCEL_GIT_COMMIT_SHA??null,scope:'Company business data and attachments; shared specification options, cross-company transfer references and historical stock-check details included for recovery context.',excluded:['Passwords, sessions and admin PINs','Global email credentials','Other companies’ master records and user accounts','Temporary locks, backup files and scheduler metadata'],rowCounts:Object.fromEntries(Object.entries(tables).map(([name,data])=>[name,data.length]))};
  const archive=gzipSync(Buffer.from(JSON.stringify({manifest,tables})),{level:6});
  if(archive.length>64*1024*1024)throw new Error('BACKUP_SIZE_LIMIT');
  return {archive,sha256:createHash('sha256').update(archive).digest('hex'),rowCount:rows,tableCount:backupTables.length,manifest};
}
