# Features and functionality

## Company workspace

- Multiple independent companies with home currency, legal identity, TRN, address, contact, and bank details.
- Multiple inventories/warehouses per company, each with its own code, invoice prefix, and next invoice number.
- Company and inventory selectors that scope forms, lists, dashboard data, and most reports.
- Per-user company assignments, global administration, company administration, and six operational roles.
- Configurable login branding, company logos, background, display name, copyright text, document colors, templates, and letterhead.
- Light and dark appearance modes with Emerald, Ocean, Indigo, Violet, Rose, and Amber accent themes.

## Sales and customers

- Customer records with company, international phone/WhatsApp validation, country, reseller/planet fields, TRN, email, credit, and currency.
- Quotations, estimates, proforma invoices, sales orders, invoices, sales receipts, statement charges, finance charges, and credit memos.
- Partial conversion of estimates, proformas, and sales orders into one or more invoices with source-line allocation tracking.
- Customer payment entry against one or multiple open invoices, including partial allocations and refreshed invoice status.
- Customer center with balances, activity, open balances, statements, overdue analysis, and source document drill-down.
- Payment terms and calculated due dates.

## Purchasing and vendors

- Vendor records with contact, company, country, TRN, currency, payable balance, and change history.
- Purchase orders, item receipts, received-item bills, bills, expenses, vendor credits, and bill payments.
- Partial purchase-order receiving with remaining quantities and receipt allocation tracking.
- Purchase returns constrained to quantities still available from source bills.
- Single or multi-bill vendor payment allocation and refreshed bill status.
- Vendor center with balances, purchasing history, returns, open payables, aging, and vendor-currency reports.

## Inventory

- Stock, non-stock, service, other charge, subtotal, group, discount, payment, VAT item, and VAT group item types.
- Unique item numbers and SKU controls per inventory location.
- Quantity on hand, reorder points, sales prices, unit cost, GRN cost, serial numbers, and active status.
- Item specifications with reusable option values and generated descriptions.
- HS code, country of origin, dimensions, and weight maintenance.
- Consolidated inventory overview, out-of-stock/reorder view, and serial purchase/sales history.
- Inventory check reports with selected in-stock items, actual counts, and cross-company quantity comparison.
- Multi-line transfers between inventories or companies, with revisions and reversal.
- Stock pricing with conflict detection and stock revaluation controls.
- Shared-item comparison and copying across accessible companies.
- SKU reservations and database locks to prevent overlapping inventory edits.

## Accounting and banking

- Company chart of accounts with standard system roles, multi-currency control accounts, parent/sub-account structure, and opening balances.
- Automatic double-entry journals for posting sales, purchases, payments, banking, VAT, and stock effects.
- Manual general journal entries with balanced debit/credit validation and inventory location selection.
- Deposits, cheques, credit-card charges, transfers, cheque orders, and opening balances.
- UAE bank cheque preparation for supplier, salary, and expense workflows with bank-specific layouts and print alignment.
- Account history, general ledger, trial balance, balance sheet, cash flow, receivables, payables, and reconciliation-oriented reports.
- Audit log coverage for sensitive changes such as vendor changes and destructive actions.

## VAT and currency

- Company VAT codes, names, rates, active status, and dropdown usage detail.
- UAE VAT reporting for output, input, adjustments, exceptions, unassigned entries, reverse charge, item summaries, and code lists.
- VAT adjustments and return/filing records by period.
- UAE VAT reports remain company-wide because filing belongs to the VAT-registered company.
- Transaction currencies and per-company exchange rates.
- Automatic creation/use of currency-specific accounts receivable and accounts payable control accounts.
- Home-currency accounting values with original-currency journal values retained where applicable.

## Employees and HR

- Employee contact records and employee-specific attachments.
- Employee balances summary report.
- Employee payment detail report.
- HR report access restricted to company administrators.

## Warranty, packing, and attachments

- Warranty/RMA slips linked to customers, invoices, invoice items, suppliers, serials, dates, and service status.
- A4 warranty service records.
- Packing lists generated from invoice lines with editable cartons, references, weights, dimensions, quantities, and serial details.
- Transaction and employee attachment upload, listing, download, and deletion with company/entity access checks.

## Document output

- Classic, modern, and minimal company document templates with configurable color.
- Tax invoice, proforma invoice, commercial invoice, delivery note, packing list, and HS-code summary views.
- Company letterhead builder and named A4 letterhead documents.
- Company logos, bank details, VAT identity, extra fields, line comments, serial numbers, and payment terms.
- Paid and company stamp overlays that can be moved before printing/export where supported.
- A4 portrait print/PDF output by default, with a portrait/landscape selector; packing lists default to landscape.

## Window controls

- Application dialogs use a responsive landscape workspace on desktop and provide minimize, maximize/restore, and close controls without discarding in-progress form data.

## Reporting

The Report Center contains 120 report definitions.

| Category | Count | Coverage examples |
| --- | ---: | --- |
| Profit & Loss | 12 | Standard, detail, item, sales rep, job, class, YTD, prior year, graphs |
| Financial | 15 | Business final report, balance sheet, cash flow, income, expenses, net worth |
| Budgets | 3 | Overview, P&L budget performance, balance-sheet budget performance |
| Accountant | 11 | Trial balance, general ledger, journal, transaction detail, audit trail |
| Lists | 15 | Accounts, contacts, terms, transactions, memorised reports, currencies |
| Employees & HR | 2 | Employee balances and payment detail |
| Banking | 2 | Bank register and cheque detail |
| VAT | 7 | Summary, detail, exceptions, reverse charge, items, codes |
| Customers | 17 | Open balance, aging, statements, income, payments, invoices |
| Sales | 12 | Sales by customer, item, rep, transaction detail, pending documents |
| Vendors | 10 | Balances, statements, aging, supplier detail and quick reports |
| Purchases | 8 | Purchase detail, order summary, unpaid bills, returns, expense analysis |
| Inventory | 6 | Valuation, quantity, stock status, transaction detail, pricing/profit |

Every report view supports a centered professional layout with category/search navigation and contextual actions. Depending on the report, features include:

- Date period and inventory filters.
- Currency or supplier filters.
- Summary cards and charts.
- Table sorting/inspection and linked drill-down to operational areas.
- Memorised report settings per user and company.
- Selectable A4 portrait/landscape print and PDF output, with matching XLSX page setup, plus CSV export.
- Movable stamps on relevant print/PDF views.

## Role-visible navigation

| Role | Main visible areas |
| --- | --- |
| Administrator | All application and management views |
| Accountant | Home, inventory context, sales, customers, warranties, purchases, vendors, banking, journals, accounts, VAT, reports |
| Sales | Home, inventory context, sales, payments, customers, warranties |
| Purchasing | Home, inventory context, purchases, cheques, vendors |
| Inventory Manager | Home, inventory, logistics, counts, and transfers |
| Viewer | Home, serial search, inventory overview/check reports, and Report Center |

The API permission model is authoritative; navigation visibility is a matching user experience layer.
