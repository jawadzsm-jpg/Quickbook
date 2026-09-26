export type ReportPeriod = { from: string; to: string; mode: 'range' | 'asof' | 'current'; label: string };
export const reportDatePresets = ['All','Today','This Week','This Week-to-date','This Month','This Month-to-date','This Fiscal Quarter','This Fiscal Quarter-to-date','This Fiscal Year','This Fiscal Year-to-Last Month','This Fiscal Year-to-date','Yesterday','Last Week','Last Week-to-date','Last Month','Last Month-to-date','Last Fiscal Quarter','Last Fiscal Quarter-to-date','Last Fiscal Year','Last Fiscal Year-to-date','Next Week','Next 4 Weeks','Next Month','Next Fiscal Quarter','Next Fiscal Year','Custom'] as const;
export function reportToday() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function validReportDate(value: string) { return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function presetDates(preset: string, today = reportToday()): { from: string; to: string } {
  if (!validReportDate(today) || !today) throw new Error('Invalid date');
  const now = new Date(`${today}T00:00:00Z`), y=now.getUTCFullYear(), m=now.getUTCMonth(), day=now.getUTCDate();
  const date=(year:number,month:number,d:number)=>new Date(Date.UTC(year,month,d));
  const shift=(d:Date,n:number)=>new Date(d.getTime()+n*86400000);
  const fmt=(d:Date)=>d.toISOString().slice(0,10);
  const week=shift(now,-((now.getUTCDay()+6)%7)), quarter=Math.floor(m/3)*3;
  const endMonth=(year:number,month:number)=>date(year,month+1,0);
  const clamp=(year:number,month:number,d:number)=>date(year,month,Math.min(d,endMonth(year,month).getUTCDate()));
  let start=now,end=now;
  switch(preset) {
    case 'All': return {from:'',to:''};
    case 'Today': break;
    case 'Yesterday': start=end=shift(now,-1); break;
    case 'This Week': start=week;end=shift(week,6);break;
    case 'This Week-to-date': start=week;break;
    case 'Last Week': start=shift(week,-7);end=shift(week,-1);break;
    case 'Last Week-to-date':start=shift(week,-7);end=shift(now,-7);break;
    case 'Next Week':start=shift(week,7);end=shift(week,13);break;
    case 'Next 4 Weeks':start=shift(week,7);end=shift(week,34);break;
    case 'This Month':start=date(y,m,1);end=endMonth(y,m);break;
    case 'This Month-to-date':start=date(y,m,1);break;
    case 'Last Month':start=date(y,m-1,1);end=endMonth(y,m-1);break;
    case 'Last Month-to-date':start=date(y,m-1,1);end=clamp(y,m-1,day);break;
    case 'Next Month':start=date(y,m+1,1);end=endMonth(y,m+1);break;
    case 'This Fiscal Quarter':start=date(y,quarter,1);end=date(y,quarter+3,0);break;
    case 'This Fiscal Quarter-to-date':start=date(y,quarter,1);break;
    case 'Last Fiscal Quarter':start=date(y,quarter-3,1);end=date(y,quarter,0);break;
    case 'Last Fiscal Quarter-to-date':start=date(y,quarter-3,1);end=clamp(y,m-3,day);break;
    case 'Next Fiscal Quarter':start=date(y,quarter+3,1);end=date(y,quarter+6,0);break;
    case 'This Fiscal Year':start=date(y,0,1);end=date(y,11,31);break;
    case 'This Fiscal Year-to-date':start=date(y,0,1);break;
    case 'This Fiscal Year-to-Last Month': if(m===0) throw new Error('No completed month in this fiscal year.');start=date(y,0,1);end=date(y,m,0);break;
    case 'Last Fiscal Year':start=date(y-1,0,1);end=date(y-1,11,31);break;
    case 'Last Fiscal Year-to-date':start=date(y-1,0,1);end=clamp(y-1,m,day);break;
    case 'Next Fiscal Year':start=date(y+1,0,1);end=date(y+1,11,31);break;
    default: throw new Error('Select a date preset');
  }
  return {from:fmt(start),to:fmt(end)};
}
export function reportPeriod(key: string, from: string, to: string): ReportPeriod {
  const current = /^(inventory-|item-price|item-listing|physical-inventory|pending-builds|stock-pricing-profit|cash-flow-forecast|bank-reconciliation|memorised-transactions|to-do-notes|account-listing|fixed-asset-listing|terms-listing|vat-code-list|employee-contact-list|other-names-|customer-phone-list|customer-contact-list|supplier-phone-list|supplier-contact-list|supplier-open-balance)/.test(key);
  const asof = /^(balance-sheet|trial-balance|customer-balances|customer-balance-detail|vendor-balances|supplier-balance-detail|customer-open-balance|customers-overdue-invoices|active-customers|ar-aging)/.test(key);
  const mode = current ? 'current' : asof ? 'asof' : 'range';
  return {from:mode==='range'?from:'',to:current?'':to,mode,label:current?'Current data — historical snapshots are not available':asof?`As of ${to || 'latest posting'}`:from||to?`${from || 'Beginning'} — ${to || 'Latest posting'}`:'All dates'};
}

export function reportMonths(from: string, to: string) {
  const result: {month:string;from:string;to:string}[]=[];
  const d=new Date(`${from.slice(0,7)}-01T00:00:00Z`);
  while(d.getTime()<=new Date(`${to}T23:59:59Z`).getTime()) {
    const month=d.toISOString().slice(0,7);
    const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);
    result.push({month,from:from>`${month}-01`?from:`${month}-01`,to:to<end?to:end});
    d.setUTCMonth(d.getUTCMonth()+1);
  }
  return result;
}
export function previousYearDate(value:string) {
 const d=new Date(`${value}T00:00:00Z`), month=d.getUTCMonth(); d.setUTCFullYear(d.getUTCFullYear()-1); if(d.getUTCMonth()!==month)d.setUTCDate(0); return d.toISOString().slice(0,10);
}
