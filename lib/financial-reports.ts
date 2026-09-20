import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, journalEntries, journalLines, transactions, exchangeRates, invoicePaymentAllocations, billPaymentAllocations } from '@/db/schema';
import { previousYearDate, reportMonths, reportPeriod, reportToday } from './report-period';

export const financialKeys = ['income-customer-summary','income-customer-detail','expenses-supplier-summary','expenses-supplier-detail','income-expense-graph','realised-gains-losses','unrealised-gains-losses','balance-sheet','balance-sheet-detail','balance-sheet-summary','balance-sheet-prev-year','net-worth-graph','cash-flow','cash-flow-forecast'];
type Row = Record<string, string | number>;
const income = new Set(['Income','Other Income']);
const expense = new Set(['Expense','Other Expense','Cost of Goods Sold']);
const assets = new Set(['Bank','Accounts Receivable','Other Current Asset','Fixed Asset','Other Asset']);
const liabilities = new Set(['Accounts Payable','Other Current Liability','Long Term Liability','Loan','Credit Card']);
const round = (n:number) => Math.round((n + Number.EPSILON)*100)/100;
const col = (key:string,label:string,type?:'money') => ({key,label,...(type?{type}:{})});
const money = (key:string,label:string) => col(key,label,'money');
export type FinancialReportData = { companyId:number; currency:string; title:string; columns:ReturnType<typeof col>[]; rows:Row[]; financial:{canViewAccounts:boolean;details:Row[];issues:string[];note:string} };

