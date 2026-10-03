# Application workflows

## 1. Authentication and workspace entry

```mermaid
flowchart TD
  Open["Open application"] --> Session{"Valid session?"}
  Session -- No --> Login["Choose company branding and sign in"]
  Login --> Verify["Verify password and lockout state"]
  Verify --> Cookie["Create 12-hour secure session"]
  Session -- Yes --> Password{"Temporary password?"}
  Cookie --> Password
  Password -- Yes --> Change["Change password and revoke sessions"]
  Password -- No --> Workspace["Load role and assigned companies"]
  Change --> Login
```

1. The public login screen loads safe branding, optionally for a selected company.
2. `/api/auth/session` verifies the active user and scrypt password. Five failed attempts produce a 15-minute lock.
3. Successful login records time, source IP, and user agent, then issues the session cookie.
4. A temporary-password account is sent to the password-change screen. Changing it revokes every session, requiring a new login.
5. The server loads the application shell with role, company assignments, name, avatar, accent theme, and appearance mode.
6. The user selects a company and inventory location. All subsequent operational calls send those identifiers, and the API verifies them again.

## 2. Master-data workflow

Customers, vendors, employees, items, and accounts use `/api/records`.

1. The client loads the selected record kind for the company and optional inventory.
2. The user creates or edits a record in the relevant center.
3. The server selects the write permission from the record kind and transaction type.
4. Company/location ownership and field rules are validated. Examples include international customer phone formats, 15-digit TRNs, vendor requirements, item types, unique SKU/item numbers, and account hierarchy rules.
5. Related records are created where required, such as currency-specific AR/AP control accounts.
6. The response refreshes the active list. Sensitive vendor changes are retained in the audit log.

## 3. Common transaction posting workflow

```mermaid
flowchart TD
  Draft["Enter header and lines"] --> Validate["Client totals and required fields"]
  Validate --> Reserve["Reserve affected SKUs"]
  Reserve --> Authorize["Role, company, location, source checks"]
  Authorize --> Transaction["Serializable database transaction"]
  Transaction --> Header["Write document and lines"]
  Header --> Effects["Journal, stock, allocations, balances, audit"]
  Effects --> Commit["Commit and refresh UI"]
```

Posting documents share these invariants:

- The server recomputes and validates amounts instead of trusting display totals.
- Transaction currency uses a valid exchange rate and accounting effects are stored in home currency.
- Debit and credit journal lines must balance.
- Referenced contacts, items, accounts, inventories, and source documents must belong to the company.
- Stock-affecting documents reserve SKUs, lock rows, and reject stale/overlapping work.
- Negative stock is blocked unless the protected company override flow is valid.
- A failed dependent write or non-success response rolls back the transaction.

When an existing posting document is edited, the server reverses its prior ledger, stock, allocations, and balance effects before applying the replacement. Destructive deletion is Administrator-only and master data with dependent activity is protected. The delete dialog requires a written reason and offers Cancel or Delete record. The reason, authenticated user and deletion time are retained in audit history; failed deletion keeps the dialog and memo available for correction.

## 4. Sales workflow

### Quote/order to invoice

1. Create an estimate, quotation, proforma invoice, or sales order for a customer. Estimates, proforma invoices, and sales orders default the posting-account dropdown to that customer’s linked Accounts Receivable account in the document currency; invoices use the same default.
2. These source documents remain non-posting.
3. Open Sales Documents lists source lines with quantity still available to invoice.
4. Choose a source, destination inventory, and partial or full quantities.
5. Save an invoice. `sales_invoice_allocations` records each invoiced source line quantity.
6. The source status becomes partially invoiced or completed as allocations accumulate.
7. The invoice posts revenue, receivable, VAT, cost of goods sold, and stock reduction as its lines require.

### Direct sale and credit

- An invoice posts receivable and remains open until payments cover it.
- A sales receipt posts a completed sale and receipt together.
- A credit memo reverses the applicable sales and inventory effects.
- Statement and finance charges post customer balance and revenue effects without normal stock lines.

### Edit an invoice

