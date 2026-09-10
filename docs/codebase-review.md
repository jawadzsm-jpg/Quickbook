# Codebase review — 2026-09-10

The review covered the application's routes, authentication and authorization, database schema and migrations, financial posting/report paths, UI and exports, dependency tree, tests, and build/deployment scripts. Repository-wide lint/type checks and targeted manual review were combined with behavioral tests. This is not a guarantee that every defect has been found.

## Findings addressed

| Priority | Finding | Change |
| --- | --- | --- |
| Critical | Company IDs supplied by clients were accepted without checking membership in records, reports, journal entries, company settings, VAT, and exchange-rate handlers. Aggregate inventory/transfer APIs also exposed other companies. | Added membership checks at the common API boundary and in handlers; filtered aggregate queries and required access to both transfer endpoints. |
| Critical | An account with an empty password hash could authenticate using any company's stock-override PIN. A migration granted global access to a hard-coded email. | Removed PIN login; retired the targeted promotion for future migration runs; added an explicit first-admin bootstrap command. Existing database grants need an administrator review. |
| High | Company administrators could manage users/assignments across companies and change global SMTP configuration. | Restricted global identity and mail administration to All-Admins, preserved global role identity in the UI, protected the last active All-Admin, and moved invitations after transaction commit. |
| High | Financial writes committed individual steps; failures could leave partial invoices, journals, stock changes, or balances. Concurrent stock/conversion requests used separate snapshots. | Added serializable transactions with request-local database context. Both thrown failures and unsuccessful responses roll back. Connections close after each request. |
| High | Purchase lines could reference another company's inventory; new items could use another company's location. | Validate all referenced items and locations against the selected company/inventory. |
| High | API bodies were unbounded and unvalidated JSON; internal database errors were returned to clients. | Authenticate before parsing protected bodies; enforce actual streamed byte limits, JSON objects, same-origin writes, private/no-store responses, and generic server errors. |
| High | Export fields could become spreadsheet formulas; HTML document titles were interpolated without escaping. | Centralized formula-safe CSV encoding, escaped document titles, and hardened chart style interpolation. |
| High | Framework and transitive dependencies included known vulnerabilities. | Upgraded Next.js to 16.3.4, React to 19.2.8 and affected tooling/transitives; removed unused Vinext/Cloudflare dependencies; applied a targeted esbuild override for the legacy Drizzle tooling dependency. Added dependency audits to CI. |
| Medium | Password/PIN verification used synchronous CPU-intensive work and accepted malformed stored parameters; login failure counters could lose concurrent increments. | Use asynchronous derivation, strict supported hash formats, bounded inputs, and atomic SQL increments for failed logins. |
| Medium | Attachment size/MIME checks trusted client metadata and did not validate record ownership. | Validate canonical base64 and decoded byte length, match MIME declarations, reject active HTML/SVG types, validate the parent record, and enforce ten files per record. |
| Medium | Independently rounded foreign-currency totals could unbalance journals. | Derive base total from the rounded base subtotal and VAT. Strengthened numeric bounds, journal balancing, and calendar-date validation. |
| Medium | Report queries inconsistently handled inventory filters and company-wide item queries; standard P&L ignored supplied periods. “Budget” figures were prior-year actuals. | Fixed inventory filters and standard financial report date bounds; labeled prior-year baselines accurately in generated report outputs. |
| Medium | Migration statements and their completion markers were not atomic; concurrent runners could race. | Use a single connection, advisory lock, and one transaction per migration. |
| Performance | User listings made a membership query per user; journal responses repeatedly filtered the full line collection; overlapping client loads could show stale company records. | Batch membership reads, group journal lines once, reuse request authentication results, and abort superseded record requests. |
| Validation | Default tests only exercised seven release-gate cases. Existing UI/HTML tests targeted the retired runtime. | Added security and database regression suites, actual CSS compilation, and Next.js production smoke tests; wired them into CI. |

## Verification

The test suite uses real application handlers and an isolated in-memory PostgreSQL engine for migrations, writes, and rollback tests. Neon networking is replaced only in those tests. It covers company denial, global administration boundaries, JSON limits, origin validation, malformed hashes, attachment encoding, spreadsheet injection, migrations, rollback on thrown errors and error responses, company provisioning, foreign inventory references, balanced foreign-currency posting, late invoice failure, transfer shortages, and report periods.

The production smoke test starts Next.js with database access disabled and checks the login page, protected endpoints, cache/security headers, and malformed/cross-origin login requests. Final checks passed: repository-wide ESLint, TypeScript, Next.js production build, 40 application/release/UI/database tests, and one production smoke test. `npm audit` reported zero known vulnerabilities, down from 24 findings (including one critical) in the original dependency tree. The final additional user-administration regression test and test-server configuration were checked with lint and the full 40-test suite after the complete CI command had passed.

## Remaining limitations and follow-up

See [the runtime follow-up](runtime-review.md) for subsequent fixes and current validation. The observations below describe the initial review; the follow-up supersedes attachment interception/download, login budget, error telemetry and local runtime limitations.

- **Production data and transport were not exercised.** No production database credentials were available. No live migrations, seed, bootstrap, email, deployment, or remote CodeQL run was performed. Validate Neon WebSocket connectivity and multi-client contention in staging before deployment. PGlite verifies PostgreSQL semantics but is not a multi-session Neon load test.
- **Existing data is not repaired automatically.** Previous partial postings, unbalanced entries, cross-company references, PIN-derived passwords, broad company assignments, and previously granted global roles may remain. Reconcile and review them with an authorized administrator. Retiring a historical migration cannot revoke privileges already granted.
- **Financial data uses floating-point database columns.** The rounding fix addresses a demonstrated imbalance; a reviewed migration to fixed-precision amounts, currency-specific minor units, and reconciliation is still warranted. Reports, tax treatment, COGS currency conventions, opening balances, payment allocation/aging, refunds, and intercompany transfer accounting need finance-owner acceptance testing. Prior-year comparisons are not a persisted budgeting system.
- **Large-company scale needs further work.** Reports still load several whole-company datasets and many screens use fixed row limits. Add pagination, report-specific SQL aggregation, query plans/indexes based on real workloads, and explicit truncated-result indicators.
- **Deployment-level security remains relevant.** Add distributed rate limiting at ingress for authentication/credential verification and monitor failed attempts. The existing per-account lockout does not provide an IP/global request budget. Review egress policy for administrator-configured SMTP destinations. The CSP controls framing/forms/base URLs but is not a full nonce-based script policy.
- **Some UI features remain fragile or incomplete.** Attachment capture still intercepts browser fetch and detects dialogs from DOM text; the attachment API currently lists metadata without a download endpoint. PDF exports replace non-ASCII text and truncate long lines. Specification choices are a shared global catalog editable by inventory managers, not company-specific configuration. These deserve explicit product decisions before redesign.
- **Error telemetry is limited.** Clients no longer receive server details; older handlers still convert some errors before the shared boundary can classify them. Add structured server-side diagnostics that omit credentials and financial payloads.

A source/configuration snapshot from before the edits is available locally at `/tmp/comnet-source-before-review.tar.gz`. This checkout has no Git metadata.

## Sources used for dependency/driver verification

- [Next.js July 2026 security release](https://nextjs.org/blog/july-2026-security-release).
- Installed Neon driver README and type declarations, plus [Neon serverless driver documentation](https://neon.com/docs/serverless/serverless-driver).
- npm registry package metadata and `npm audit` advisory results at review time. Audit results describe known advisories, not an absence of application vulnerabilities.
