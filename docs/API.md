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
| `/api/admin-users` | `GET`, `POST`, `PATCH`, `DELETE` | All-Admin only (company Administrators get 403); writes same-origin | List and manage users, roles, active state, passwords, avatars, and company assignments. Sends an invitation when SMTP is configured. `POST` rejects an email that already belongs to a user (case-insensitive, naming a deactivated match) and saves the user and company access in one transaction; other database failures return the PostgreSQL reason. Global-admin invariants are enforced server side: you cannot change your own role or deactivate yourself, and the last active Administrator or All-Admin cannot be demoted, deactivated or deleted. `PATCH` validates every field before writing and applies role, company, status and password changes in one transaction; those changes sign the user out, while profile-only edits (`fullName`, `phone`, `whatsapp`, `avatarData`) keep their sessions. |
| `/api/admin-settings` | `GET`, `POST` | Administrator with access to `companyId`; POST same-origin | `GET` returns whether the company's negative-stock override PIN is configured, its last change, and the 10 most recent overrides. `POST` sets/changes the PIN (`newPin`; `currentPin` required once configured) or, with `action: "clear"` and the current PIN, removes it so overrides are blocked. Changes are audited. |
| `/api/user-preferences` | `PATCH` | Signed-in user, same-origin | Update the current user’s profile preferences, appearance mode, or avatar fields. `themeColor` is still accepted for compatibility but no longer changes the interface; the app uses one fixed palette. |
| `/api/email-settings` | `GET`, `PATCH`, `POST` | All-Admin only (company Administrators get 403); writes same-origin | Read SMTP status, save encrypted SMTP configuration, or (`POST`) verify that the saved server accepts the login; no email is sent. |

## Company and workspace configuration

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/workspaces` | `GET`, `POST`, `PATCH`, `DELETE` | `workspace:read` for GET; Administrator for writes | List accessible companies and inventories; create/update/delete companies or inventory locations and their numbering configuration. |
| `/api/company-setup` | `GET`, `PATCH` | `workspace:read` for GET; Administrator for full PATCH; accountant for stamp/bank fields only | Read or update name, base currency, addresses, TRN, bank data, logos, document template, colors, and company stamp. |
| `/api/cargos` | `GET`, `POST`, `PATCH`, `DELETE` | Any signed-in user with company access for GET/POST (sales included); the creator or an administrator for PATCH; administrators for DELETE | Shared cargo / freight agent list (`lib/cargo.ts`, table `cargos`, migration 0093). |
| `/api/company-setup/branding` | `PATCH` | Administrator | Update login branding, login identity text, background, and logos for an assigned company. |
| `/api/company-setup/letterhead` | `PATCH` | Administrator | Save the company letterhead design used by A4 document output. |
| `/api/company-setup/clear` | `POST` | Administrator | Clear selected company operational data after protected confirmation while preserving required setup records. `sections` may include `transactions`, `stock`, `contacts`, `reports`, `settings`, `setup`. Items and inventory locations are never deleted; `stock` sets item quantities to zero and requires `transactions` (stock movements belong to transactions). |
| `/api/login-branding` | `GET` | Public | Return safe login-page branding and the selectable company identity for optional `companyId`. |

## Core records and accounting

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/records` | `GET`, `POST`, `PATCH`, `DELETE` | `workspace:read` for GET; kind/type-specific write permission; Administrator for DELETE (inventory users may delete `items` only) | Central CRUD and posting endpoint for `transactions`, `contacts`, `items`, and `accounts`. Also reads unpaid invoices/bills, open documents, conversion sources, purchase receiving, returns, and vendor history. Inputs include `kind`, `companyId`, `locationId`, record fields, and transaction `lines`. `POST` with `action: "resolve-vendor-payable"`, `companyId`, `party`, and `currency` requires `purchases:write` and resolves the vendor's currency-specific payable account. |
| `/api/journal-entries` | `GET`, `POST`, `PATCH`, `DELETE` | `accounting:manage`; ownership/admin checks on change | List posted journals with optional inclusive `dateFrom`/`dateTo` (invalid or reversed ranges return 400), without the former 300-entry cap; responses are private/no-store. Lines include verified company `accountId`, `accountCode` and `accountCurrency`, or null/empty values for unresolved links. Post balanced journals; edit/delete permitted entries with unchanged revision rules. Uses `companyId`, `locationId`, entry header, and debit/credit lines. |
| `/api/account-history` | `GET` | `accounting:manage` | Return account activity/history for the requested company/account context. |
| `/api/payment-terms` | `GET`, `POST`, `PATCH`, `DELETE` | `sales:write` | List and manage company payment-term values used to calculate due dates. |
| `/api/attachments` | `GET`, `POST`, `DELETE` | Assigned company and entity-specific read/edit rights | List metadata, download by `attachmentId`, upload, or delete transaction/employee attachments. Uses `companyId`, `entityType`, and `entityId`. Transaction attachments can be added or removed on any saved document by the permission that writes its type: `sales:write` for sales documents and customer payments, `purchases:write` for purchase documents and supplier payments, `banking:write` for cheques, deposits and transfers; administrators for all. |

