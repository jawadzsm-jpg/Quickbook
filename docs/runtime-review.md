# Runtime robustness follow-up

## Implemented

- Added explicit development-only, persistent PGlite mode so the actual application runs without production credentials. It applies every migration, binds to loopback, guards concurrent database use and generates private local credentials. Production continues to use Neon.
- Replaced global browser fetch interception and DOM-based attachment detection with controlled form state. Attachments commit atomically with invoices/employees; invalid files roll back the parent write. Downloads enforce entity/company access, validate stored bytes and use attachment/sandbox headers. Transaction reversal removes associated attachments.
- Added optional idempotency keys for authenticated POST requests, stored atomically with successful writes. Invoice, transfer and journal creation retain a key for retries, preventing duplicate postings after a lost response. Reusing a key with different content returns a conflict. Migration 0033 creates the supporting tables.
- Added database-backed login budgets across application instances: 300 attempts per minute globally and 30 per normalized email per 15 minutes, alongside account lockouts. Expired account lockouts reset correctly. Limits do not trust spoofable forwarded IP headers. Expired budget rows are periodically removed.
- Added structured error identifiers without logging SQL, credentials or financial payloads. Constraint/concurrency failures return safe conflict responses. Empty and malformed collection payloads receive explicit validation errors.
- Fixed transfers where several source locations contribute the same SKU to one destination. Destination quantities are aggregated before upsert.
- Blocked deletion of inventory/contact records with balances or transaction history, and source documents with a live conversion. Deleting a converted document reopens its source.
- New companies use their selected currency for bank defaults and standard accounts. Posted companies cannot change base currency and silently relabel their history.
- Fixed staff creation to include company assignments and refresh the access list. Decimal fields now accept fractional values.
- Added real Chromium workflows and included them in GitHub Actions. Updated the stale starter README with actual setup and validation instructions.

## Verified locally

`npm run ci` passed: ESLint, 45 release/security/database/UI tests, TypeScript, optimized Next.js build, one production HTTP smoke test, and npm audit (zero known advisories in the installed dependency tree).

`npm run test:browser` passed two Chromium workflows. They authenticate through the UI, navigate 23 application sections, create an isolated company, post an invoice with an attachment, check balanced journal entries and stock reduction, reject insufficient stock, reverse the invoice and verify stock restoration. A second workflow creates a company-assigned viewer through the actual form, verifies persisted access and removes that test user. Database tests also cover attachment rollback/downloads, multi-source transfers, currency protection, idempotent replay and shared login budgets.

The local server is available at http://localhost:3000 while its process is running. Login credentials are in `.local-data/login.json`; local browser fixtures remain in the development database. Restart with `npm run dev:local`.

## Limits and deployment requirements

Apply migration 0033 before deploying these handlers. No production database, production migration, deployment, SMTP delivery or remote CodeQL run was performed. Confirm Neon WebSocket transport and concurrent-client behavior in staging; embedded PostgreSQL is not a distributed load test. Authentication budgets supplement ingress controls and use shared global/email buckets rather than IP attribution.

Idempotency records are retained for successful keyed writes; a production retention policy is still needed. Most reads/reports still use fixed row limits or whole-company datasets and need workload-driven pagination and aggregation. Financial columns still use floating point and need a reviewed fixed-precision migration and reconciliation. Existing historical data is not repaired automatically. Tax, COGS, opening balances, payment allocation and intercompany accounting require finance-owner acceptance testing. Shared specification options and PDF internationalization remain product limitations. The earlier review has additional context.

Passing these checks establishes tested behavior, not a guarantee that every defect or vulnerability has been eliminated.
