import type { ReportExportData } from './report-export';

export type TaxAccount = { id:number; code:string; name:string; type:string; currency:string; active:boolean };
export type TaxConfig = { from:string; to:string; lowerRate:number; upperRate:number; threshold:number; expenseAccountId:number; payableAccountId:number; additions:number; deductions:number; adjustmentNote:string };
export type TaxPosting = { id:number; accountName:string; currency:string; debit:number; credit:number; accountId?:number };
export type TaxResult = { config:TaxConfig; currency:string; income:number; expenses:number; netProfit:number; taxExpense:number; preTaxProfit:number; taxableIncome:number; lowerTax:number; upperTax:number; estimatedTax:number; issues:string[]; accounts:Array<{accountId:number;account:string;type:string;amount:number}>; report:ReportExportData };
export const taxBasis = 'Management estimate from posted company-wide accounts. No filing or journal is created. Review tax adjustments, exemptions, free-zone rules, small business relief, loss relief, credits and minimum top-up tax separately. Saved working papers recalculate against the current ledger when opened.';
export const taxSource = 'https://mof.gov.ae/en/news/ministry-of-finance-confirms-applicable-taxable-income-threshold-for-corporate-tax-abu-dhabi-uae/';
export function defaultTaxConfig(year:string):TaxConfig { return {from:`${year}-01-01`,to:`${year}-12-31`,lowerRate:0,upperRate:9,threshold:375000,expenseAccountId:0,payableAccountId:0,additions:0,deductions:0,adjustmentNote:''}; }
export function validateTaxConfig(value:unknown):TaxConfig {
  if(!value || typeof value!=='object') throw new Error('Enter tax settings.');
  const v=value as Record<string,unknown>;
  const from=String(v.from||''),to=String(v.to||'');
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!valid(from)||!valid(to)||from>to) throw new Error('Select a valid tax period.');
  const numeric=(key:string,max:number)=>{const x=v[key];if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>max)throw new Error(`Enter a valid ${key}.`);return x;};
  const lowerRate=numeric('lowerRate',100),upperRate=numeric('upperRate',100),threshold=numeric('threshold',1e12),additions=numeric('additions',1e12),deductions=numeric('deductions',1e12);
  const expenseAccountId=numeric('expenseAccountId',2147483647),payableAccountId=numeric('payableAccountId',2147483647);
  if(!Number.isInteger(expenseAccountId)||!Number.isInteger(payableAccountId)) throw new Error('Choose valid tax accounts.');
  const adjustmentNote=String(v.adjustmentNote||'').trim();
  if(adjustmentNote.length>1000 || ((additions>0||deductions>0)&&!adjustmentNote)) throw new Error('Explain tax adjustments in a note (up to 1,000 characters).');
  return {from,to,lowerRate,upperRate,threshold,expenseAccountId,payableAccountId,additions,deductions,adjustmentNote};
}
export const taxExpenseTypes=['Expense','Other Expense'];
export const taxPayableTypes=['Other Current Liability','Current Liability','Other Current Liabilities','Liability','Long Term Liability'];
export function validateTaxAccounts(config:TaxConfig,accounts:TaxAccount[],currency:string) {
  for(const [id,types,label] of [[config.expenseAccountId,taxExpenseTypes,'expense'],[config.payableAccountId,taxPayableTypes,'payable']] as const) {
    if(id && !accounts.some(a=>a.id===id&&types.includes(a.type)&&a.currency===currency)) throw new Error(`Select a company ${currency} ${label} account with the correct account type.`);
  }
}
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function calculateIncomeTax(config:TaxConfig,currency:string,chart:TaxAccount[],postings:TaxPosting[],linkIssues:string[]=[]):TaxResult {
  const byId=new Map(chart.map(a=>[a.id,a]));
  const totals=new Map<number,number>();
  const issues=new Set(linkIssues);
  if(currency!=='AED') issues.add('Custom currency calculation: review the chosen rates, threshold and any statutory currency conversion. No UAE preset is applied.');
  for(const p of postings) {
    const a=byId.get(p.accountId||0);
    if(!a){issues.add(`Unresolved account: ${p.accountName}. Its postings are excluded from classified profit; review before using this estimate.`);continue;}
    if(['Income','Other Income','Cost of Goods Sold','Expense','Other Expense'].includes(a.type)) totals.set(a.id,(totals.get(a.id)||0)+(['Income','Other Income'].includes(a.type)?p.credit-p.debit:p.debit-p.credit));
  }
  const accounts=[...totals].map(([accountId,value])=>{const a=byId.get(accountId)!;return {accountId,account:`${a.code} · ${a.name}`,type:a.type,amount:round(value)};}).sort((a,b)=>a.account.localeCompare(b.account,undefined,{numeric:true}));
  const income=round(accounts.filter(a=>['Income','Other Income'].includes(a.type)).reduce((n,a)=>n+a.amount,0));
  const expenses=round(accounts.filter(a=>!['Income','Other Income'].includes(a.type)).reduce((n,a)=>n+a.amount,0));
  const netProfit=round(income-expenses),taxExpense=round(totals.get(config.expenseAccountId)||0),preTaxProfit=round(netProfit+taxExpense);
  const taxableIncome=Math.max(0,round(preTaxProfit+config.additions-config.deductions));
  const lowerTax=round(Math.min(taxableIncome,config.threshold)*config.lowerRate/100),upperTax=round(Math.max(0,taxableIncome-config.threshold)*config.upperRate/100),estimatedTax=round(lowerTax+upperTax);
  if(!config.expenseAccountId) issues.add('Select the corporate income tax expense account to add back any tax already expensed.');
  if(!config.payableAccountId) issues.add('Select the corporate income tax payable account for provision review.');
  for(const id of [config.expenseAccountId,config.payableAccountId]) if(id&&byId.get(id)?.active===false) issues.add(`${byId.get(id)!.name} is inactive. Historical postings remain included.`);
  const accountName=(id:number)=>byId.has(id)?`${byId.get(id)!.code} · ${byId.get(id)!.name}`:'Not selected';
  const rows:ReportExportData["rows"]=[
    {name:'Ledger income',amount:income,description:'Income and Other Income, net credits'},
    {name:'Ledger expenses',amount:expenses,description:'COGS, Expense and Other Expense, net debits'},
    {name:'Accounting net profit / loss',amount:netProfit,description:'Income less expenses'},
    {name:'Add back recorded income tax expense',amount:taxExpense,description:accountName(config.expenseAccountId)},
    {metric:'preTaxProfit',name:'Profit / loss before income tax',amount:preTaxProfit,description:'Accounting profit plus selected tax expense'},
    {name:'Other tax additions',amount:config.additions,description:config.adjustmentNote||'None'},
    {name:'Tax deductions',amount:config.deductions,description:config.adjustmentNote||'None'},
    {metric:'taxableIncome',name:'Estimated taxable income',amount:taxableIncome,description:'Negative adjusted profit is shown as zero; no automatic loss carry-forward'},
    {name:`Tax within threshold (${config.lowerRate}%)`,amount:lowerTax,description:`Threshold ${config.threshold.toFixed(2)} ${currency}; full selected period, not prorated`},
    {name:`Tax above threshold (${config.upperRate}%)`,amount:upperTax,description:'Only the amount exceeding the threshold'},
    {metric:'estimatedTax',name:'Estimated income tax',amount:estimatedTax,description:'Management estimate before reliefs and credits'},
    {name:'Provision comparison: estimate less recorded expense',amount:round(estimatedTax-taxExpense),description:`Expense: ${accountName(config.expenseAccountId)}; payable: ${accountName(config.payableAccountId)}. Review only; no automatic posting.`},
    ...accounts.map(a=>({name:a.account,amount:a.amount,description:`Ledger account · ${a.type}`,accountId:a.accountId})),
  ];
  const report:ReportExportData={key:'income-tax',title:'Income Tax Working Paper',currency,generatedAt:new Date().toISOString(),period:{label:`${config.from} to ${config.to} · Company-wide`},accountLinkIssues:[...issues],columns:[{key:'name',label:'Calculation / account'},{key:'description',label:'Basis / notes'},{key:'amount',label:`Amount (${currency})`,type:'money'}],rows};
  return {config,currency,income,expenses,netProfit,taxExpense,preTaxProfit,taxableIncome,lowerTax,upperTax,estimatedTax,issues:[...issues],accounts,report};
}

export function incomeTaxReportSummary(report:Pick<ReportExportData,'key'|'rows'>) {
  if(report.key!=='income-tax')return null;
  return {cards:[['preTaxProfit','Profit before tax'],['taxableIncome','Estimated taxable income'],['estimatedTax','Estimated income tax']].map(([metric,label])=>({label,value:Number(report.rows.find(r=>r.metric===metric)?.amount||0),format:'money' as const,tone:'neutral' as const})),note:taxBasis};
}