### `/api/records` transaction behavior

The central endpoint recognizes these major transaction groups:

- Sales: invoice, quotation, estimate, proforma invoice, sales order, sales receipt, statement charge, finance charge, credit memo, customer payment.
- Purchasing: bill, purchase order, item receipt, received item bill, expense, vendor credit, bill payment.
- Banking: deposit, cheque, credit card charge, transfer, cheque order, opening balance.

The endpoint validates record-specific permission with `writePermission`, company assignment, location ownership, exchange rate, lines, totals, source allocations, and stock. Posting can create ledger lines, inventory movements, contact balance updates, payment allocations, receipt/invoice source allocations, and audit records. Editing reverses the old effects and applies the replacement inside the write transaction. Purchase-order-linked bills preserve their original order-line identities while allowing received quantity, pricing, VAT, description and line-detail corrections within the unreceived PO balance. Deletion is restricted and refuses unsafe master-data deletion where dependent activity exists.

Invoice `POST` and details `PATCH` support negative quantities only for active stock items in the document's company/inventory with `unitPrice: 0`. The server forces zero VAT and derives new return-line cost from item cost (net of configured purchase VAT), converted using the invoice exchange rate. Stock and inventory/COGS postings are reversed for the signed quantity; customer totals and balances remain unchanged. Details PATCH accepts returns in `appendLines` and quantity corrections in `lineDetails`, with revision checks and consumed-stock safeguards. Existing lines cannot switch quantity direction. Other document types still require positive quantities. Packing and warranty endpoints reject negative invoice-line IDs as outgoing items.

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
| `/api/inventory-overview` | `GET` | `inventory:read` | `canSelectItems` (tick items, copy, Excel) is true for every role; `canBulkSelect` (select-all) is administrator-only. Consolidated item, specification, quantity, price, company/inventory, read-only customization details, and latest positive stock-receipt timestamp. Incoming activity returns outstanding open/partially received Purchase Order lines, their PO status, and the latest linked partial Bill. The `activity.launched` compatibility key supplies New Arrival: positive stock receipts from non-cancelled bills created within the last 12 hours, linked to the bill. `activity.priceChanges` returns only the latest valid price change per item from the last 12 hours. Administrator responses can include broader company data. |
| `/api/out-of-stock` | `GET` | `inventory:read` | Out-of-stock and reorder view, scoped by optional `companyId` and `locationId`. |
| `/api/serial-search` | `GET` | `workspace:read` | Search purchase and sales history using `companyId` and serial query `q`. |
| `/api/stock-holds` | `GET`, `POST`, `PATCH` | Company access; GET `inventory:read`; POST/PATCH administrator or accountant, same-origin | GET lists active sales reps (employees) for the company. POST `{ companyId, itemId, quantity, hours (≤168), salesRep, note }` holds stock up to the free quantity (stock minus active holds). PATCH `{ companyId, id | ids }` releases holds early. Active holds (not released, not expired) block other sales reps' invoices, sales receipts, invoice edits, purchase returns and stock transfers; `/api/inventory-overview` returns `holds` and `canManageHolds`. |
| `/api/item-logistics-options` | `GET`, `POST`, `PATCH`, `DELETE` | Company access; `inventory:read` for GET, `inventory:manage` for add/edit; Administrator or Inventory user for DELETE | Company-specific reusable HS code/COO choices. HS codes accept 6–12 digits, COO up to 80 characters and optional description up to 100. Duplicate values return 409. PATCH/DELETE accept companyId plus a saved option id or a built-in type/sourceValue. PATCH validates value/label and rejects duplicate active choices; optional expectedValue/expectedLabel reject stale edits. Built-in overrides and hidden markers persist per company, and GET includes them for merging with defaults. Writes are serialized per company and audited; item and packing snapshots stay unchanged. Missing/foreign IDs return 404. |
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
| `/api/packing-lists` | `GET`, `POST`, `PATCH` | `inventory:read` for GET; `sales:write` or the inventory role for writes | Read invoice data and existing lists, then create/update packing lists with cartons, weights, dimensions, serials, and invoice-line links. Uses `companyId`, `invoiceId`. |
| `/api/warranty-slips` | `GET`, `POST`, `PATCH` | `workspace:read` for GET; `sales:write` for writes | Find invoice items with their serial-matched source supplier bill and create/update A4 warranty/RMA service records with customer, supplier, status, serial, and issue details. |

