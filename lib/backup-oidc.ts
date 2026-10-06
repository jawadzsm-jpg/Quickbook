import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
const issuer='https://token.actions.githubusercontent.com';
const keys=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
// GitHub issues the immutable subject form (owner and repository IDs) for this repository; the legacy form is kept for repositories that have not opted in.
const subjects=['repo:jawadzsm-jpg@325708076/Quickbook@1359351844:ref:refs/heads/main','repo:jawadzsm-jpg/Quickbook:ref:refs/heads/main'];
export function validBackupClaims(p:JWTPayload) {
  return p.repository_id==='1359351844'&&p.repository==='jawadzsm-jpg/Quickbook'&&p.ref==='refs/heads/main'&&subjects.includes(String(p.sub))&&p.workflow_ref==='jawadzsm-jpg/Quickbook/.github/workflows/backups.yml@refs/heads/main'&&['schedule','workflow_dispatch'].includes(String(p.event_name));
}
export async function verifyBackupToken(token:string,key:JWTVerifyGetKey=keys) {
  try {const {payload}=await jwtVerify(token,key,{issuer,audience:'comnet-backup-worker',algorithms:['RS256'],maxTokenAge:'10m',requiredClaims:['exp','iat','sub']});return validBackupClaims(payload);}catch{return false;}
}
export async function authorizeBackupWorker(request:Request) {
  if(process.env.VERCEL_ENV!=='production')return false;
  const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if(!token||token.length>16000)return false;
  return verifyBackupToken(token);
}
