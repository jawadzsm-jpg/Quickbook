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
- Estimate, proforma invoice, sales order, and invoice entry forms offer Add Line below the last item row so long documents can grow without scrolling to the top. Their posting-account dropdown defaults to the selected customer’s linked Accounts Receivable account in the document currency.
- Partial conversion of estimates, proformas, and sales orders into one or more invoices with source-line allocation tracking.
- Customer payment entry against one or multiple open invoices, including partial allocations and refreshed invoice status.
- Customer center with balances, activity, open balances, statements, overdue analysis, and source document drill-down.
- Payment terms and calculated due dates.

## Purchasing and vendors

- Vendor records with contact, company, country, TRN, currency, payable balance, and change history.
- Purchase orders, item receipts, received-item bills, bills, expenses, vendor credits, and bill payments.
- Supplier bills using the `Goods imported into the UAE` VAT code require Bill of Entry and Airway Bill references, support customs-document attachments, and keep those references on the saved and printed bill. When converting an import-coded Purchase Order, the UAE import document fields are shown immediately and become required as soon as an import line is included in the Bill. Purchases includes a company- and inventory-scoped Bill of Entry No. search whose results open the original supplier bill.
- Bills and purchase orders default their posting-account dropdown to the selected vendor’s linked Accounts Payable account in the document currency.
- Purchase order and bill entry forms offer Add Line below the last item row.
- Partial purchase-order receiving with remaining quantities and receipt allocation tracking.
- Purchase returns constrained to quantities still available from source bills.
- Single or multi-bill vendor payment allocation and refreshed bill status.
- Vendor center with balances, purchasing history, returns, open payables, aging, and vendor-currency reports.

## Inventory

- Stock, non-stock, service, other charge, subtotal, group, discount, payment, VAT item, and VAT group item types.
- Unique item numbers and SKU controls per inventory location.
- Quantity on hand, reorder points, sales prices, unit cost, GRN cost, serial numbers, and active status.
- Inventory items load independently from transactions, contacts, and account balances; historical average cost and open-PO quantities are aggregated in PostgreSQL, and long item lists are paginated for responsive browsing.
- Authorized inventory editors can mark each item inactive or active from its row. Inactive items move out of All items into the Item is inactive tab, and reactivated items return to All items. The inactive status label applies even at zero quantity; active stock counts exclude inactive items.
- Item specifications with reusable option values and generated descriptions.
- Inventory item rows show one uppercase line ordered as brand/model, generated SKU, condition such as `BRAND NEW`, remaining specifications, and the item number as a final `#` suffix. Generated and displayed descriptions omit every standalone `NO` specification. Inventory Overview copies for WhatsApp and Telegram use the same `🔺` product-title and `⚡` condition format for Brand New, Open Box, Refurbished, and Used items; social copies also omit `NO`, item numbers, and inventory-location lines.
- HS code, country of origin, dimensions, and weight maintenance.
- Consolidated inventory overview, out-of-stock/reorder view, and serial purchase/sales history. Every Inventory Overview product shows how many days ago it was last received and provides a read-only Product Customization Details popup to all roles with inventory access. Incoming links every outstanding quantity to its Purchase Order, labels it ready for Bill conversion or identifies its latest partial Bill, and removes converted/fully received POs. New Arrival lists stock received through saved Enter Bill documents for 12 hours from the bill creation timestamp, with supplier, received quantity, purchase price, and a View link to the bill. Price Change keeps only each item's latest valid selling-price change for 12 hours. Time-limited entries expire while the overview is open.
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
- Write UAE Bank Cheque is available in Banking workflows; the sidebar omits the duplicate cheque shortcut.
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

- Warranty/RMA slips linked to customers, invoices, invoice items, suppliers, supplier bills, serials, dates, and service status. Supplier bills open a prefilled RMA draft; selecting an invoiced item automatically links its serial-matched supplier bill; and the RMA list and form link back to the saved bill.
- A4 warranty service records with working portrait/landscape preview, print, and PDF output. Minimizing a draft returns the user to the application while preserving every entered field in a floating Restore bar; closing that bar prompts before discarding the draft.
- Supplier return receipts use the saved RMA reference and contain the supplier, linked bill number, purchase date, serial number, problem, return date, accessories, and supplier acknowledgment. Marking a return opens the receipt preview; A4 print/PDF require the saved return details. The customer service slip remains selectable, and company letterhead/stamp settings are reused.
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