## Reports, VAT, and currency

| Endpoint | Methods | Authorization | Purpose and important inputs |
| --- | --- | --- | --- |
| `/api/reports` | `GET` | Usually `reports:read`; selected customer/vendor reports also allow their operational permissions; HR requires Administrator | Generate one of 121 report models. Main inputs: `type`, `companyId`, optional `locationId`, `periodStart`, `periodEnd`, `currency`, `supplierId`, statement fields. |
| `/api/memorised-reports` | `GET`, `POST`, `DELETE` | `reports:read`; writes same-origin | List, save/update, or delete user-owned report configurations by company and report key. |
| `/api/vat-management` | `GET`, `POST` | `reports:read` for review; `accounting:manage` for changes | Review company-wide VAT by period; create adjustments and VAT return/filing records. |
| `/api/vat-codes` | `GET`, `POST`, `PATCH` | `workspace:read` for GET; Administrator for writes | List and manage company VAT codes and rates, including the protected `IMPORT_GOODS` UAE import code. |
| `/api/exchange-rates` | `GET`, `POST`, `PATCH` | `workspace:read` for GET; Administrator for writes | List and manage company currency rates and active status. |

## Report request notes

- `type` defaults to `profit-loss`.
- Dates use ISO `YYYY-MM-DD`; the server rejects invalid or inverted ranges.
- Most reports can be scoped to an inventory location. VAT report keys are deliberately company-wide.
- Accounting values are reported in the company home currency. The supported vendor currency reports validate a requested three-letter transaction currency.
- Sales detail includes actual company-scoped journal receivable/receipt and revenue links; unposted sales documents show planned accounts. Daily totals use invoice/receipt headers and unique document IDs. Sales Order Fulfilment includes ordered, invoiced and remaining quantities using all current source-line allocations.
- Responses use a normalized `report` object consumed by the client’s table, summary, chart, print, PDF, XLSX, CSV, and drill-down features.
- Purchase document detail includes a company-scoped payable/payment account link from posted journal credits. Open PO reports retain the saved planned account and subtract all current receiving allocations to calculate remaining quantities and home-currency commitments before VAT. PO status counts include a closed/cancelled column. Supplier purchase summaries and details both exclude VAT from purchase spend.

VAT report models include saved code/rate, signed values, document IDs and verified posted VAT account IDs. Detail lines include quantity/unit price and freight in taxable value. Item summaries group by item identity, saved code/rate and tax direction. VAT exception review includes unknown/missing codes, saved calculation differences and differences from current configured rates. All seven VAT reports return code metadata and ignore inventory scope; VAT Code List remains a current snapshot. `/api/vat-management` includes line freight in taxable amounts and saved-rate validation without changing posting or filing authorization.

Vendor report rows include company-scoped posted payable/payment account IDs resolved in the transaction currency. Source-document account links support both debit and credit postings; planned purchase orders are labelled without implying a posted control. Ambiguous historical account names remain review labels. Vendor statements expose account-navigation permission and retain their opening/closing response model. Supplier balance summaries and detail retain all prior activity through the selected as-of date. Cancelled/void supplier activity and fully allocated zero-amount open bills are excluded from vendor views. Posted payable entries classify charges and settlements; cash-paid expenses do not increase payable balances, and bill-linked bank cheques reduce balances and statements.

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

