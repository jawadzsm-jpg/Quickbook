# Codebase map

Use this file to locate implementation ownership without rescanning the whole repository. Start with the narrow files listed for the task, then follow their imports.

## Top-level ownership

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Server session gate: login, password change, or application shell |
| `app/enterprise-app.tsx` | Main client workspace, navigation, state, generic CRUD/transaction forms, report catalog and rendering orchestration |
| `app/*.tsx` | Focused operational screens, report layouts, document templates, attachment and printing UI |
| `app/api/**/route.ts` | Internal JSON API, access checks, validation, database reads/writes |
| `components/ui/` | Shared Base UI/shadcn-style design primitives |
| `lib/` | Auth, domain calculations, report transforms, validation, exports, print/document helpers, concurrency |
| `db/schema.ts` | Drizzle PostgreSQL schema for 32 mapped tables; four infrastructure tables are migration-managed and accessed with parameterized SQL |
| `db/index.ts` | Neon/PGlite selection and write transaction context |
| `db/local.ts` | Persistent PGlite adapter restricted to development |
| `drizzle/` | Ordered SQL migrations |
| `scripts/` | Migrations, seed, admin bootstrap, local launcher, CI/deployment gates |
| `tests/` | Node release gates and focused security/domain tests; browser specs under `tests/browser/` |
| `.github/workflows/ci-cd.yml` | CI and CodeQL definitions |
| `next.config.ts` | Next.js configuration and response security headers |
| `vercel.json` | Vercel install/build commands and Git deployment setting |

## Application screen ownership

| Area | Primary UI files | Primary API |
| --- | --- | --- |
| Login/password | `login-screen.tsx`, `password-change-screen.tsx` | `auth/session`, `login-branding` |
| Main records and transactions | `enterprise-app.tsx` | `records` |
| Company home/report cards | `enterprise-app.tsx`, `live-profit-loss-summary.tsx` | `reports`, `records` |
| Customer reporting | `customer-open-balance.tsx`, `active-customers-report.tsx`, `statement-layout.tsx` | `reports`, `records` |
| Sales conversion | `open-sales-documents.tsx`, `sales-source-invoicing.tsx` | `records` |
| Purchase receiving/returns | `open-purchase-orders.tsx`, `purchase-order-receiving.tsx`, `purchase-return-source.tsx` | `records` |
| Payments | `unpaid-invoices.tsx`, `unpaid-bills.tsx`, `payment-terms-picker.tsx` | `records`, `payment-terms` |
| Inventory overview/out of stock | `inventory-overview.tsx`, `shared-out-of-stock.tsx` | `inventory-overview`, `out-of-stock` |
| Item logistics/specs | `item-logistics-center.tsx`, item forms in `enterprise-app.tsx` | `item-logistics`, `spec-options` |
| Stock pricing/revaluation | `stock-pricing.tsx`, `stock-revaluation.tsx` | `stock-pricing`, `stock-revaluation` |
| Transfers | `transfer-center.tsx` | `transfers` |
| Inventory checks | `inventory-check-reports.tsx` | `inventory-check-reports` |
| Serial search | `serial-number-search.tsx` | `serial-search` |
| Shared item catalog | `shared-item-catalogue.tsx` | `shared-items` |
| Journals/accounts | `journal-entry-center.tsx`, account UI in `enterprise-app.tsx`, `account-history.tsx` | `journal-entries`, `account-history`, `records` |
| VAT | `vat-code-center.tsx`, `vat-management-center.tsx` | `vat-codes`, `vat-management` |
| VAT reports | `vat-report-library.tsx`, `vat-report-table.tsx`, `vat-report-filters.tsx`, `lib/vat-report.ts`; exports in `lib/report-export.ts`, stamp in `sales-report-stamp.tsx` and `lib/report-stamp.ts` | `reports` |
| Currency | `currency-rate-center.tsx` | `exchange-rates` |
| Warranty/RMA | `warranty-center.tsx` | `warranty-slips` |
| Packing lists | `invoice-packing-list.tsx` | `packing-lists` |
| Sales document output | `sales-document-template.tsx`, `custom-invoice-template.tsx`, `delivery-note-template.tsx` | source transaction APIs |
| Letterhead/design | `letterhead-center.tsx`, `letterhead-page.tsx`, `company-template-designer.tsx` | `company-setup/*` |
| Attachments | `invoice-attachments.tsx`, `record-attachments.tsx`, `attachment-capture.tsx` | `attachments` |
| UAE cheque | `uae-bank-cheque.tsx` | `records` |
| User/admin controls | `user-role-center.tsx`, management UI in `enterprise-app.tsx` | `admin-users`, `admin-settings`, `email-settings` |