export async function financialReport(companyId:number,locationId:number,currency:string,params:URLSearchParams,canViewAccounts:boolean) {
 const key=params.get('type')!; const from=params.get('periodStart')||''; const to=params.get('periodEnd')||'';
 const db=getDb();
 const [chart,entries,docs,rates,invoiceAllocations,billAllocations]=await Promise.all([
  db.select().from(accounts).where(eq(accounts.companyId,companyId)).orderBy(asc(accounts.code)),
  db.select({entryId:journalEntries.id,transactionId:journalEntries.transactionId,locationId:journalEntries.locationId,date:journalEntries.entryDate,reference:journalEntries.reference,account:journalLines.accountName,debit:journalLines.debit,credit:journalLines.credit,entryCurrency:journalEntries.currency}).from(journalLines).innerJoin(journalEntries,eq(journalEntries.id,journalLines.journalEntryId)).where(and(eq(journalEntries.companyId,companyId),eq(journalEntries.posted,true))).orderBy(asc(journalEntries.entryDate),asc(journalLines.id)),
  db.select().from(transactions).where(eq(transactions.companyId,companyId)),
  db.select().from(exchangeRates).where(and(eq(exchangeRates.companyId,companyId),eq(exchangeRates.active,true))),
  db.select({paymentId:invoicePaymentAllocations.paymentId,documentId:invoicePaymentAllocations.invoiceId,amount:invoicePaymentAllocations.amount}).from(invoicePaymentAllocations).innerJoin(transactions,eq(transactions.id,invoicePaymentAllocations.paymentId)).where(eq(transactions.companyId,companyId)),
  db.select({paymentId:billPaymentAllocations.paymentId,documentId:billPaymentAllocations.billId,amount:billPaymentAllocations.amount}).from(billPaymentAllocations).innerJoin(transactions,eq(transactions.id,billPaymentAllocations.paymentId)).where(eq(transactions.companyId,companyId)),
 ]);
 // Journal lines store names. Never choose an arbitrary account when names collide.
 const byName=new Map<string,typeof chart>();for(const a of chart)byName.set(a.name,[...(byName.get(a.name)||[]),a]);
 const accountFor=(name:string,entryCurrency?:string|null)=>{
  const matches=byName.get(name)||[];
  if(matches.length===1)return matches[0];
  if(!entryCurrency)return undefined;
  const currencyMatches=matches.filter(a=>a.currency===entryCurrency);
  return currencyMatches.length===1?currencyMatches[0]:undefined;
 };
 const selected=entries.filter(e=>!locationId||e.locationId===locationId);
 const inRange=(date:string)=> (!from||date>=from)&&(!to||date<=to);
 const docMap=new Map(docs.map(d=>[d.id,d]));
 const issues=new Set<string>();
 for(const e of selected.filter(e=>!to||e.date<=to))if(!accountFor(e.account,e.entryCurrency))issues.add(`Account ${e.account} has ${byName.has(e.account)?'multiple matches in the same currency or no unique currency match':'no match'} in this company’s Chart of Accounts.`);
 const linked=(e:typeof entries[number]):Row=>{const a=accountFor(e.account,e.entryCurrency);const d=docMap.get(e.transactionId||0);return {date:e.date,reference:e.reference,account:e.account,accountId:a?.id||0,transactionId:d?.id||0,name:d?.party||'Unallocated',type:d?.type||'Manual journal',debit:e.debit,credit:e.credit,amount:round(e.debit-e.credit)};};
 const period=reportPeriod(key,from,to);
 const result:FinancialReportData & {key:string;period:typeof period;generatedAt:string;chart?:{labelKey:string;incomeKey:string;expenseKey:string}}={key,period,companyId,currency,title:'',generatedAt:new Date().toISOString(),columns:[],rows:[],financial:{canViewAccounts,details:[],issues:[],note:''}};
 const baseColumns=[col('date','Date'),col('reference','Reference'),col('name','Name'),col('account','Account')];
 const isPnl=(e:typeof entries[number])=>{const t=accountFor(e.account,e.entryCurrency)?.type||'';return income.has(t)||expense.has(t);};
 const pnlValue=(e:typeof entries[number])=>income.has(accountFor(e.account,e.entryCurrency)?.type||'')?e.credit-e.debit:e.debit-e.credit;
 if(key.startsWith('income-customer')||key.startsWith('expenses-supplier')||key==='income-expense-graph') {
  const wantIncome=key.startsWith('income-customer');
  const details:Row[]=selected.filter(e=>inRange(e.date)&&isPnl(e)&&(key==='income-expense-graph'||(wantIncome?income:expense).has(accountFor(e.account,e.entryCurrency)!.type))).map(e=>({...linked(e),amount:round(pnlValue(e)),section:income.has(accountFor(e.account,e.entryCurrency)!.type)?'Income':'Expenses'}));
  result.financial.details=details;
  if(key==='income-expense-graph') {
   result.title='Income & Expense Graph';const groups=new Map<string,{month:string;income:number;expenses:number}>();
   for(const r of details){const month=String(r.date).slice(0,7),g=groups.get(month)||{month,income:0,expenses:0};g[r.section==='Income'?'income':'expenses']+=Number(r.amount);groups.set(month,g);}
   result.rows=[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(g=>({...g,income:round(g.income),expenses:round(g.expenses),net:round(g.income-g.expenses)}));result.columns=[col('month','Month'),money('income','Income'),money('expenses','Expenses'),money('net','Net')];result.chart={labelKey:'month',incomeKey:'income',expenseKey:'expenses'};
  }else{
   const summary=key.endsWith('summary');result.title=`${wantIncome?'Income by Customer':'Expenses by Supplier'} ${summary?'Summary':'Detail'}`;
   if(summary){const groups=new Map<string,number>();for(const r of details)groups.set(String(r.name),(groups.get(String(r.name))||0)+Number(r.amount));result.rows=[...groups].map(([name,amount])=>({name,amount:round(amount)}));result.columns=[col('name',wantIncome?'Customer':'Supplier'),money('amount',wantIncome?'Income':'Expenses')];}
   else{result.rows=details;result.columns=[...baseColumns,money('amount',wantIncome?'Income':'Expenses')];}
  }
 }else if(key.startsWith('balance-sheet')||key==='net-worth-graph'){
  const balances=(end:string)=>{
   const totals=new Map<number,{debit:number;credit:number}>();let earnings=0;
   for(const e of selected.filter(e=>!end||e.date<=end)){const a=accountFor(e.account,e.entryCurrency);if(!a)continue;const b=totals.get(a.id)||{debit:0,credit:0};b.debit+=e.debit;b.credit+=e.credit;totals.set(a.id,b);if(isPnl(e))earnings+=e.credit-e.debit;}
   const rows:Row[]=chart.filter(a=>assets.has(a.type)||liabilities.has(a.type)||a.type==='Equity').map(a=>{const b=totals.get(a.id)||{debit:0,credit:0};const duplicate=(byName.get(a.name)?.length||0)>1;return {name:duplicate?`${a.name} (${a.currency})`:a.name,account:a.name,accountId:a.id,currency:a.currency,section:assets.has(a.type)?'Assets':liabilities.has(a.type)?'Liabilities':'Equity',debit:round(b.debit),credit:round(b.credit),amount:round((assets.has(a.type)?1:-1)*(b.debit-b.credit))};});
   rows.push({name:'Accumulated earnings',section:'Equity',amount:round(earnings),debit:0,credit:round(earnings)});return rows;
  };
  const current=balances(to);
  result.financial.details=selected.filter(e=>!to||e.date<=to).map(linked);
  if(key==='net-worth-graph'){
   result.title='Net Worth Graph';const end=to||reportToday();result.rows=reportMonths(from||`${end.slice(0,4)}-01-01`,end).map(({month,to})=>{const b=balances(to);const total=(section:string)=>round(b.filter(r=>r.section===section).reduce((n,r)=>n+Number(r.amount),0));return {month,assets:total('Assets'),liabilities:total('Liabilities'),netWorth:round(total('Assets')-total('Liabilities'))};});result.columns=[col('month','Month'),money('assets','Assets'),money('liabilities','Liabilities'),money('netWorth','Net Worth')];result.chart={labelKey:'month',incomeKey:'assets',expenseKey:'liabilities'};
  }else if(key==='balance-sheet-summary'){
   result.title='Balance Sheet Summary';result.rows=['Assets','Liabilities','Equity'].map(section=>({section,amount:round(current.filter(r=>r.section===section).reduce((n,r)=>n+Number(r.amount),0))}));result.columns=[col('section','Section'),money('amount','Balance')];
  }else if(key==='balance-sheet-prev-year'){
   result.title='Balance Sheet Prev Year Comparison';const end=to||reportToday(),prior=balances(previousYearDate(end)),now=balances(end);result.rows=now.map((r,i)=>({...r,current:r.amount,previous:prior[i].amount,change:round(Number(r.amount)-Number(prior[i].amount))}));result.columns=[col('section','Section'),col('name','Account'),money('previous',previousYearDate(end)),money('current',end),money('change','Change')];
  }else{result.title=key==='balance-sheet-detail'?'Balance Sheet Detail':'Balance Sheet Standard';result.rows=current;result.columns=[col('section','Section'),col('name','Account'),...(key==='balance-sheet-detail'?[money('debit','Debit'),money('credit','Credit')]:[]),money('amount','Balance')];}
 }else if(key==='cash-flow'){
  result.title='Statement of Cash Flows';const bank=(e:typeof entries[number])=>accountFor(e.account,e.entryCurrency)?.type==='Bank';
  const opening=round(selected.filter(e=>bank(e)&&from&&e.date<from).reduce((n,e)=>n+e.debit-e.credit,0));
  const groups=new Map<number,typeof entries>();for(const e of selected.filter(e=>inRange(e.date)))groups.set(e.entryId,[...(groups.get(e.entryId)||[]),e]);
  const details:Row[]=[];
  for(const group of groups.values()){
   const cash=group.filter(bank),net=round(cash.reduce((n,e)=>n+e.debit-e.credit,0));if(!cash.length)continue;
   const categories=new Set(group.filter(e=>!bank(e)&&(e.debit||e.credit)).map(e=>{const t=accountFor(e.account,e.entryCurrency)?.type;return !t?'Unclassified':t==='Fixed Asset'||t==='Other Asset'?'Investing':['Equity','Loan','Long Term Liability'].includes(t)?'Financing':'Operating';}));
   const section=!net?'Internal transfers':categories.size===1?[...categories][0]:'Mixed / unclassified';
   for(const e of cash)details.push({...linked(e),section});
  }
  result.financial.details=details;
  const movement=round(details.reduce((n,r)=>n+Number(r.amount),0));
  result.rows=[{name:'Opening cash',amount:opening},...['Operating','Investing','Financing','Mixed / unclassified','Internal transfers'].map(name=>({name,amount:round(details.filter(r=>r.section===name).reduce((n,r)=>n+Number(r.amount),0))})),{name:'Net cash movement',amount:movement},{name:'Closing cash',amount:round(opening+movement)}];result.columns=[col('name','Activity'),money('amount','Amount')];
 }else{
  // Settlement allocations are document-currency amounts. Status labels never prove payment.
  const asOf=key==='cash-flow-forecast'?reportToday():to||reportToday();
  const postedEntries=entries.filter(e=>e.date<=asOf);
  const postingsByDocument=new Map<number,typeof entries>();
  for(const e of postedEntries)if(e.transactionId)postingsByDocument.set(e.transactionId,[...(postingsByDocument.get(e.transactionId)||[]),e]);
  const postedIds=new Set(postingsByDocument.keys());
  const validDocs=docs.filter(d=>d.transactionDate<=asOf&&postedIds.has(d.id)&&!['draft','void','voided','cancelled','canceled'].includes(d.status));
  const validMap=new Map(validDocs.map(d=>[d.id,d]));
  const control=(d:typeof docs[number])=>{const names=new Set((postingsByDocument.get(d.id)||[]).filter(e=>['Accounts Receivable','Accounts Payable'].includes(accountFor(e.account,e.entryCurrency)?.type||'')).map(e=>e.account));return names.size===1?accountFor([...names][0]):undefined;};
  const allocations=[...invoiceAllocations,...billAllocations];
  for(const d of validDocs){const documentId=d.billId||d.invoiceId;if(documentId&&!allocations.some(a=>a.paymentId===d.id))allocations.push({paymentId:d.id,documentId,amount:d.total});}
  const used=new Map<number,number>();const settled:Row[]=[];
  for(const allocation of allocations){const payment=validMap.get(allocation.paymentId),document=validMap.get(allocation.documentId);if(!payment||!document||payment.currency!==document.currency||payment.party!==document.party)continue;
   const a=control(document),p=control(payment);if(!a||!p||a.id!==p.id||!['customer payment','bill payment','vendor payment','cheque'].includes(payment.type)||!['invoice','bill','received item bill','statement charge','finance charge'].includes(document.type))continue;
   const amount=Math.min(allocation.amount,Math.max(0,document.total-(used.get(document.id)||0)),Math.max(0,payment.total-(used.get(payment.id)||0)));if(amount<=0)continue;
   used.set(document.id,(used.get(document.id)||0)+amount);used.set(payment.id,(used.get(payment.id)||0)+amount);
   if(document.currency!==currency&&inRange(payment.transactionDate)&&(!locationId||document.locationId===locationId))settled.push({date:payment.transactionDate,reference:payment.number,name:document.party,document:document.number,account:a.name,accountId:a.id,transactionId:payment.id,currency:document.currency,bookedRate:document.exchangeRate,currentRate:payment.exchangeRate,bookedValue:round(amount*document.exchangeRate),currentValue:round(amount*payment.exchangeRate),gainLoss:round(amount*(payment.exchangeRate-document.exchangeRate)*(a.type==='Accounts Receivable'?1:-1))});
  }
  const positions:Row[]=[];
  for(const d of validDocs.filter(d=>!locationId||d.locationId===locationId)){
   const a=control(d);if(!a)continue;
   const remaining=Math.max(0,d.total-(used.get(d.id)||0));if(remaining<0.005)continue;
   const posting=(postingsByDocument.get(d.id)||[]).filter(e=>e.account===a.name).reduce((n,e)=>n+e.debit-e.credit,0);
   const sign=Math.sign(posting);if(!sign)continue;
   const currentRate=d.currency===currency?1:rates.find(r=>r.currencyCode===d.currency)?.rate;
   if(currentRate===undefined&&d.currency!==currency)issues.add(`No active ${d.currency} exchange rate; ${d.number} cannot be revalued.`);
   positions.push({date:d.transactionDate,reference:d.number,dueDate:d.dueDate||d.transactionDate,name:d.party,account:a.name,accountId:a.id,transactionId:d.id,currency:d.currency,bookedRate:d.exchangeRate,currentRate:currentRate??'',bookedValue:round(sign*remaining*d.exchangeRate),currentValue:currentRate===undefined?'':round(sign*remaining*currentRate),gainLoss:currentRate===undefined?'':round(sign*remaining*(currentRate-d.exchangeRate))});
  }
  if(key==='cash-flow-forecast'){
   result.title='Cash Flow Forecast';let projected=round(selected.filter(e=>e.date<=asOf&&accountFor(e.account,e.entryCurrency)?.type==='Bank').reduce((n,e)=>n+e.debit-e.credit,0));
   result.financial.details=positions.map(r=>({...r,amount:r.bookedValue}));const groups=new Map<string,{month:string;inflow:number;outflow:number}>();
   for(const r of positions){const month=String(r.dueDate)<asOf?asOf.slice(0,7):String(r.dueDate).slice(0,7),g=groups.get(month)||{month,inflow:0,outflow:0};if(Number(r.bookedValue)>0)g.inflow+=Number(r.bookedValue);else g.outflow-=Number(r.bookedValue);groups.set(month,g);}
   result.rows=[{month:'Opening cash',inflow:0,outflow:0,projected},...[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(g=>{projected=round(projected+g.inflow-g.outflow);return {...g,inflow:round(g.inflow),outflow:round(g.outflow),projected};})];result.columns=[col('month','Due Month'),money('inflow','Expected Inflow'),money('outflow','Expected Outflow'),money('projected','Projected Cash')];
   result.financial.note='Forecast uses remaining posted receivables and payables at booked rates, including unapplied payments and credits; unposted settlement exchange differences are excluded. Overdue balances appear in the current month.';
  }else{
   const realised=key==='realised-gains-losses';result.title=realised?'Realised Gains & Losses':'Unrealised Gains & Losses';result.rows=realised?settled:positions.filter(r=>r.currency!==currency);result.financial.details=result.rows.map(r=>({...r,amount:r.gainLoss}));
   result.columns=[...baseColumns,col('currency','Currency'),col('bookedRate','Booked Rate'),col('currentRate',realised?'Settlement Rate':'Current Rate'),money('bookedValue','Booked Value'),money('currentValue','Revalued Value'),money('gainLoss','Gain / Loss')];
   result.financial.note=realised?'Calculated from allocated settlements and their saved rates; these differences are not automatically posted to a gain/loss account.':'Estimate on remaining posted receivables and payables using current configured rates, not historical rate snapshots. Positive amounts are gains; negative amounts are losses.';
  }
 }
 result.financial.issues=[...issues];
 return Response.json({report:result},{headers:{'Cache-Control':'no-store'}});
}