Budget report responses include `budget.from`, `budget.to`, `budget.baselineFrom` and `budget.baselineTo`. The baseline is posted results for the matching prior-year period. Unresolved account postings in either period are excluded and disclosed in `accountLinkIssues`; no budget plan or journal is created.

Accountant report responses include `accountLinkIssues` for account-bearing rows with no verified Chart of Accounts link, including missing and ambiguous matches. Original rows and amounts remain present. Client search/account filtering preserves server running balances and row order.

The `item-listing`, `item-price-list` and `item-price-level-list` responses include `account` and `accountAccountId` for the inventory asset account. Lists responses preserve unresolved account-bearing rows and include `accountLinkIssues`; exports carry those review warnings.

Employee contact POST/PATCH accepts `salaryAmount`, `salaryExpenseAccountId`, `loanBalance`, `vacationDeparture` and `vacationReturn`. Employee writes remain admin-only. Amounts must be finite/non-negative and at most 1e12; dates must be valid ISO dates, with return on/after departure. Partial edits retain omitted HR fields. Salary accounts must be active, uniquely named Expense accounts belonging to the company; the PAYROLL account is the default where available. Non-admin GET contact lists redact the new private fields. Salary cheques with a linked employee account validate and use that account server-side. Employee Balance Summary includes the saved HR profile, under its existing administrator restriction.


Employee loan cheques use `chequeType: "employee-loan"` and a required `employeeLoanContactId`. The server validates company, active employee, payee, currency, asset account, positive total, zero VAT and absence of bill allocations. The persisted employee ID survives renames. Administrator contact GET responses include serialized `bankLoanPayments`; other roles do not receive this HR history. Employee Balance Summary adds all-date bank loan payments within the selected inventory scope. Employees with linked payments cannot be deleted.


Employee POST/PATCH accepts nullable `loanAccountId`. Validation requires an active uniquely named Other Current Asset account with no system role in the employee company/currency. Omitted fields retain the link, and an empty value clears it. Non-admin contact GET redacts it. Employee loan cheques validate and enforce the saved loan account server-side, rejecting an invalid/inactive link before posting.


## `/api/staff-salary-sheets`

GET lists saved sheets for `companyId`. POST creates from validated `data`; PATCH and DELETE require `companyId`, `id`, and the current integer `revision`. All methods require administrator access to the company. Mutations require same-origin JSON and run transactionally with audit entries. Stale updates/deletions return 409. Data accepts 1–200 rows and validates month/date range, bounded strings, non-negative amounts, unique employee IDs and same-company/currency employee links. Personal numbers/cards/IBANs are strings. Optional `referenceNo` accepts up to 80 characters and defaults to blank for older sheets. Attachments use `/api/attachments` with `entityType: "staff_salary_sheet"` and the saved sheet ID; listing, downloading and changes require company administrator access. Uploads validate company ownership, lock the parent sheet and enforce 10 files of up to 3 MB each. Deleting a sheet removes its attachments in the same transaction. The server snapshots only public company letterhead fields on creation, preserving them on edit. No accounting journals are posted.

## `/api/employee-loan-links`

Administrator-only, company-scoped GET accepts `companyId` and `employeeId` and lists eligible existing bank loan cheques. PATCH accepts these IDs and `transactionId`, locks and validates the employee, transaction and loan account, and writes only the employee link plus an audit entry. Requires an active employee, matching currency, a uniquely named active advance asset (matching the saved account if configured), positive total, zero VAT, posted debit and bank credit, and no existing employee/bill/invoice allocation. Re-linking or a stale candidate returns 409. No journals or balances change.

Transactions store `deliveryAddress` (Ship To; multi-line, trimmed, no practical limit — 200,000-character server safety cap shared with packing lists in `lib/delivery-address.ts`; migration 0092). Omitting it on PATCH keeps the saved value, conversions copy it from the source document, and invoice `editMode: "details"` accepts it.

Vendor contact POST/PATCH accepts optional `bankName`, `bankAccountName` (up to 120 characters), `bankAccountNumber`, `bankIban` (80) and `bankSwift` (40). IBAN and SWIFT are upper-cased, omitted fields are kept on PATCH, and other contact types ignore them (`lib/vendor-bank.ts`, migration 0091). Vendor statements filtered to one vendor return that vendor's bank lines as `statement.partyBank`.

