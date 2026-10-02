# Internal API reference

## Contract and conventions

All endpoints are implemented as Next.js route handlers under `app/api`. They serve the application UI and are not a versioned public API.

- JSON is the default request and response format. Attachment downloads return stored file bytes.
- Protected endpoints use the `comnet_session` cookie.
- Mutating calls must come from the configured application origin.
- Tenant-owned operations require a valid `companyId` and verify the user’s company assignment.
- Current operational and financial responses commonly set `Cache-Control: no-store`.
- Inventory-sensitive writes may accept an `X-SKU-Lock` header created by `/api/sku-locks`.
- Validation errors return `400`, authentication failures `401`, permission failures `403`, missing records `404`, stale/conflicting writes `409`, and lockout/rate conditions `429`.

Authorization labels below refer to permissions defined in `lib/auth.ts`. **Administrator** means `all_admin` or `admin`; **global administrator** means `all_admin`.

## Identity and administration

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/auth/session` | `GET`, `POST`, `PATCH`, `DELETE` | GET/current session; POST/public same-origin login; PATCH/signed-in user; DELETE/same-origin | Read session, sign in, change password, or sign out. POST accepts `email`, `password`; PATCH accepts `currentPassword`, `newPassword`. |
| `/api/admin-users` | `GET`, `POST`, `PATCH`, `DELETE` | Administrator; writes same-origin | List and manage users, roles, active state, passwords, avatars, and company assignments. Sends an invitation when SMTP is configured. Global-admin invariants are enforced server side. |
| `/api/admin-settings` | `GET`, `POST` | Administrator; POST same-origin | Read or set company administrative controls such as the protected negative-stock PIN. Uses `companyId`. |
| `/api/user-preferences` | `PATCH` | Signed-in user, same-origin | Update the current user’s profile preferences, theme color, appearance mode, or avatar fields. |
| `/api/email-settings` | `GET`, `PATCH`, `POST` | Administrator; writes same-origin | Read SMTP status, save encrypted SMTP configuration, or send a test email. |

## Company and workspace configuration

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/workspaces` | `GET`, `POST`, `PATCH`, `DELETE` | `workspace:read` for GET; Administrator for writes | List accessible companies and inventories; create/update/delete companies or inventory locations and their numbering configuration. |
| `/api/company-setup` | `GET`, `PATCH` | `workspace:read` for GET; Administrator for PATCH | Read or update name, base currency, addresses, TRN, bank data, logos, document template, colors, and company stamp. |
| `/api/company-setup/branding` | `PATCH` | Administrator | Update login branding, login identity text, background, and logos for an assigned company. |
| `/api/company-setup/letterhead` | `PATCH` | Administrator | Save the company letterhead design used by A4 document output. |
| `/api/company-setup/clear` | `POST` | Administrator | Clear selected company operational data after protected confirmation while preserving required setup records. |
| `/api/login-branding` | `GET` | Public | Return safe login-page branding and the selectable company identity for optional `companyId`. |