## Domain module ownership

| Concern | Files |
| --- | --- |
| Sessions and authorization | `lib/auth.ts`, `lib/password.ts`, `lib/admin-pin.ts` |
| API body/errors/validation | `lib/api.ts`, `lib/errors.ts`, `lib/validation.ts`, `lib/email-validation.ts` |
| Inventory write locking | `lib/sku-locks.ts` and `app/use-sku-lock.tsx` |
| Invoice pricing and dates | `lib/invoice-pricing.ts`, `lib/payment-terms.ts`, `lib/contact-currency.ts` |
| Account links and defaults | `lib/standard-accounts.ts`, `lib/report-account-links.ts` |
| Profit & Loss/financial | `lib/profit-loss.ts`, `lib/financial-reports.ts`, `lib/pnl-export.ts`, `lib/pnl-presentation.ts`; P&L UI in `app/profit-loss-report.tsx` and `app/profit-loss-library.tsx`; Financial UI/summary in `app/financial-report.tsx`, `app/financial-report-library.tsx`, `lib/financial-presentation.ts` |
| Sales report presentation/stamp | `app/sales-report-library.tsx`, `app/sales-report-table.tsx`, `app/sales-report-filters.tsx`, `app/sales-report-stamp.tsx`, `lib/report-stamp.ts` |
| Vendors report presentation | `app/vendor-report-library.tsx`, `app/vendor-report-table.tsx`, `app/vendor-report-filters.tsx`, domain/filter/account helpers in `lib/vendor-report.ts`; shared stamp preview in `app/sales-report-stamp.tsx` |
| Purchases report presentation | `app/purchase-report-library.tsx`, `app/purchase-report-table.tsx`, `app/purchase-report-filters.tsx` |
| Inventory report presentation | `app/inventory-report-library.tsx`, `app/inventory-report-table.tsx`, filters in `app/enterprise-app.tsx` |
| Budget presentation | `app/budget-report-library.tsx`, `lib/budget-report.ts`; baseline generation and account exceptions in `app/api/reports/route.ts` |
| Operational report summaries | `lib/sales-report.ts`, `customer-report.ts`, `vendor-report.ts`, `purchase-report.ts`, `inventory-report.ts`, `banking-report.ts`, `accountant-report.ts`, `employee-report.ts`, `list-report.ts`, `budget-report.ts` |
| Report period/export | `lib/report-period.ts`, `lib/report-export.ts`, `lib/record-list-export.ts`, `lib/export.ts` |
| Documents and printing | `lib/document-design.ts`, `lib/document-output.ts`, `lib/document-print.ts`, `lib/letterhead.ts`, `lib/uae-cheque-layouts.ts` |
| Attachments | `lib/attachments.ts`, `lib/record-attachments.ts` |
| SMTP | `lib/smtp.ts` |

## Common change paths

### Add or change a transaction type

1. Update type/navigation/form behavior in `app/enterprise-app.tsx`.
2. Update authorization and posting/reversal behavior in `app/api/records/route.ts`.
3. Update journal/account mapping and inventory movement rules in that route and relevant `lib/` helpers.
4. Update reports that classify the transaction in `/api/reports` or report modules.
5. Add a migration if a persisted field or constraint changes.
6. Update `FEATURES.md`, `WORKFLOWS.md`, and `API.md`.

### Add or change a report

1. Add/update the catalog entry in `app/enterprise-app.tsx`.
2. Implement data generation in `app/api/reports/route.ts` or a focused `lib/*-report.ts` module.
3. Add summary/drill-down mapping to the matching report module.
4. Verify normalized columns and row types work in PDF, XLSX, CSV, and print.
5. Update report tests, the category count in `FEATURES.md`, and `API.md` if inputs/access changed.

### Add a screen or endpoint