Administrators can edit the customer, existing line quantity, unit price, VAT code, description, sales rep, due date, terms, reference, memo, comments and serials, and append new lines. Save Changes validates the current revision and updates line totals, VAT, stock, COGS, Inventory Asset, receivables and customer balances atomically. A quantity increase cannot exceed available stock, and a reduction cannot go below quantities already used by packing lists. Quantity on an invoice created from a sales source remains protected so its source allocation stays correct. Totals cannot fall below allocated payments. Customer changes require an active customer in the same company and invoice currency and no linked payments; the receivable moves to the new customer's account. Due-date or amount changes refresh open/overdue/payment status. Currency, inventory and existing item selections remain fixed.

### Customer payment

1. Select company, inventory, customer, and transaction currency.
2. The UI loads open invoices and remaining balances.
3. Allocate one payment across one or several invoices.
4. Saving creates the payment, `invoice_payment_allocations`, cash/receivable journal effect, customer balance update, and invoice status refresh.

### Sales document output

Open a saved transaction to choose its supported output: tax/commercial invoice, proforma, delivery note, packing list, or HS-code summary. Company design, logos, letterhead, bank details, VAT data, serials, line comments, attachments, and optional stamps feed the A4 print/PDF view. The output selector defaults documents to portrait and lets the user switch to landscape.

## 5. Purchasing workflow

### Purchase order receiving

1. Create a non-posting purchase order for a vendor.
   Selecting the vendor fills the posting account from its linked Accounts Payable account in the order currency; changing the order currency refreshes that selection. If a legacy vendor has no account in that currency, the form creates or restores the currency control account before saving and links it to the vendor when appropriate.
2. Open Purchase Orders shows quantities not yet received.
3. Select an order, receiving inventory, and partial/full line quantities.
4. Save an item receipt or received-item bill.
5. `purchase_receipt_allocations` records quantities against each order line.
6. Inventory is increased; a bill also posts payable, inventory/expense, and input VAT effects.
7. Inventory Overview → Incoming links each remaining quantity to its Purchase Order. It shows whether the PO is ready to convert to a Bill or has a partial linked Bill; converted and fully received POs leave Incoming.
7. The purchase order becomes partially received or received based on cumulative allocations.
8. An administrator can reopen a linked supplier bill and edit its received quantity, price, VAT code, description, comments, serial number, freight, dates, and memo. The item remains tied to its original purchase-order line; stock, receipt allocation, VAT, payable balance, and journals are replaced atomically. Quantity cannot exceed the PO quantity remaining after other receipts, and reductions are blocked when the received stock has already been used.

### Bills and vendor payments

1. Enter a bill or expense in the vendor currency and inventory context. Bills default the posting-account dropdown to the selected vendor’s linked Accounts Payable account in that currency; purchase orders use the same vendor-currency default.
2. The posting creates payable/expense or inventory/VAT journal effects and stock additions where relevant. Stock received through Enter Bill appears in Inventory Overview → New Arrival for 12 hours from saving, regardless of the bill’s business date. View opens the original bill in its company/inventory context. Editing the bill preserves its original creation timestamp; cancelling or deleting it removes it from subsequent overview loads.
3. The unpaid-bills view calculates remaining balance from direct and multi-bill allocations.
4. A bill payment or supplier cheque can allocate one payment to multiple bills through `bill_payment_allocations`.
5. Saving updates the vendor balance and each bill’s payment status.

### Purchase return

1. Select a vendor, inventory, currency, and original bill.
2. The server calculates purchased quantity less earlier returns.
3. Create a vendor credit for an allowed quantity.
4. Posting reduces stock and payable/expense effects and links the return to its source bill.

## 6. Inventory workflows

### Item maintenance

1. Create a stock or supported non-stock/service item in an inventory location.
2. Maintain sale price, unit/GRN cost, reorder point, specification values, serial details, and status.
3. Logistics maintenance adds HS code, origin, dimensions, and weight.
4. Shared Items can compare/copy a matching SKU across companies the user can access.

### Transfer

1. Select source company/inventory and one or more items.
2. Select a destination inventory for every line and enter quantities.
3. The server verifies access to both sides, resolves source/destination SKU locks, and checks stock.
4. A transaction moves quantity out of the source and into the destination while retaining transfer history.
5. Administrator edit/delete paths revise or reverse the prior movements.