## Core records and accounting

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/records` | `GET`, `POST`, `PATCH`, `DELETE` | `workspace:read` for GET; kind/type-specific write permission; Administrator for DELETE | Central CRUD and posting endpoint for `transactions`, `contacts`, `items`, and `accounts`. Also reads unpaid invoices/bills, open documents, conversion sources, purchase receiving, returns, and vendor history. Inputs include `kind`, `companyId`, `locationId`, record fields, and transaction `lines`. `POST` with `action: "resolve-vendor-payable"`, `companyId`, `party`, and `currency` requires `purchases:write` and resolves the vendor's currency-specific payable account. |
| `/api/journal-entries` | `GET`, `POST`, `PATCH`, `DELETE` | `accounting:manage`; ownership/admin checks on change | List and post balanced journals; edit or delete permitted entries. Uses `companyId`, `locationId`, entry header, and debit/credit lines. |
| `/api/account-history` | `GET` | `accounting:manage` | Return account activity/history for the requested company/account context. |
| `/api/payment-terms` | `GET`, `POST`, `PATCH`, `DELETE` | `sales:write` | List and manage company payment-term values used to calculate due dates. |
| `/api/attachments` | `GET`, `POST`, `DELETE` | Assigned company and entity-specific read/edit rights | List metadata, download by `attachmentId`, upload, or delete transaction/employee attachments. Uses `companyId`, `entityType`, and `entityId`. |

### `/api/records` transaction behavior

The central endpoint recognizes these major transaction groups:

- Sales: invoice, quotation, estimate, proforma invoice, sales order, sales receipt, statement charge, finance charge, credit memo, customer payment.
- Purchasing: bill, purchase order, item receipt, received item bill, expense, vendor credit, bill payment.
- Banking: deposit, cheque, credit card charge, transfer, cheque order, opening balance.

The endpoint validates record-specific permission with `writePermission`, company assignment, location ownership, exchange rate, lines, totals, source allocations, and stock. Posting can create ledger lines, inventory movements, contact balance updates, payment allocations, receipt/invoice source allocations, and audit records. Editing reverses the old effects and applies the replacement inside the write transaction. Purchase-order-linked bills preserve their original order-line identities while allowing received quantity, pricing, VAT, description and line-detail corrections within the unreceived PO balance. Deletion is restricted and refuses unsafe master-data deletion where dependent activity exists.

For a row-level item active/inactive change, `PATCH /api/records` accepts `kind: "items"`, `editMode: "item-status"`, `companyId`, `id`, `expectedStatus`, and `status`. It requires `inventory:manage`, checks the previous status, updates only status, and records the change in the audit log under the SKU write lock.

Selected GET `kind` values beyond the four main record types are:

| `kind` | Purpose | Additional inputs |
| --- | --- | --- |
| `open-sales-documents` | Estimates, proformas, and sales orders with quantities left to invoice | `party` |
| `sales-invoicing` | Source header, available lines, locations, and generated invoices | `sourceId`, optional `locationId` |
| `open-purchase-orders` | Purchase orders with quantities left to receive | `party` |
| `po-receiving` | Source order and remaining quantities | `orderId` |
| `purchase-return-bills` | Bill lines still available for vendor credit | `party`, `currency`, `locationId` |
| `supplier-returns` | Vendor credits and linked bill numbers | `supplierId` |
| `unpaid-invoices` | Customer invoices and remaining allocated balance | `party`, `currency`, `locationId`, optional `paymentId` |
| `unpaid-bills` | Vendor bills and remaining allocated balance | `party`, `currency`, `locationId`, optional `paymentId` |
| `vendor-history` | Administrator audit history for vendor changes | selected vendor/company context |

## Inventory

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/inventory-overview` | `GET` | `inventory:read` | Consolidated item, specification, quantity, price, company/inventory, read-only customization details, and latest positive stock-receipt timestamp. Incoming activity returns outstanding open/partially received Purchase Order lines, their PO status, and the latest linked partial Bill. The `activity.launched` compatibility key supplies New Arrival: positive stock receipts from non-cancelled bills created within the last 12 hours, linked to the bill. `activity.priceChanges` returns only the latest valid price change per item from the last 12 hours. Administrator responses can include broader company data. |
| `/api/out-of-stock` | `GET` | `inventory:read` | Out-of-stock and reorder view, scoped by optional `companyId` and `locationId`. |
| `/api/serial-search` | `GET` | `workspace:read` | Search purchase and sales history using `companyId` and serial query `q`. |
| `/api/item-logistics` | `GET`, `PATCH` | `inventory:read` for GET; `inventory:manage` for PATCH | Read and update HS code, country of origin, dimensions, and weight for items in `companyId`/`locationId`. |
| `/api/inventory-check-reports` | `GET`, `POST`, `PATCH`, `DELETE` | `inventory:read` for read/create; Administrator for update/delete | Build stock-check reports, return selection options, save actual counts, and manage report lines. Uses `companyId`, `locationId`, optional `reportId` or `options=1`. |
| `/api/stock-pricing` | `GET`, `PATCH` | `inventory:read`; write restricted by server role checks | Read company stock prices and batch update sales/GRN prices with expected-value conflict detection. |
| `/api/stock-revaluation` | `GET`, `POST` | `inventory:read`; write restricted by server role checks | Read stock valuation inputs and apply a protected cost revaluation. |
| `/api/transfers` | `GET`, `POST`, `PATCH`, `DELETE` | `inventory:read`; `inventory:transfer` to create; Administrator to edit/delete | Return transfers or cross-company catalog; create, revise, or reverse multi-line stock transfers. `catalog=1` returns selectable items and locations. |
| `/api/shared-items` | `GET`, `POST` | `inventory:read` for GET; `inventory:manage` for POST | Compare same-SKU items across accessible companies and add/copy shared catalog records into a selected company. |
| `/api/sku-locks` | `POST`, `DELETE` | Signed-in user, same-origin | Reserve/refresh or release short-lived locks for SKU-sensitive forms. The client returns the token in `X-SKU-Lock` when saving. |
| `/api/spec-options` | `GET`, `POST`, `PATCH`, `DELETE` | `inventory:read` for GET; `inventory:manage` for writes | List and manage reusable item specification option values. |

