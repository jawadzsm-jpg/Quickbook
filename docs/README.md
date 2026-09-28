# Documentation index

These files are the maintained reference for ComNet Enterprise Accounting. Read this set before performing a repository-wide analysis.

## Canonical documents

| Document | Scope |
| --- | --- |
| [`../README.md`](../README.md) | Product overview, quick start, commands, environment, and high-level architecture |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime layers, trust boundaries, database domains, concurrency, and deployment |
| [`API.md`](API.md) | Every route group, HTTP methods, authorization, and main request inputs |
| [`FEATURES.md`](FEATURES.md) | User-facing capabilities and report catalog coverage |
| [`WORKFLOWS.md`](WORKFLOWS.md) | End-to-end user, accounting, inventory, reporting, and release workflows |
| [`CODEBASE-MAP.md`](CODEBASE-MAP.md) | Directory ownership, common change paths, and documentation maintenance |

## Historical review documents

The following files are point-in-time audits. They may contain resolved findings or implementation details superseded by later changes:

- `codebase-review.md`
- `financial-report-audit.md`
- `runtime-review.md`

`ci-cd.md` contains additional release operations detail. Where it conflicts with the current workflow or scripts, `.github/workflows/ci-cd.yml`, `scripts/require-ci.mjs`, `vercel.json`, and the canonical documents above take precedence.

## Maintenance rule

Update documentation in the same change when any of these areas change:

- Add, remove, or rename a route: update `API.md` and the endpoint summary in `README.md`.
- Change roles, permissions, sessions, or company scoping: update `ARCHITECTURE.md` and `README.md`.
- Change a business capability or report: update `FEATURES.md`.
- Change posting, conversion, inventory, VAT, or deployment behavior: update `WORKFLOWS.md`.
- Move or introduce source ownership: update `CODEBASE-MAP.md`.

Use the code as the final authority when a conflict is discovered, then correct the canonical document so the conflict does not persist.
