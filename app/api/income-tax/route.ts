import { and, desc, eq } from 'drizzle-orm';
import { getDb, withWriteTransaction } from '@/db';
import { accounts, auditLog, companies, incomeTaxWorkingPapers } from '@/db/schema';
import { canAccessCompany, hasPermission, requireApiUser } from '@/lib/auth';
import { validateTaxConfig } from '@/lib/income-tax';
import { loadIncomeTax } from '@/lib/income-tax-data';

export async function GET(request:Request) {
  const user=await requireApiUser(request,'reports:read');if(user instanceof Response)return user;
  const companyId=Number(new URL(request.url).searchParams.get('companyId'));
  if(!hasPermission(user,'reports:read')||!Number.isSafeInteger(companyId)||companyId<=0||!canAccessCompany(user,companyId))return Response.json({error:'Company report access required.'},{status:403});
  const db=getDb();
  const [company]=await db.select({currency:companies.baseCurrency}).from(companies).where(eq(companies.id,companyId));
  if(!company)return Response.json({error:'Company not found.'},{status:404});
  const [chart,papers]=await Promise.all([db.select({id:accounts.id,code:accounts.code,name:accounts.name,type:accounts.type,currency:accounts.currency,active:accounts.active}).from(accounts).where(eq(accounts.companyId,companyId)),db.select().from(incomeTaxWorkingPapers).where(eq(incomeTaxWorkingPapers.companyId,companyId)).orderBy(desc(incomeTaxWorkingPapers.periodEnd))]);
  return Response.json({currency:company.currency,accounts:chart,papers:papers.map(p=>({...p,config:JSON.parse(p.config)})),canManage:hasPermission(user,'accounting:manage')},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request) {
  const user=await requireApiUser(request,'reports:read',true);if(user instanceof Response)return user;
  try {
    const body=await request.json();const companyId=Number(body.companyId);
    if(!hasPermission(user,'reports:read')||!Number.isSafeInteger(companyId)||companyId<=0||!canAccessCompany(user,companyId))return Response.json({error:'Company report access required.'},{status:403});
    if(!['preview','save','create-accounts'].includes(body.action))return Response.json({error:'Choose preview or save.'},{status:400});
    if(body.action!=='preview'&&!hasPermission(user,'accounting:manage'))return Response.json({error:'Only administrators and accountants can save tax working papers.'},{status:403});
    const db=getDb();const [company]=await db.select({currency:companies.baseCurrency}).from(companies).where(eq(companies.id,companyId));
    if(!company)return Response.json({error:'Company not found.'},{status:404});
    if(body.action==='create-accounts') {
      return await withWriteTransaction(async()=>{
        const tx=getDb();await tx.select({id:companies.id}).from(companies).where(eq(companies.id,companyId)).for('update');
        const existing=await tx.select().from(accounts).where(eq(accounts.companyId,companyId));
        const result:Record<string,number>={};
        for(const [key,code,name,type] of [['expenseAccountId','7100','Corporate Income Tax Expense','Other Expense'],['payableAccountId','2150','Corporate Income Tax Payable','Other Current Liability']]) {
          const matches=existing.filter(a=>a.code===code||a.name===name);
          if(matches.length) {
            if(matches.length!==1||matches[0].name!==name||matches[0].type!==type||matches[0].currency!==company.currency||!matches[0].active)throw new Error('A tax account code or name is already used differently. Select the correct accounts manually in Chart of Accounts.');
            result[key]=matches[0].id;
          } else {
            const [a]=await tx.insert(accounts).values({companyId,code,name,type,currency:company.currency}).returning();result[key]=a.id;
            await tx.insert(auditLog).values({companyId,action:'created',entityType:'account',entityId:a.id,details:`Income tax account ${code}: ${user.email}`});
          }
        }
        return Response.json({accountIds:result});
      });
    }
    const config=validateTaxConfig(body.config);
    const result=await loadIncomeTax(companyId,company.currency,config);
    if(body.action==='save') {
      const id=Number(body.id||0),revision=Number(body.revision||0);
      if(!Number.isSafeInteger(id)||id<0||!Number.isSafeInteger(revision)||revision<0)return Response.json({error:'Invalid working paper revision.'},{status:400});
      return await withWriteTransaction(async()=>{
        const tx=getDb();const values={periodStart:config.from,periodEnd:config.to,config:JSON.stringify(config),updatedAt:new Date().toISOString()};
        const [saved]=id?await tx.update(incomeTaxWorkingPapers).set({...values,revision:revision+1}).where(and(eq(incomeTaxWorkingPapers.id,id),eq(incomeTaxWorkingPapers.companyId,companyId),eq(incomeTaxWorkingPapers.revision,revision))).returning():await tx.insert(incomeTaxWorkingPapers).values({...values,companyId}).onConflictDoNothing().returning();
        if(!saved)throw new Error('CONFLICT');
        await tx.insert(auditLog).values({companyId,action:id?'updated':'created',entityType:'income_tax_working_paper',entityId:saved.id,details:`${config.from} to ${config.to}: tax rates ${config.lowerRate}% / ${config.upperRate}%, threshold ${config.threshold}; ${user.email}`});
        return Response.json({result,paper:{...saved,config}},{headers:{'Cache-Control':'private, no-store'}});
      });
    }
    return Response.json({result,paper:null},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    const message=error instanceof Error?error.message:'Could not generate tax report.';
    if(message==='CONFLICT'||(error as {code?:string})?.code==='23505')return Response.json({error:'This period already exists or changed. Reload the saved working paper before saving.'},{status:409});
    return Response.json({error:message},{status:400});
  }
}