## Documents

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/packing-lists` | `GET`, `POST`, `PATCH` | `inventory:read` for GET; `sales:write` for writes | Read invoice data and existing lists, then create/update packing lists with cartons, weights, dimensions, serials, and invoice-line links. Uses `companyId`, `invoiceId`. |
| `/api/warranty-slips` | `GET`, `POST`, `PATCH` | `workspace:read` for GET; `sales:write` for writes | Find invoice items and create/update A4 warranty/RMA service records with customer, supplier, status, serial, and issue details. |

## Reports, VAT, and currency

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/reports` | `GET` | Usually `reports:read`; selected customer/vendor reports also allow their operational permissions; HR requires Administrator | Generate one of 120 report models. Main inputs: `type`, `companyId`, optional `locationId`, `periodStart`, `periodEnd`, `currency`, `supplierId`, statement fields. |
| `/api/memorised-reports` | `GET`, `POST`, `DELETE` | `reports:read`; writes same-origin | List, save/update, or delete user-owned report configurations by company and report key. |
| `/api/vat-management` | `GET`, `POST` | `reports:read` for review; `accounting:manage` for changes | Review company-wide VAT by period; create adjustments and VAT return/filing records. |
| `/api/vat-codes` | `GET`, `POST`, `PATCH` | `workspace:read` for GET; Administrator for writes | List and manage company VAT codes and rates, including the protected `IMPORT_GOODS` UAE import code. |
| `/api/exchange-rates` | `GET`, `POST`, `PATCH` | `workspace:read` for GET; Administrator for writes | List and manage company currency rates and active status. |

## Report request notes

- `type` defaults to `profit-loss`.
- Dates use ISO `YYYY-MM-DD`; the server rejects invalid or inverted ranges.
- Most reports can be scoped to an inventory location. VAT report keys are deliberately company-wide.
- Accounting values are reported in the company home currency. The supported vendor currency reports validate a requested three-letter transaction currency.
- Responses use a normalized `report` object consumed by the client’s table, summary, chart, print, PDF, XLSX, CSV, and drill-down features.

## Safe endpoint changes

When adding or changing a handler:

1. Apply `requireApiUser` or `requireCompanyAccess` before data access.
2. Pass `mutating=true` for writes so same-origin validation runs.
3. Validate company/location relationships using server data.
4. Use `withWriteTransaction` for dependent writes and `skuWrite` for inventory-sensitive writes.
5. Return stable error status codes and avoid exposing internal exception data.
6. Add or update focused tests where the behavior changes a financial, security, concurrency, or release invariant.
7. Update this file and the README endpoint summary.

### Record deletion memo

`DELETE /api/records` requires `deletionReason`, a nonblank string of at most 2000 characters, for transactions, contacts, items and sub-accounts. Successful deletion records the reason and authenticated actor in the company audit log, whose timestamp retains the deletion time. Audit writes commit with the deletion. Existing role, dependency and posting-reversal rules still apply.

### Invoice editing

`PATCH /api/records` with `kind: "transactions"`, `editMode: "details"`, `id`, `companyId` and the current `revision` allows administrators to submit invoice `party`, `salesman`, `dueDate`, and `lineDetails` containing each existing line's `id` plus optional `description`, `quantity`, `unitPrice`, `vatCode`, `comments` and `serialNumber`. Existing metadata and `appendLines` remain supported. Quantities must be positive, prices must be finite and non-negative, and changed VAT codes must be active for the company. Quantity changes reconcile stock movements, COGS and Inventory Asset entries and cannot exceed available stock or reduce a line below its packed quantity. Source-document quantities remain protected because their allocation must be changed from the source workflow. Customer changes require an active customer in the original invoice currency without linked payments. Totals below allocated payments are rejected. Totals, VAT, journals, stock and customer balances commit together.