- Application dialogs use a responsive landscape workspace on desktop and provide minimize, maximize/restore, and close controls without discarding in-progress form data. Users can minimize multiple transaction, item, contact, account, RMA, and other supported windows, continue working elsewhere, and restore each independent draft from a stacked window dock without one minimized form overwriting another.
- Success, warning, information, and error notifications use solid high-contrast colors that remain readable in light and dark mode, including while a dialog is open.

## VAT code register

- VAT Codes always retain six standard UAE choices, including `Goods imported into the UAE`, and allow administrators to add, edit, deactivate, or safely delete unused custom codes. Each code shows its linked documents and item defaults, supports evidence attachments, and exports as an A4 portrait print/PDF register with an optional movable company stamp.
- Customer Payments are non-VAT receipts: the entry screen hides VAT Code and VAT Amount, saves a payment method and separate reference number, links supporting attachments, and opens a fitted A4 portrait print/PDF receipt with an optional movable company stamp.

## Reporting

Sales reports use a deduplicated library grouped by daily activity, customers/delivery, products, performance/trends and pipeline/fulfilment. Search, customer/rep/account/status filters and numeric sorting drive the same summaries, charts, table/cards and A4 print/PDF, CSV and Excel downloads. Desktop aligns quantities and prices; tablet/mobile retain labelled details. Detail links open actual posted receivable/receipt and revenue accounts, while unposted documents retain saved planned accounts. Daily summaries count unique documents and use document totals; freight-only lines are excluded from unit counts. Sales Order Fulfilment shows ordered, invoiced and remaining quantities from current allocations. Excel includes a Sales summary sheet. The Sales stamp control provides a proportional A4 preview, mouse/touch dragging, keyboard movement and millimetre offsets shared by print/PDF.

Purchases reports are grouped by supplier spending, item purchasing and orders/receiving. Views include search, supplier/account/status filters, numeric sorting, matching summaries and report totals, desktop tables and tablet/mobile cards. A4 print/PDF, CSV and Excel use the displayed rows; Excel includes a Purchases summary sheet. Supplier spend excludes VAT consistently with detail. Outstanding purchase orders subtract saved receiving allocations, show commitments before VAT in home currency, and separate closed/cancelled orders in status counts. Detail account links use actual posted journal credits for bills/expenses; purchase orders show their saved planned account because they do not post. Missing or ambiguous historical account links are shown for review.

VAT reports use a grouped, deduplicated seven-report library with company-wide scope, code/rate labels, text/code/direction/account/status filters, filtered summaries and responsive table/cards. Detail VAT is signed for credit notes and includes per-line freight in taxable values; item groups separate saved codes/rates and input/output direction. Documents open their original source, VAT codes open a filtered register, and verified VAT accounts open ledger history. The code register shows current system VAT controls, not code-specific overrides. VAT Position Summary shows document output/input/net before manual adjustments rather than a complete VAT201 return. A4 portrait/landscape print/PDF, CSV and Excel share the visible rows and additive totals; unit prices and rates are never summed. VAT uses the proportional movable stamp preview.

The Report Center contains 120 report definitions. Inventory reports are grouped into valuation, availability/purchasing, and stock health/verification. Their views provide search, asset-account and status/aging filters, numeric sorting, summaries and totals for the displayed row set, desktop tables and tablet/mobile stock cards. A4 portrait/landscape PDF, CSV and Excel exports share the displayed filters; Excel includes a separate Inventory summary sheet. Saved asset-account IDs remain authoritative even after account renaming or deactivation, and a missing saved link is shown explicitly instead of silently using the default.

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
| Purchases | 8 | Supplier/item purchasing, order status, outstanding quantities and commitments |
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