1. Add the focused component under `app/` and connect it in `enterprise-app.tsx`.
2. Add `app/api/<name>/route.ts` with authentication, permission, origin, company, and validation checks.
3. Use a transaction and SKU wrapper where consistency requires them.
4. Update navigation role maps if the view is role-visible.
5. Update `API.md`, `FEATURES.md`, and this map.

### Change company documents

Start with `sales-document-template.tsx`, the specific document component, `lib/document-output.ts`, `lib/document-print.ts`, and `lib/letterhead.ts`. Company design fields live in `company_settings` and `/api/company-setup`. Verify browser A4 print and PDF export with representative long tables and optional stamp/logo content.

### Change authentication or roles

Start with `lib/auth.ts`, `app/page.tsx`, `/api/auth/session`, `/api/admin-users`, the `roleViews`/`roleWriteViews` maps in `enterprise-app.tsx`, and security tests. Update both `ARCHITECTURE.md` and the README role table.

### Change the database

1. Edit `db/schema.ts`.
2. Run `npm run db:generate`.
3. Inspect the new SQL under `drizzle/` for constraints, defaults, indexes, and data compatibility.
4. Update seed/bootstrap logic if required.
5. Test Neon-compatible SQL and local PGlite behavior where the changed workflow supports local mode.
6. Update the table/domain list in `ARCHITECTURE.md` when the model shape changes.

## Important implementation conventions

- `lib/auth.ts` is the live server authorization implementation. `lib/access.ts` contains a parallel pure access model used by tests; keep them synchronized if roles or permission rules change.
- Server company checks are required even when selectors already limit the client.
- Use ISO date strings for stored business dates and timestamps as established by the schema.
- Reports should return the normalized report model instead of embedding export-specific formatting.
- Avoid reading or writing the database directly from client components.
- Keep `app/enterprise-app.tsx` integration changes narrow; place substantial new UI or domain logic in a focused file.
- Do not renumber or rewrite applied migrations. Add a new ordered migration.
- The local launcher exists as `scripts/dev-local.mjs`; it currently has no `dev:local` package script, so invoke it with Node unless the package script is deliberately added.

## Verification map

| Change type | Minimum relevant checks |
| --- | --- |
| Documentation only | Markdown links, endpoint inventory, `git diff --check` |
| UI/component | `npm run lint`, `npm run typecheck`, targeted browser/manual view if available |
| Domain calculation/report | Targeted Node test plus `npm run typecheck` |
| API/security/concurrency | Relevant security/transaction tests, lint, typecheck |
| Database/migration | Migration review, affected workflow test, CI build |
| Release configuration | Release-gate tests and workflow/script review |

The complete repository gate is `npm run ci`.

## Documentation update checklist

- Endpoint changed: `docs/API.md`.
- Architecture/security/data flow changed: `docs/ARCHITECTURE.md`.
- User capability or report count changed: `docs/FEATURES.md`.
- Business or release sequence changed: `docs/WORKFLOWS.md`.
- Source ownership changed: this file.
- Setup, command, environment, or top-level overview changed: `README.md`.

Historical audit documents should remain historical. Record current behavior in the canonical set instead of treating an old audit snapshot as the active design.

Shared Report Center presentation is in `app/enterprise-app.tsx`, with generic responsive tables in `app/report-data-table.tsx`. `lib/report-presentation.ts` owns report-key deduplication and numeric column presentation; `lib/report-export.ts` shares category summaries across CSV/XLSX/PDF. All report categories use `app/sales-report-stamp.tsx` for the common A4 stamp preview.

Accountant library and filters are in `app/accountant-report-library.tsx`; filter identities, summaries and unresolved-link warnings are in `lib/accountant-report.ts`. The report API returns those warnings without dropping original amounts; shared exports preserve them.

Lists presentation is in `app/list-report-library.tsx`; grouping, filters, numeric sorting and summaries are in `lib/list-report.ts`. Item directories attach inventory asset-account links in `app/api/reports/route.ts`; shared exports include unresolved-link warnings.

Employee HR profile fields live on `contacts` (`0072_employee_hr_profile.sql`). `lib/employee-hr.ts` validates profile amounts/dates/account links and redacts private fields. `app/employee-hr-fields.tsx` owns profile fields and inline details; record APIs persist and enforce salary-account selection, and employee balance reports expose the admin-only summary.