Employee contact POST/PATCH also accepts nullable `paymentBankAccountId`. It must reference an active Bank/BANK-role account in the same company and employee currency. Omitted values retain the saved bank; empty clears it; non-admin reads redact it. `loanAccountId: "create-employee-loan"` atomically creates/reuses an eligible, uniquely named Other Current Asset account in that company/currency and saves its numeric ID, with an account creation audit entry and zero opening balance. Invalid profiles roll back creation; no loan disbursement is posted. Migration `0076_employee_payment_bank.sql` adds the nullable bank preference.


### Account status changes

`PATCH /api/records` accepts `kind: "accounts"`, `editMode: "account-status"`, `companyId`, `id`, boolean `active` and boolean `expectedActive`. Requires company access and `accounting:manage`. The account is locked, stale state returns 409, and only the status changes with an audit entry. System accounts cannot be made inactive; active children and saved item/contact account links must be resolved first. Reactivation requires an active parent. Balances and journal history remain unchanged.


Item logistics PATCH derives `dimensionText` from positive length/width/height as `L × W × H cm`; free-text dimensions remain available when numeric dimensions are incomplete. Packing-list writes use the same formatting after applying carton dimensions. Saved packing lines snapshot HS code, COO and dimensions, so later item edits do not change existing saved lines. Migration `0077_item_logistics_options.sql` stores reusable choices per company, with a unique company/type/value index.

### Operational role controls

- Saved business-record DELETE actions are administrator-only across the API. Logout and releasing SKU locks are not business deletions.
- Inventory users can create bills, item receipts, received-item bills and purchase orders; they cannot create vendor credits/payments or sales invoices. They can create vendors and add/edit items with existing validation and company scope.
- Inventory reads/edits of bills and item receipts expire at midnight Asia/Dubai on the server-recorded creation day. Backdating cannot extend access, and new inventory bills/receipts must use today's UAE date. This also covers serial-search results, direct attachment downloads and bill selectors.
- `PATCH /api/records` with `editMode: "invoice-serials"` accepts `kind: "transactions"`, `companyId`, `id`, `revision` and `lineDetails: [{ id, serialNumber }]` for inventory users. Only appending serial text to valid existing lines is accepted. Stock, ledger, totals and customer fields are unchanged.
- `PATCH /api/records` with `editMode: "inventory-invoice"` (inventory users, saved invoices) accepts `revision`, `comments`, `lineDetails: [{ id, itemId?, fromItemId?, serialNumber?, comments? }]` and `appendLines: [{ itemId, quantity, serialNumber?, comments?, unitPrice: 0 }]`. Changing `itemId` requires `fromItemId` to match the saved item and keeps quantity and price; the old item is restocked, the new one is issued, and cost of sales, inventory asset and the income-account split are journalled. Appended lines must be zero-price; a negative quantity on a stock item is a stock return (restocked at cost, VAT code ZERO). Totals, VAT and the customer balance never change. Item changes are refused for lines on packing lists or warranty slips, source-linked invoices and stock shortages.
- `PATCH /api/records` with `editMode: "delivery-address"` and a string `deliveryAddress` lets accountants, administrators, inventory users and sales users (their own invoices only, checked with the sales document visibility rule) set the Ship To address of a saved quotation, estimate, proforma, sales order, invoice, pending invoice, sales receipt or credit memo. Line breaks are normalised; amounts, lines and stock are unchanged; no SKU locks are taken; the change is audited.
- `PATCH /api/records` with `editMode: "delivery"` and boolean `delivered` marks an invoice delivered or not delivered (accountants and administrators only), storing `deliveredAt`, `deliveredByUserId` and `deliveredByName` (migration 0094). It changes no stock or amounts and does not take SKU locks.
- `PATCH /api/records` with `editMode: "purchase-serials"` lets inventory users append serial numbers to bills and item receipts on any day; full bill edits by inventory users are limited to the creation day.
- `POST /api/records` with `type: "pending invoice"` is administrator/accountant-only, stores status pending, and produces no journal, stock movement or contact balance. Those roles may edit the draft and convert it using an invoice POST with `sourceTransactionId`; repeat conversion returns 409.
- Bank stamps: `bankStampData` is the default account's stamp and each `bankAccounts` entry may carry `stampData`. Each must be a PNG, JPG or WebP data URL under 500 KB (`validBankStamp` in `lib/bank-accounts.ts`). Sales reads return both empty, and Clear company setup removes them with the extra bank accounts.
- Bank remarks: `bankRemark` (default account, column `companies.bank_remark`, migration 0089) and `remark` on each `bankAccounts` entry, up to 500 characters, printed in the document bank details box. Sales reads return `bankRemark` empty.
- Stamp positions: `stampPositions` is JSON keyed by document type (`tax-invoice`, `quotation`, ...) holding optional `company` and `bank` entries of `{ show, left, top, page }` (`page: true` = first-page coordinates; entries without it are older strip offsets and are ignored by previews), with whole millimetres from 0 to 300 (`parseStampPositions` in `lib/stamp-positions.ts`, column `companies.stamp_positions`, migration 0088). Sales reads return it empty.
- Accountant company-setup PATCH accepts only `companyId`, `bankName`, `bankAccountName`, `bankAccountNumber`, `bankIban`, `bankSwift`, `bankCurrency`, `bankAccounts`, `stampData`, `bankStampData`, `bankRemark`, and `stampPositions` (administrators use the same partial save for the Bank account section); identity, branding and administrative settings remain protected.
- Warranty POST/PATCH also accepts the inventory role, including supplier-return/receipt fields. Delete remains administrator-only.

