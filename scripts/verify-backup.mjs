import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// Offline inspection only: never connects to a database or writes business records.
try {
  const [path, expected] = process.argv.slice(2);
  if (!path || !/^[a-f0-9]{64}$/i.test(expected ?? '')) throw Error('Usage: npm run backup:verify -- <archive.comnet.json.gz> <SHA-256 from backup history>');
  if ((await stat(path)).size > 64 * 1024 * 1024) throw Error('Archive exceeds the supported compressed size.');
  const bytes = await readFile(path);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected.toLowerCase()) throw Error('SHA-256 mismatch. Do not use this file for recovery.');
  const archive = JSON.parse(gunzipSync(bytes, { maxOutputLength: 130 * 1024 * 1024 }).toString('utf8'));
  const { manifest, tables } = archive;
  if (manifest?.format !== 'comnet-company-backup' || manifest.version !== 1 || !tables || !manifest.rowCounts) throw Error('Unsupported backup format.');
  if (!Number.isInteger(manifest.companyId) || tables.companies?.length !== 1 || tables.companies[0].id !== manifest.companyId) throw Error('Company identity does not match the manifest.');
  if (Object.keys(tables).length !== Object.keys(manifest.rowCounts).length) throw Error('Table inventory mismatch.');
  let records = 0;
  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows) || rows.length !== manifest.rowCounts[name]) throw Error(`Record count mismatch: ${name}`);
    records += rows.length;
  }
  console.log(JSON.stringify({ valid: true, companyId: manifest.companyId, createdAt: manifest.createdAt, schemaVersion: manifest.schemaVersion, appRevision: manifest.appRevision, tables: Object.keys(tables).length, records, sha256: actual }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Backup verification failed.');
  process.exitCode = 1;
}
