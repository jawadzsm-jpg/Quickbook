import { readJsonBody } from '@/lib/api';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { requireCompanyAccess } from '@/lib/auth';
import { backupAudit, backupFile, backupReady, createCompanyBackup, deleteBackup, expireStalledBackups, verifyBackup } from '@/lib/company-backups';
import { nextBackupAt, parseBackupSchedule } from '@/lib/backup-schedule';
import { failureResponse, RequestError } from '@/lib/errors';
export const maxDuration=300;
export const dynamic='force-dynamic';
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
const validId=(id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams,companyId=Number(params.get('companyId'));
  const user=await requireCompanyAccess(request,companyId,true);if(user instanceof Response)return user;
  try {
    const id=params.get('download');
    if(id){if(!validId(id))throw new RequestError('Invalid backup.');const {row,file}=await backupFile(companyId,id);await backupAudit(companyId,id,'downloaded',user.id);return new Response(file.stream,{headers:{'Content-Type':'application/gzip','Content-Disposition':`attachment; filename="${String(row.filename).replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Backup-SHA256':String(row.sha256)}});}
    await expireStalledBackups(companyId);
    const db=getDb();const [schedule,history,heartbeat]=await Promise.all([
      db.execute(sql`SELECT config,enabled,next_run_at,revision FROM backup_schedules WHERE company_id=${companyId}`),
      db.execute(sql`SELECT id,source,status,created_at,completed_at,filename,sha256,size_bytes,row_count,table_count,verified_at,error,expires_at FROM company_backups WHERE company_id=${companyId} ORDER BY created_at DESC LIMIT 100`),
      db.execute(sql`SELECT checked_at FROM backup_worker_status WHERE id=1`)
    ]);
    const s=schedule.rows[0];return json({storageReady:backupReady(),workerLastSeen:heartbeat.rows[0]?.checked_at??null,schedule:s?{...JSON.parse(String(s.config)),enabled:s.enabled,nextRunAt:s.next_run_at,revision:s.revision}:null,backups:history.rows});
  }catch(error){return failureResponse(error,randomUUID(),'/api/admin-backups');}
}
export async function POST(request:Request) {
  // Authenticate before reading or performing any work; company scope is checked again below.
  const {requireApiUser}=await import('@/lib/auth');const actor=await requireApiUser(request,true,true);if(actor instanceof Response)return actor;
  try {
    const body=await readJsonBody(request,4096) as Record<string,unknown>,companyId=Number(body.companyId);
    const user=await requireCompanyAccess(request,companyId,true,true);if(user instanceof Response)return user;
    if(body.action==='schedule'){
      let config;try{config=parseBackupSchedule(body.schedule);}catch(e){throw new RequestError(e instanceof Error?e.message:'Invalid schedule.');}
      if(config.enabled&&!backupReady())throw new RequestError('Connect private backup storage before enabling a schedule.',503);
      const next=config.enabled?nextBackupAt(config,new Date(),true):null;if(config.enabled&&!next)throw new RequestError('Choose a future date and time for a one-time backup.');
      const revision=Number(body.revision);if(!Number.isInteger(revision)||revision<0)throw new RequestError('Refresh the backup schedule.');
      const updated=revision===0?await getDb().execute(sql`INSERT INTO backup_schedules(company_id,config,enabled,next_run_at,updated_by) VALUES(${companyId},${JSON.stringify(config)},${config.enabled},${next},${user.id}) ON CONFLICT DO NOTHING RETURNING revision`):await getDb().execute(sql`UPDATE backup_schedules SET config=${JSON.stringify(config)},enabled=${config.enabled},next_run_at=${next},lease_until=NULL,revision=revision+1,updated_by=${user.id},updated_at=now() WHERE company_id=${companyId} AND revision=${revision} RETURNING revision`);
      if(!updated.rows.length)throw new RequestError('Another administrator changed the schedule. Refresh and try again.',409);
      await backupAudit(companyId,'schedule','schedule_changed',user.id);return json({ok:true});
    }
    if(body.action==='create'){
      const policy=await getDb().execute(sql`SELECT config FROM backup_schedules WHERE company_id=${companyId}`);
      const days=policy.rows[0]?parseBackupSchedule(JSON.parse(String(policy.rows[0].config))).retentionDays:30;
      return json({id:await createCompanyBackup(companyId,user.id,'manual',undefined,days)});
    }
    if(typeof body.id!=='string'||!validId(body.id))throw new RequestError('Select a valid backup.');
    if(body.action==='verify'){await verifyBackup(companyId,body.id);await backupAudit(companyId,body.id,'verified',user.id);return json({ok:true});}
    if(body.action==='delete'){await deleteBackup(companyId,body.id,user.id);return json({ok:true});}
    throw new RequestError('Unknown backup action.');
  }catch(error){return failureResponse(error,randomUUID(),'/api/admin-backups');}
}