### Sales workspace restrictions

- `POST /api/online-users` is available to every signed-in role, including sales; `ipAddress` is blank for non-administrators.
- Shared auth denies sales users all endpoints except the sales-work, scoped records/attachments, session/preferences/SKU reservation endpoints and read-only form configuration/workspace/Incoming endpoints in `lib/sales-access.ts`. General reports, supplier/warranty/serial/packing/stock/ledger routes are unavailable.
- Sales `GET /api/records` permits only `transactions`, `contacts`, `items`, `accounts`. Customer rows require `salesOwnerId`; transaction list/detail require creator identity, current customer ownership and invoice type. Item rows omit costs/suppliers; accounts return only active AR selector fields without balances.
- Sales POST accepts quotation, estimate, sales order, proforma invoice or invoice for an owned active customer; creator/salesman/UAE date are set server-side. Invoice POST returns the full record. Quotation, estimate, sales-order and proforma POST return only id/number/type/`awaiting accountant` status, and all later detail, attachment, print and PDF access to them is denied to sales. Sales `PATCH` of any saved transaction returns 403. Admin/accountant reads and existing outputs remain available.
- `GET /api/sales-work?companyId=&date=YYYY-MM-DD` gives sales users their own customer balances and document creation activity for the UAE day (default today). Non-invoice activity contains no financial/customer/line detail; only invoices have `canOpen: true`. Administrator GET returns assignable active sales users in that company.
- `PATCH /api/sales-work` is administrator-only: `companyId`, `customerId`, `salesOwnerId` (nullable), `expectedOwnerId` (nullable). Rejects stale assignment with 409 and invalid company/user/role combinations.
- Customer duplicate checks apply across every company customer, regardless of ownership: normalized billing/company names at least 70% similar, duplicate TRN, or duplicate normalized phone/WhatsApp prevent save.
- Sales `GET /api/inventory-overview` returns the consolidated stock rows (quantity and selling price; no cost or supplier fields), and every activity list (Incoming, New Arrival, Price Change, Just Sold) with only item, company/inventory, date, quantity, selling prices and (Just Sold) the sales rep; purchase document identifiers, supplier names and purchase prices are omitted. Company/workspace responses omit bank/stamp/template data and global balances for this role.

## Income tax working papers

`/api/income-tax` GET accepts companyId and returns home currency, account options, saved period configurations and canManage. POST accepts companyId and action preview, save or create-accounts. All operations require reports:read and company access; POST requires same origin. Save/account creation additionally require accounting:manage (administrators/accountants). Preview calculates a company-wide estimate from posted journals within inclusive dates. Config contains from/to, lowerRate/upperRate (0–100), threshold, tax expense/payable account IDs, additions/deductions and an adjustment explanation. Account IDs must belong to that company with suitable types and home currency. Unmatched or ambiguous historical postings are disclosed rather than guessed.

