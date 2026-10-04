import { randomUUID, createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { put, get, del } from '@vercel/blob';
import { getDb, withWriteTransaction } from '@/db';
import { companySnapshot } from './backup-snapshot';
import { nextBackupAt, parseBackupSchedule } from './backup-schedule';
import { RequestError } from './errors';

async function streamHash(stream:ReadableStream<Uint8Array>) {
  const reader=stream.getReader(),hash=createHash('sha256');
  try {while(true){const {done,value}=await reader.read();if(done)break;hash.update(value);}}finally{reader.releaseLock();}
  return hash.digest('hex');
}
export const backupReady=()=>Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export async function expireStalledBackups(companyId?:number) {
  await getDb().execute(sql`UPDATE company_backups SET status='failed',error='The backup was interrupted. Retry to create a fresh snapshot.',completed_at=now() WHERE status='running' AND created_at<now()-interval '15 minutes' ${companyId?sql`AND company_id=${companyId}`:sql``}`);
}
export async function backupAudit(companyId:number,id:string,action:string,userId?:number) {
  await getDb().execute(sql`INSERT INTO audit_log(company_id,action,entity_type,entity_id,details) VALUES (${companyId},${action},'company_backup',${companyId},${JSON.stringify({backupId:id,userId:userId??null})})`);
}
export async function backupFile(companyId:number,id:string) {
  const result=await getDb().execute(sql`SELECT * FROM company_backups WHERE id=${id} AND company_id=${companyId} AND status='completed'`);
  const row=result.rows[0];if(!row?.blob_path)throw new RequestError('Completed backup not found.',404);
  const file=await get(String(row.blob_path),{access:'private',useCache:false});
  if(!file||file.statusCode!==200)throw new RequestError('Backup file is unavailable. Create a new backup.',404);
  return {row,file};
}
export async function verifyBackup(companyId:number,id:string) {
  const {row,file}=await backupFile(companyId,id);
  if(await streamHash(file.stream)!==row.sha256)throw new RequestError('Integrity check failed. Keep the file for investigation and create a new backup.',409);
  await getDb().execute(sql`UPDATE company_backups SET verified_at=now() WHERE id=${id} AND company_id=${companyId}`);
}
export async function deleteBackup(companyId:number,id:string,userId?:number) {
  const r=await getDb().execute(sql`SELECT blob_path,status FROM company_backups WHERE id=${id} AND company_id=${companyId}`);const row=r.rows[0];
  if(!row)throw new RequestError('Backup not found.',404);if(row.status==='running')throw new RequestError('Wait for this backup to finish.',409);
  if(row.blob_path)await del(String(row.blob_path));
  await getDb().execute(sql`UPDATE company_backups SET status='deleted',blob_path=NULL WHERE id=${id} AND company_id=${companyId}`);
  await backupAudit(companyId,id,'deleted',userId);
}
export async function createCompanyBackup(companyId:number,userId:number,source:'manual'|'scheduled',runKey:string=randomUUID(),retentionDays=30) {
  if(!backupReady())throw new RequestError('Private backup storage is not connected.',503);
  await expireStalledBackups(companyId);
  let id:string=randomUUID();const filename=`company-${companyId}-${new Date().toISOString().replaceAll(':','-')}-${id.slice(0,8)}.comnet.json.gz`;
  const prior=await getDb().execute(sql`SELECT id,status FROM company_backups WHERE company_id=${companyId} AND run_key=${runKey}`);
  if(['completed','deleted'].includes(String(prior.rows[0]?.status)))return String(prior.rows[0].id);
  const claimed=await getDb().execute(sql`INSERT INTO company_backups(id,company_id,run_key,source,status,requested_by,filename) VALUES (${id},${companyId},${runKey},${source},'running',${userId},${filename}) ON CONFLICT(run_key) DO UPDATE SET status='running',created_at=now(),completed_at=NULL,error=NULL,filename=excluded.filename WHERE company_backups.status='failed' RETURNING id`);
  if(!claimed.rows.length)throw new RequestError('A backup is already running or this scheduled run was already processed.',409);
  id=String(claimed.rows[0].id);
  let path:string|undefined;
  try {
    let snapshot:Awaited<ReturnType<typeof companySnapshot>>|undefined;
    await withWriteTransaction(async()=>{snapshot=await companySnapshot(getDb(),companyId,id);return Response.json({ok:true});});
    if(!snapshot)throw new Error('Snapshot unavailable.');
    path=`company-backups/${companyId}/${filename}`;
    await put(path,snapshot.archive,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/gzip',multipart:true});
    const stored=await get(path,{access:'private',useCache:false});if(!stored||stored.statusCode!==200)throw new Error('Storage verification failed.');
    if(await streamHash(stored.stream)!==snapshot.sha256)throw new Error('Storage verification failed.');
    const expiry=new Date(Date.now()+retentionDays*86400000).toISOString();
    await backupAudit(companyId,id,'created',userId);
    await getDb().execute(sql`UPDATE company_backups SET status='completed',completed_at=now(),blob_path=${path},sha256=${snapshot.sha256},size_bytes=${snapshot.archive.length},row_count=${snapshot.rowCount},table_count=${snapshot.tableCount},verified_at=now(),expires_at=${expiry} WHERE id=${id} AND status='running'`);
    return id;
  }catch(error){
    if(path)try{await del(path);}catch{/* A private orphan is preferable to exposing financial data. */}
    await getDb().execute(sql`UPDATE company_backups SET status='failed',completed_at=now(),error=${error instanceof Error&&error.message==='BACKUP_SIZE_LIMIT'?'Company data exceeds the current archive size limit (128 MB before compression / 64 MB compressed). Contact support for a database-level backup.':'Backup could not be completed. Check storage availability and retry.'} WHERE id=${id}`);
    throw new RequestError('Backup failed. The previous completed backups are unchanged.',503);
  }
}
export async function runScheduledBackups() {
  const db=getDb();await expireStalledBackups();
  await db.execute(sql`INSERT INTO backup_worker_status(id,checked_at) VALUES(1,now()) ON CONFLICT(id) DO UPDATE SET checked_at=now()`);
  const due=await db.execute(sql`UPDATE backup_schedules SET lease_until=now()+interval '15 minutes' WHERE company_id IN (SELECT company_id FROM backup_schedules WHERE enabled AND next_run_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_run_at LIMIT 2 FOR UPDATE SKIP LOCKED) RETURNING *`);
  let completed=0,failed=0;
  for(const row of due.rows){const companyId=Number(row.company_id),userId=Number(row.updated_by),revision=Number(row.revision);
    try {
      const allowed=await db.execute(sql`SELECT u.id FROM app_users u WHERE u.id=${userId} AND u.active AND (u.role='all_admin' OR (u.role='admin' AND EXISTS(SELECT 1 FROM app_user_companies a WHERE a.user_id=u.id AND a.company_id=${companyId})))`);
      if(!allowed.rows.length){await db.execute(sql`UPDATE backup_schedules SET enabled=false,lease_until=NULL WHERE company_id=${companyId} AND revision=${revision}`);continue;}
      const config=parseBackupSchedule(JSON.parse(String(row.config)));
      await createCompanyBackup(companyId,userId,'scheduled',`scheduled:${companyId}:${revision}:${new Date(String(row.next_run_at)).toISOString()}`,config.retentionDays);
      const next=nextBackupAt(config,new Date());
      await db.execute(sql`UPDATE backup_schedules SET next_run_at=${next},enabled=${Boolean(next)},lease_until=NULL WHERE company_id=${companyId} AND revision=${revision}`);completed++;

    }catch{failed++;await db.execute(sql`UPDATE backup_schedules SET lease_until=now()+interval '30 minutes' WHERE company_id=${companyId} AND revision=${revision}`);}
  }
  // Retention applies even when schedules are paused or backups were created manually.
  const expired=await db.execute(sql`SELECT b.id,b.company_id FROM company_backups b WHERE b.status='completed' AND b.expires_at<now() AND b.id<>(SELECT id FROM company_backups WHERE company_id=b.company_id AND status='completed' ORDER BY created_at DESC LIMIT 1) LIMIT 10`);
  for(const old of expired.rows){try{await deleteBackup(Number(old.company_id),String(old.id));}catch{failed++;}}
  return {completed,failed};
}