### Inventory check

1. Choose a company/inventory and select currently stocked items.
2. Save a count report with system quantity and actual quantity.
3. The report retains line snapshots and can compare the same item across accessible companies.
4. Administrator update/delete paths use SKU locks to avoid conflicting quantity work.

### Pricing and revaluation

- Stock Pricing loads current sale/GRN prices. Batch save includes expected old values and returns `409` when another update won the race.
- Stock Revaluation calculates valuation inputs and posts protected cost changes.
- The Out of Stock view filters the consolidated inventory data by selected company/location and reorder state.

## 7. Banking, journal, VAT, and cheque workflows

### Banking

Deposits, cheques, credit-card charges, account transfers, cheque orders, and opening balances use the common transaction flow. The server selects the correct system/control accounts and creates balanced journals.

### General journal

1. Select company, inventory, date, reference, currency, and exchange rate.
2. Add debit and credit lines against chart accounts.
3. The server requires a balanced entry and valid accounts.
4. Posted entries feed the ledger and financial reports. Authorized edits/deletions update the ledger consistently.

### UAE cheque

1. Choose supplier, salary, or expense purpose and a configured bank layout.
2. Enter payee, amount, date, account, memo, and optional bill allocations.
3. Save to post the banking/payable/expense effect.
4. Print through the bank-specific positioning controls, including date and crossing alignment.

### VAT

1. VAT codes drive transaction line tax calculations.
2. Selecting `Goods imported into the UAE` on a supplier bill requires a Bill of Entry No. and Airway Bill No.; supporting customs files can be attached to the same bill. In Purchases, search by Bill of Entry No. to find and open the linked supplier bill in the selected company and inventory.
3. The VAT center loads a company-wide period, independent of selected inventory.
4. Accounting users review output/input tax, reverse charge, exceptions, and unassigned activity.
5. Authorized users add adjustments and record VAT return/filing data.
6. VAT reports and the Report Center read the same posted transaction and journal sources.

## 8. Warranty and packing workflows

### Warranty/RMA

1. Choose a customer or invoice and load eligible invoice items. Selecting an item automatically fills its supplier, purchase bill, and purchase date when the serial identifies a source bill; an item-only match is used only when one purchase bill is unambiguous.
2. Optionally open Warranty / RMA directly from a saved supplier bill; the supplier, bill number, and purchase date are prefilled.
3. Record item, serial, issue, received date, supplier return dates, condition, and service status.
4. Save/update the slip and print the A4 service record. The RMA list and form can reopen the linked supplier bill.
5. Mark the item returned to its supplier, or save the Returned to Supplier status in the list. The supplier return receipt preview opens automatically; saving the return status fills a missing return date with today in UAE time. Check the return date and ensure the supplier bill, purchase date, serial number, and problem are present, then save. Print or download the receipt as A4 PDF for the supplier to acknowledge. Use the Document selector to switch between the customer warranty slip and supplier receipt; the receipt remains available after subsequent status changes when a supplier return date is recorded.

### Packing list

1. Open a sales invoice and load its lines.
2. Create a packing list number/date and edit carton references, quantities, weights, dimensions, and serials.
3. Save the packing list linked to invoice and invoice lines.
4. Print the A4 packing document through the selected company design. Packing lists default to landscape, with portrait available from the output selector.

## 9. Reporting workflow

```mermaid
flowchart TD
  Pick["Select report"] --> Filters["Company, inventory, period, optional supplier/currency"]
  Filters --> API["Generate normalized report model"]
  API --> View["Table, summary, and chart"]
  View --> Drill["Open linked operational detail"]
  View --> Save["Memorise current report settings"]
  View --> Output["Print A4, PDF, XLSX, or CSV"]
```

The UI groups and searches 120 report definitions. `/api/reports` validates report-specific access and filters, loads ledger/transaction/master data, and returns normalized columns and rows plus optional summary/chart/period metadata. The client can drill into linked areas, save a user/company report view, choose A4 portrait or landscape (portrait by default), and export the same result. In Inventory reports, search or filter by asset account and status/aging, sort stock quantities or values, and optionally hide zero QOH. The summary, net totals, printed rows and downloads all follow the current filtered rows. Desktop uses a detailed table; tablet/mobile use stock cards with labeled quantities and prices. Asset-account links open the saved account history; stock valuation is a current quantity/cost snapshot, not a reconciliation to the posted ledger.

