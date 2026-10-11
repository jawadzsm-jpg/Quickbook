# Documentation index

These files are the maintained reference for EasyBook Online Accounting ERP. Read this set before performing a repository-wide analysis.

## Canonical documents

| Document | Scope |
| --- | --- |
| [`../README.md`](../README.md) | Product overview, features, architecture, every API endpoint, workflow summary, quick start, commands and environment |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime layers, trust boundaries, database domains, concurrency, and deployment |
| [`DATA-MODEL.md`](DATA-MODEL.md) | Every table, key columns, relationships, triggers, backup inclusion and the migration checklist |
| [`API.md`](API.md) | Every route, HTTP methods, authorization, and main request inputs |
| [`INTEGRATION-API.md`](INTEGRATION-API.md) | Developer guide for websites using the Integration API v1 (keys, endpoints, sync recipe, examples) |
| [`FEATURES.md`](FEATURES.md) | User-facing capabilities and report catalog coverage |
| [`WORKFLOWS.md`](WORKFLOWS.md) | End-to-end user, accounting, inventory, reporting, and release workflows |
| [`CODEBASE-MAP.md`](CODEBASE-MAP.md) | Directory ownership, common change paths, and documentation maintenance |
| [`FILE-INDEX.md`](FILE-INDEX.md) | One line per source file in `app/`, `lib/`, `db/`, `scripts/` and `hooks/` |
| [`BACKUPS.md`](BACKUPS.md) | Company backup schedules, archives, verification and recovery |

## Historical review documents

The following files are point-in-time audits. They may contain resolved findings or implementation details superseded by later changes:

- `codebase-review.md`
- `financial-report-audit.md`
- `runtime-review.md`

`ci-cd.md` contains additional release operations detail. Where it conflicts with the current workflow or scripts, `.github/workflows/ci-cd.yml`, `scripts/require-ci.mjs`, `vercel.json`, and the canonical documents above take precedence.

## Maintenance rule

Update documentation in the same change when any of these areas change:

- Add, remove, or rename a route: update `API.md` and the endpoint table in `README.md` (and `INTEGRATION-API.md` plus `lib/openapi.ts` for `/api/v1`).
- Add or change a table or migration: update `DATA-MODEL.md`.
- Add, rename, split or remove a source file: update its line in `FILE-INDEX.md`.
- Change roles, permissions, sessions, or company scoping: update `ARCHITECTURE.md` and `README.md`.
- Change a business capability or report: update `FEATURES.md`.
- Change posting, conversion, inventory, VAT, or deployment behavior: update `WORKFLOWS.md`.
- Move or introduce source ownership: update `CODEBASE-MAP.md`.

Use the code as the final authority when a conflict is discovered, then correct the canonical document so the conflict does not persist.