Save stores one working-paper configuration per company/period with optimistic revision checks (409 for duplicate/stale updates), and an audit event. Reopening recalculates against the current ledger; these are working papers, not immutable filed returns. No tax journal or filing is created. create-accounts safely creates or reuses 7100 Corporate Income Tax Expense and 2150 Corporate Income Tax Payable, rejecting conflicting codes/names. Existing account choices are not overwritten. `/api/reports?type=income-tax` provides a default, unsaved working paper for generic report callers; interactive percentage management uses the dedicated screen. Inventory and requested display currency never narrow the tax calculation.

## Company backup API

`GET /api/admin-backups?companyId=…` returns schedule/revision, latest 100 runs, storage readiness and dispatcher heartbeat. Add `download=<uuid>` to stream a private gzip archive. `POST /api/admin-backups` accepts `{companyId, action}` with `create`, `verify`/`delete` plus `id`, or `schedule` plus `{enabled, frequency, startDate, time, retentionDays}` and the current `revision` (0 for initial creation). Both methods require company-authorized admin/all_admin; mutations require same-origin authentication and a bounded JSON body. Conflicting revisions return 409.

`POST /api/admin-backups/run` is a production-only worker endpoint authenticated by the exact main-branch GitHub Actions workflow OIDC identity. It accepts no user-controlled company selection, claims due schedules, verifies owner access, handles retry leases and performs retention cleanup. See [Company backups](BACKUPS.md) for security and operational limits.

### Contact organization

Contact POST/PATCH accepts `parentContactId` (positive ID, null/empty to remove) and `status` (`active` or `inactive`). Omitted PATCH values are preserved. Parent selection enforces company, contact type, sales ownership, cycle and active-parent checks within the contact write transaction. GET contact rows include `parentContactName` resolved only from rows visible to the user. Organization changes are audited; deleting a contact with children returns 409. These fields never update balances or ledger links.

For list-row activation use contact PATCH `editMode: "contact-status"`, `status`, and `expectedStatus` with kind/id/companyId only. It preserves identity fields and balances, checks current status to reject stale writes with 409, and follows the same permissions and hierarchy rules.

### Invoice line pending transfers

`POST /api/records` with `type: "invoice"` accepts `lines[].pending: true`. The server splits marked lines into a non-posting pending invoice in the same company/inventory and returns `pendingRecord` alongside `record`. When every line is marked, both refer to that pending invoice and no final invoice is posted.

Administrator `PATCH` invoice details accepts `lineDetails[].pending: true` for existing lines and `appendLines[].pending: true` for new lines. Posted reversals, pending creation, line removal and audit are one transaction. Existing revision, company, SKU locking, payment and packing checks apply; source-linked and negative-quantity lines are rejected. A failed pending save rolls back all changes. `pendingRecord` identifies the saved cart. Pending invoices retain line comments and serial numbers through conversion.

### Invoice number format settings

`PATCH /api/workspaces` with `type: "invoiceSeries"` accepts company/location IDs, `invoicePrefix`, `nextInvoiceNumber`, `invoiceNumberFormat` and `invoiceNumberPadding`. The format requires exactly one `{NUMBER}`; `{COMPANY}` and `{PREFIX}` are optional. Uppercase literal letters, numbers, spaces, `/`, `-`, `_`, and `.` are allowed. Padding is 1–12, the counter is 1–999999999, and rendered references must fit 100 characters. Omitted format/padding preserve the saved values for compatibility. `expectedSeries` is the shared formatter module's serialized revision and rejects stale changes with 409. Success returns `location` and `preview`. Administrator/company access, an inventory row lock, next-reference collision checks and audit apply. `POST /api/records` uses the same saved format and serializes counter allocation; duplicate references roll back the transaction.

### Insights entry-date activity

`GET /api/records?kind=transactions&companyId=…&locationId=…&enteredDate=YYYY-MM-DD&page=1` returns `records`, `total`, `page`, `pageSize` (50), `date` and `timeZone`. Entry dates use `createdAt` between UAE midnight inclusive and the next midnight exclusive, independently of the document date. Results are ordered newest first, with ID as a stable tie-breaker, and are not cached. Company authorization and inventory ownership are checked before reading; row counts use the same scope as rows. Sales ownership, pending-invoice permissions and inventory same-day bill restrictions remain enforced. Purchasing sees purchase/payment/cheque types; inventory sees invoices, POs and eligible receipts/bills; customization has no access. Admin/accountant and report-reading roles retain their existing document visibility.