Purchases reports can be searched or filtered by supplier, payable/payment account and status. Summaries, totals, print and downloads follow the displayed rows. Bill/expense account links come from posted credit accounts; PO links show planned accounts. Open commitments subtract all current receiving allocations, including receipts saved after the selected PO date range, and exclude VAT. Use the original PO links to open receiving and the supplier links to open Vendor Center.

Sales reports support customer, representative, receivable/receipt, revenue-account and status filters. Displayed rows determine summaries, graphs and every output. Sales exclude VAT; credit memo returns are shown separately in Sales Graph. Pending Sales uses document face values, not an open AR balance or a revenue forecast. Sales-order quantities include all saved fulfilment allocations, even invoices after the selected order dates. To position a Sales stamp, enable it and drag on the A4 preview, use arrow keys (Shift for 5 mm), or edit millimetre offsets. Print and PDF use the same selected page coordinates.

For VAT reporting, select the company and period; inventory selection is ignored and outputs identify company-wide scope. Filter by saved VAT code, tax direction, posted account or code status; summaries and downloads follow the displayed rows. Code links open a filtered current register, with authorized navigation to VAT Codes or VAT Management. Credit notes reduce taxable values and VAT. Both report exception review and filing review include per-line freight in the taxable base. Missing/ambiguous posted VAT links remain review labels. VAT Position Summary excludes manual adjustments; VAT Management retains the filing review workflow. The optional VAT stamp uses the same A4 drag, keyboard and millimetre placement controls as Sales.

For Vendors, select company, inventory, currency and optionally a supplier. QuickReport and Open Balance require the selected supplier. Search and filter activity by supplier, posted account, status or document type; open-bill views also support past-due-only filtering. Summaries and exports use visible rows while running balances retain original report order. Supplier balance summaries and detail retain all prior activity through the selected as-of date. Statements use their dedicated server-side date/currency/supplier filters so opening and closing balances remain intact. Voided or cancelled supplier documents are excluded. Posted payable entries classify charges and settlements; cash-paid expenses do not increase payable balances, and bill-linked bank cheques reduce balances and statements. Verified account links open ledger history; documents and suppliers open their original areas. Move the optional stamp on the scaled A4 preview or enter millimetre offsets.

## 10. Administration workflow

- **Companies and inventories:** create/edit workspace records, bank/company metadata, currency, invoice series, and locations.
- **Users:** create users, assign roles and companies, reset temporary passwords, activate/deactivate accounts, and send invitation email when configured.
- **Branding:** configure login visuals, logos, company document template/color, letterhead, and stamp.
- **SMTP:** save encrypted mail settings and send a test message.
- **Company clear:** protected Administrator action for clearing selected operational data while retaining required setup.

## 11. Development and release workflow

1. Install the exact lockfile with `npm ci`.
2. Develop against configured PostgreSQL with `npm run dev`, or isolated PGlite with `node scripts/dev-local.mjs`.
3. Change `db/schema.ts` and generate/review a SQL migration for persistent model changes.
4. Run `npm run ci` before release-sensitive changes.
5. Push the commit. GitHub Actions runs full source validation and CodeQL.
6. Vercel begins the Git-linked build and waits for both required jobs for the exact SHA.
7. The production build applies pending migrations, builds Next.js, and deploys only after the release gate succeeds.

### Shared report output controls

Choose a category from the sidebar on desktop or the category selector on tablet/mobile, or search the full library. Verify the company/inventory context and report-specific scope before opening a report. The supplier and transaction-currency selectors are also shown when vendor reports appear in search or All Reports. Saved views are offered only for currently available report definitions.

All report categories expose the same optional company stamp preview. Enable the stamp, drag it on the A4 preview (or use arrows / millimetre inputs), then print or export PDF using the selected orientation. Report-specific account/document links and calculations remain authoritative. Shared tables use mobile cards and restore the detailed table when printing. CSV, Excel and PDF include each category summary where defined; generic running balances and unit prices are never automatically totaled.
