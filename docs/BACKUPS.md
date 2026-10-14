# Company backups

Admin Controls → Backup & recovery manages the selected company's business-data archives. Only an active administrator assigned to that company, or an all-company administrator, can list, create, download, verify, delete or schedule backups. Mutation requests also require a same-origin session. Backup actions are recorded in the company audit log.

## Operating the feature

1. Select the company and open Admin Controls.
2. Use **Back up now** for an immediate archive. Completion includes a read-back SHA-256 check.
3. Set the start date, UAE time (Asia/Dubai, UTC+04:00), frequency and retention, enable the schedule, then save. One-time, daily, weekly and monthly schedules are supported. Weekly runs use the starting weekday; monthly runs clamp the starting day to the final day of shorter months.
4. Check the next run and scheduler heartbeat. Dispatch is checked approximately every five minutes, not guaranteed at an exact second. Missed repetitions produce one current snapshot, not historical snapshots for each missed period.
5. Download an additional copy to independently controlled secure storage. History shows the latest 100 runs, UTC+04 dates, status, size, record count, fingerprint and verification time.

Retention choices are 7, 30, 90 or 365 days and apply to newly created archives. Changing the policy does not rewrite existing expiry dates. The scheduler deletes expired completed files, including files created manually or with schedules now paused, while retaining the latest successful file per company. Explicit administrator deletion can remove that final file and requires confirmation. Deleted metadata remains in history. Pausing a schedule does not interrupt a backup already in progress.

## Contents and boundaries

The versioned `.comnet.json.gz` archive contains a manifest and table-name-keyed row arrays. It includes company branding/templates, accounts, contacts, items, transactions and lines, ledger entries, allocations, inventory movements, stock checks, packing lists, payroll sheets, tax working papers, audit records and database attachments. Rows retain source IDs and foreign keys. Snapshot queries share a serializable database transaction.

Company master and child rows are scoped by their company or owning parent. Shared specification options, transfers involving the company and historical cross-company stock-check details are preserved as reference context. Login accounts, password hashes, sessions, administrative PIN hashes, global SMTP credentials, other companies' master records, temporary locks and backup metadata are excluded. This is a **company business-data archive**, not a full PostgreSQL/application disaster-recovery image. User references and cross-company references need explicit mapping during recovery; do not expect a single-company archive to satisfy every foreign key in an empty database.

Archives are limited to 128 MiB of row JSON before compression and 64 MiB compressed. Oversized snapshots fail visibly rather than silently omitting records. Files live in a private Vercel Blob store, outside the accounting database. No public URL is returned; authenticated company-authorized routes stream downloads. Private access is not a separately password-encrypted portable file: downloaded archives contain sensitive business records and must be stored accordingly.

## Recovery procedure

There is no one-click restore or automatic write-back to live records.

1. Obtain the archive and its SHA-256 fingerprint from history (keep both with independent copies). If accounting metadata is lost, a platform administrator can retrieve the private object under `company-backups/<companyId>/` and use the independently recorded hash. Do not substitute a hash computed from a suspect file for a known-good fingerprint.
2. Run `npm run backup:verify -- /secure/path/archive.comnet.json.gz <sha256>`. This offline tool validates the digest, bounded decompression, manifest, company identity and per-table counts. It only prints metadata; it never connects to a database.
3. Prepare an isolated PostgreSQL database from the application revision/schema identified by the manifest. A technical administrator must plan ID remapping or preserve IDs in a compatible database, reconcile users and cross-company references, preserve existing shared specification options, and import records in foreign-key dependency order. Company PINs and login/SMTP configuration must be provisioned separately.
4. Review row counts, journal debit/credit totals, balances, allocations, inventory quantities, attachments and sample custom-template documents in that isolated application. Reset relevant sequences after preserving IDs. Archive integrity alone does not prove recovery correctness.
5. Only after a recovery rehearsal and explicit approval, plan a separately controlled production recovery with a fresh pre-recovery backup and rollback plan. Never replay source rows directly over a running ledger.

The automated suite tests archive contents and integrity against an isolated database; it does not claim an end-to-end production restore rehearsal.

## Deployment and monitoring

- Apply migration `0081_company_backups.sql` through the existing deployment migration runner.
- Connect a **private** Vercel Blob store to the project and provide the server-only `BLOB_READ_WRITE_TOKEN`. The ComNet project has `comnet-private-backups` connected. Do not expose this token through a `NEXT_PUBLIC_` variable.
- `.github/workflows/backups.yml` first calls `POST /api/notifications/run` (PDC reminders, pending notification emails and making 90-day idle items inactive; its failure only logs a warning), then dispatches `POST /api/admin-backups/run` from `main` every five minutes and supports manual dispatch. It uses a short-lived GitHub Actions OIDC token; no persistent scheduler secret is required. The production route validates signature, issuer, audience, expiry, repository ID/name, main ref, exact workflow path and event type. Preview environments reject worker dispatch.
- Schedules start disabled until an administrator saves an enabled schedule. The workflow only becomes active on the default branch. GitHub queue delays, disabled Actions, exhausted runner quotas, or inactive-repository scheduling policies can stop/delay dispatch. The UI warns when an enabled schedule has no recent heartbeat (30 minutes); monitor failed workflow runs too.
- Each dispatch claims at most two due companies with 15-minute leases. Per-company database uniqueness prevents simultaneous backups; a scheduled run key prevents duplicate completed files after retries. Interrupted jobs become failed after 15 minutes and can retry; failed scheduled runs back off for 30 minutes. Concurrent schedule changes use revisions, and old jobs cannot overwrite a new schedule. Schedules stop if their owner loses administrator/company access.
- Failed uploads are removed on a best-effort basis. If the process is terminated during upload or cleanup fails, a private orphan can remain. Periodically reconcile private objects with completed metadata before deleting orphans; never delete an active upload. Retention cleanup removes up to ten expired objects per dispatch.
- A worker heartbeat means the dispatcher reached the database; it does not guarantee a successful backup. Review completed timestamps and failed run messages. After deployment, create and download a small manual backup, verify it offline, then observe a one-time scheduled run before relying on unattended operation.
