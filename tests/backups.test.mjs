import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const database = new PGlite();
globalThis.__comnetPg = database;
globalThis.__backupBlobs = new Map();
const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
process.env.BLOB_READ_WRITE_TOKEN = "test-token";
globalThis.__comnetPoolClosed = 0;
const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
const vite = await createServer({
  appType: "custom", configFile: false, root,
  ssr: { noExternal: ["@neondatabase/serverless", "drizzle-orm"] },
  resolve: { alias: { "@": root, "@neondatabase/serverless": "\0test-neon", "drizzle-orm/neon-http": "\0test-driver", "drizzle-orm/neon-serverless": "\0test-driver" } }, server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/.next/**"] } },
  plugins: [{
    name: "embedded-postgres", enforce: "pre",
    transform(code, id) {
      if(id.endsWith('/lib/company-backups.ts'))return code.replace("'@vercel/blob'", '"/__test-blob.js"');
      if (id.endsWith("/db/index.ts")) return code.replaceAll('"@neondatabase/serverless"', '"/__test-neon.js"').replaceAll('"drizzle-orm/neon-http"', '"/__test-driver.js"').replaceAll('"drizzle-orm/neon-serverless"', '"/__test-driver.js"');
    },
    resolveId(id) {
      if (id === "/__test-blob.js") return "\0test-blob";
      if (id === "/__test-neon.js") return "\0test-neon";
      if (id === "/__test-driver.js") return "\0test-driver";
      if (id === "@neondatabase/serverless") return "\0test-neon";
      if (["drizzle-orm/neon-http", "drizzle-orm/neon-serverless"].includes(id)) return "\0test-driver";
      if (/\/lib\/auth(?:\.ts)?$/.test(id)) return "\0test-auth";
      if (id === "@vercel/blob") return "\0test-blob";
      if (id === "server-only") return "\0server-only";
    },
    load(id) {
      if (id === "\0test-blob") return `
        export const put = async (path, bytes, options) => { if(options.access!=="private") throw Error("Private access required"); globalThis.__backupBlobs.set(path, Buffer.from(bytes)); return {pathname:path}; };
        export const get = async (path, options) => { if(options.access!=="private") throw Error("Private access required"); const bytes=globalThis.__backupBlobs.get(path); return bytes?{statusCode:200,stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})}:null; };
        export const del = async path => {globalThis.__backupBlobs.delete(path);};
      `;
      if (id === "\0server-only") return "export {}";
      if (id === "\0test-neon") return `export const neon = () => ({}); export const neonConfig = {}; export class Pool { async end() { globalThis.__comnetPoolClosed++; } }`;
      if (id === "\0test-driver") return `import { drizzle as pg } from "drizzle-orm/pglite"; export const drizzle = (client, config) => pg(globalThis.__comnetPg, config);`;
      if (id === "\0test-auth") return `
        export * from "/lib/access.ts";
        export * from "/lib/password.ts";
        export const requireCompanyAccess = async () => globalThis.__attachmentTestUser || ({ id: 1, email: "test@example.test", role: "all_admin", companyIds: [], mustChangePassword: false });
        export const requireApiUser = async () => globalThis.__reportTestUser || ({ id: 1, email: "test@example.test", role: "all_admin", companyIds: [], mustChangePassword: false });
      `;
    },
  }],
});
after(async () => {
  await vite.close(); await database.close();
  delete globalThis.__backupBlobs;
  if(previousBlobToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=previousBlobToken;
  delete globalThis.__comnetPg; delete globalThis.__comnetPoolClosed;
  if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
});

const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const post = (body) => new Request("https://app.test/api", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(body) });

// Apply the actual migration chain to an isolated in-memory PostgreSQL engine.
for (const name of (await readdir(`${root}drizzle`)).filter((name) => name.endsWith(".sql")).sort()) {
  for (const statement of (await readFile(`${root}drizzle/${name}`, "utf8")).split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    try { await database.exec(statement); } catch (error) { throw new Error(`Migration ${name} failed`, { cause: error }); }
  }
}


const { gunzipSync } = await import("node:zlib");
const { randomUUID, createHash } = await import("node:crypto");
const { companySnapshot, backupTables } = await vite.ssrLoadModule("/lib/backup-snapshot.ts");
const { nextBackupAt, parseBackupSchedule } = await vite.ssrLoadModule("/lib/backup-schedule.ts");
const service = await vite.ssrLoadModule("/lib/company-backups.ts");
const { validBackupClaims, authorizeBackupWorker } = await vite.ssrLoadModule("/lib/backup-oidc.ts");
const db=getDb();
await database.exec("INSERT INTO companies(name) VALUES ('Backup One'),('Backup Two'); UPDATE app_users SET role='all_admin' WHERE id=1");
const companyId=Number((await database.query("SELECT id FROM companies WHERE name='Backup One'")).rows[0].id);
const otherId=Number((await database.query("SELECT id FROM companies WHERE name='Backup Two'")).rows[0].id);
await database.query("INSERT INTO contacts(company_id,type,name) VALUES ($1,'customer','Own Customer'),($2,'customer','Other Customer')",[companyId,otherId]);
await database.query("INSERT INTO company_settings(company_id,negative_stock_pin_hash) VALUES ($1,'SECRET_PIN')",[companyId]);
await database.query("UPDATE companies SET document_design='custom-template' WHERE id=$1",[companyId]);
await database.query("INSERT INTO transactions(company_id,number,type,party,transaction_date) VALUES ($1,'B-1','invoice','Own Customer','2026-10-04'),($2,'B-2','invoice','Other Customer','2026-10-04')",[companyId,otherId]);
await database.exec("INSERT INTO transaction_lines(transaction_id,description,quantity) SELECT id,party,1 FROM transactions WHERE number IN ('B-1','B-2')");
await database.query("INSERT INTO record_attachments(company_id,entity_type,entity_id,file_name,file_data) VALUES ($1,'company',1,'sample.txt','SGVsbG8=')",[companyId]);
const config={enabled:true,frequency:'daily',startDate:'2026-10-04',time:'03:00',retentionDays:30};

test('backup calendar respects UAE midnight, weekly cadence and one-time boundaries',()=>{
  assert.equal(nextBackupAt(config,new Date('2026-10-03T23:00:00Z'),true),'2026-10-03T23:00:00.000Z');
  assert.equal(nextBackupAt(config,new Date('2026-10-03T23:00:00Z')),'2026-10-04T23:00:00.000Z');
  assert.equal(nextBackupAt({...config,frequency:'weekly'},new Date('2026-10-04T00:00:00Z')),'2026-10-10T23:00:00.000Z');
  assert.equal(nextBackupAt({...config,frequency:'once'},new Date('2026-10-04T00:00:00Z')),null);
  assert.throws(()=>parseBackupSchedule({...config,startDate:'2026-02-30'}));
  assert.throws(()=>parseBackupSchedule({...config,time:'24:00'}));
  assert.throws(()=>parseBackupSchedule({...config,retentionDays:0}));
});
test('monthly schedules retain original day through short months and leap years',()=>{
  const monthly={...config,frequency:'monthly',startDate:'2028-01-31',time:'12:00'};
  assert.equal(nextBackupAt(monthly,new Date('2028-02-01')),'2028-02-29T08:00:00.000Z');
  assert.equal(nextBackupAt(monthly,new Date('2028-03-01')),'2028-03-31T08:00:00.000Z');
});
test('company archive includes children, attachments and templates but excludes unrelated company and credentials',async()=>{
  const snapshot=await companySnapshot(db,companyId,randomUUID());
  const text=gunzipSync(snapshot.archive).toString();const archive=JSON.parse(text);
  assert.equal(archive.tables.companies.length,1);assert.equal(archive.tables.companies[0].document_design,'custom-template');
  assert.deepEqual(archive.tables.contacts.map(r=>r.name),['Own Customer']);
  assert.equal(archive.tables.transaction_lines.length,1);assert.equal(archive.tables.transaction_lines[0].description,'Own Customer');
  assert.equal(archive.tables.record_attachments[0].file_data,'SGVsbG8=');
  assert.ok(!text.includes('Other Customer'));assert.ok(!text.includes('SECRET_PIN'));assert.ok(!archive.tables.app_users);
  assert.equal(snapshot.sha256,createHash('sha256').update(snapshot.archive).digest('hex'));
  for(const [table,rows] of Object.entries(archive.tables))assert.equal(archive.manifest.rowCounts[table],rows.length);
});
test('every migrated table has an explicit backup inclusion or exclusion decision',async()=>{
  const excluded=['app_users','app_user_companies','auth_sessions','password_reset_tokens','email_settings','auth_rate_limits','idempotency_requests','sku_work_locks','backup_schedules','company_backups','backup_worker_status'];
  const tables=(await database.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename);
  assert.deepEqual(tables.filter(t=>!backupTables.includes(t)&&!excluded.includes(t)),[]);
});
test('private upload is read back, hashed and downloadable only in the owning company',async()=>{
  const id=await service.createCompanyBackup(companyId,1,'manual');
  const {row}=await service.backupFile(companyId,id);assert.equal(row.status,'completed');assert.ok(row.verified_at);
  await assert.rejects(service.backupFile(otherId,id),/not found/);
  await service.verifyBackup(companyId,id);
  globalThis.__backupBlobs.set(row.blob_path,Buffer.from('corrupt'));
  await assert.rejects(service.verifyBackup(companyId,id),/Integrity check failed/);
  await service.deleteBackup(companyId,id,1);assert.ok(!globalThis.__backupBlobs.has(row.blob_path));
});
test('duplicate scheduled dispatch returns existing completed backup without another upload',async()=>{
  const id=await service.createCompanyBackup(companyId,1,'scheduled','test-dispatch');
  const count=globalThis.__backupBlobs.size;
  assert.equal(await service.createCompanyBackup(companyId,1,'scheduled','test-dispatch'),id);
  assert.equal(globalThis.__backupBlobs.size,count);
});
test('database prevents simultaneous backups and interrupted jobs can retry',async()=>{
  const id=randomUUID();await database.query("INSERT INTO company_backups(id,company_id,run_key,source,status,filename) VALUES ($1,$2,'interrupted','manual','running','test.gz')",[id,companyId]);
  await assert.rejects(service.createCompanyBackup(companyId,1,'manual'));
  await database.query("UPDATE company_backups SET created_at=now()-interval '16 minutes' WHERE id=$1",[id]);
  await service.expireStalledBackups(companyId);
  assert.equal((await database.query('SELECT status FROM company_backups WHERE id=$1',[id])).rows[0].status,'failed');
  assert.equal(await service.createCompanyBackup(companyId,1,'manual','interrupted'),id);
});
test('scheduler creates due backup, advances once schedule, and will not rerun it',async()=>{
  const once={...config,frequency:'once',startDate:'2000-01-01'};
  await database.query("INSERT INTO backup_schedules(company_id,config,enabled,next_run_at,updated_by) VALUES($1,$2,true,now()-interval '1 minute',1)",[companyId,JSON.stringify(once)]);
  assert.equal((await service.runScheduledBackups()).completed,1);
  assert.equal((await database.query('SELECT enabled FROM backup_schedules WHERE company_id=$1',[companyId])).rows[0].enabled,false);
  assert.equal((await service.runScheduledBackups()).completed,0);
});
test('retention removes expired older files even when schedule is paused and preserves latest',async()=>{
  await database.query("UPDATE company_backups SET expires_at=now()-interval '1 day' WHERE company_id=$1 AND status='completed'",[companyId]);
  await service.runScheduledBackups();
  assert.equal((await database.query("SELECT id FROM company_backups WHERE company_id=$1 AND status='completed'",[companyId])).rows.length,1);
});
test('scheduler stops if schedule owner loses administrator access',async()=>{
  await database.exec("UPDATE app_users SET role='sales' WHERE id=1");
  await database.query("UPDATE backup_schedules SET enabled=true,lease_until=NULL,next_run_at=now()-interval '1 minute' WHERE company_id=$1",[companyId]);
  assert.equal((await service.runScheduledBackups()).completed,0);
  assert.equal((await database.query('SELECT enabled FROM backup_schedules WHERE company_id=$1',[companyId])).rows[0].enabled,false);
  await database.exec("UPDATE app_users SET role='all_admin' WHERE id=1");
});
test('worker rejects unrelated repositories, pull requests, workflow paths and unsigned requests',async()=>{
  const claims={repository_id:'1359351844',repository:'jawadzsm-jpg/Quickbook',ref:'refs/heads/main',sub:'repo:jawadzsm-jpg/Quickbook:ref:refs/heads/main',workflow_ref:'jawadzsm-jpg/Quickbook/.github/workflows/backups.yml@refs/heads/main',event_name:'schedule'};
  assert.equal(validBackupClaims(claims),true);
  for(const key of Object.keys(claims))assert.equal(validBackupClaims({...claims,[key]:'untrusted'}),false);
  assert.equal(validBackupClaims({...claims,sub:'repo:jawadzsm-jpg@325708076/Quickbook@1359351844:ref:refs/heads/main'}),true);
  assert.equal(validBackupClaims({...claims,sub:'repo:jawadzsm-jpg@325708076/Quickbook@1359351844:ref:refs/heads/other'}),false);
  assert.equal(await authorizeBackupWorker(new Request('https://app.test/api')),false);
});

test('OIDC verification requires a trusted signature, issuer, audience and unexpired token',async()=>{
  const { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet }=await import('jose');
  const { verifyBackupToken }=await vite.ssrLoadModule('/lib/backup-oidc.ts');
  const pair=await generateKeyPair('RS256'),other=await generateKeyPair('RS256');
  const keys=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'test',alg:'RS256'}]});
  const claims={repository_id:'1359351844',repository:'jawadzsm-jpg/Quickbook',ref:'refs/heads/main',workflow_ref:'jawadzsm-jpg/Quickbook/.github/workflows/backups.yml@refs/heads/main',event_name:'schedule'};
  async function token({issuer='https://token.actions.githubusercontent.com',audience='comnet-backup-worker',expiry='5m',key=pair.privateKey}={}){
    return new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setAudience(audience).setSubject('repo:jawadzsm-jpg/Quickbook:ref:refs/heads/main').setIssuedAt().setExpirationTime(expiry).sign(key);
  }
  assert.equal(await verifyBackupToken(await token(),keys),true);
  for(const option of [{issuer:'https://attacker.test'},{audience:'other-app'},{expiry:'-1s'},{key:other.privateKey}])assert.equal(await verifyBackupToken(await token(option),keys),false);
});

test('offline recovery verifier accepts original archive and rejects tampering',async()=>{
  const { mkdtemp, writeFile, rm }=await import('node:fs/promises');const { tmpdir }=await import('node:os');const { join }=await import('node:path');const { spawnSync }=await import('node:child_process');
  const temp=await mkdtemp(join(tmpdir(),'comnet-backup-test-'));
  try{
    const snapshot=await companySnapshot(db,companyId,randomUUID());const file=join(temp,'sample.gz');await writeFile(file,snapshot.archive);
    let result=spawnSync(process.execPath,['scripts/verify-backup.mjs',file,snapshot.sha256],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).valid,true);
    await writeFile(file,Buffer.from('changed'));result=spawnSync(process.execPath,['scripts/verify-backup.mjs',file,snapshot.sha256],{cwd:root,encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/SHA-256 mismatch/);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('schedule API rejects stale edits and malformed input without changing the saved schedule',async()=>{
  const route=await vite.ssrLoadModule('/app/api/admin-backups/route.ts');
  const revision=Number((await database.query('SELECT revision FROM backup_schedules WHERE company_id=$1',[companyId])).rows[0].revision);
  const result=await route.POST(post({companyId,action:'schedule',revision,schedule:{...config,enabled:false}}));assert.equal(result.status,200,await result.text());
  assert.equal((await route.POST(post({companyId,action:'schedule',revision,schedule:{...config,enabled:true}}))).status,409);
  const malformed=new Request('https://app.test/api',{method:'POST',headers:{origin:'https://app.test','content-type':'application/json'},body:'{bad'});
  assert.equal((await route.POST(malformed)).status,400);
  assert.equal((await database.query('SELECT enabled FROM backup_schedules WHERE company_id=$1',[companyId])).rows[0].enabled,false);
});
