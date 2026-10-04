import { authorizeBackupWorker } from '@/lib/backup-oidc';
import { runScheduledBackups } from '@/lib/company-backups';
export const maxDuration=300;
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!await authorizeBackupWorker(request))return Response.json({error:'Unauthorized scheduler.'},{status:401});
  try {const result=await runScheduledBackups();return Response.json(result,{status:result.failed?503:200,headers:{'Cache-Control':'no-store'}});}
  catch {console.error(JSON.stringify({event:'backup_worker_failed'}));return Response.json({error:'Backup scheduler failed.'},{status:503});}
}
