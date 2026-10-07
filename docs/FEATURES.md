# Features and functionality

## Company workspace

- Multiple independent companies with home currency, legal identity, TRN, address, contact, and bank details.
- Multiple inventories/warehouses per company, each with its own code, invoice prefix, and next invoice number.
- Company and inventory selectors that scope forms, lists, dashboard data, and most reports.
- Per-user company assignments, global administration, company administration, and six operational roles.
- Configurable login branding, company logos, background, display name, copyright text, document colors, templates, and letterhead.
- Light and dark appearance modes using one fixed app-wide colour palette (users choose only light or dark), plus a live header panel showing online users and their current IP addresses.

## Sales and customers

- Customer records with company, international phone/WhatsApp validation, country, reseller/planet fields, TRN, email, credit, and currency.
- Quotations, estimates, proforma invoices, sales orders, invoices, sales receipts, statement charges, finance charges, and credit memos.
- Estimate, proforma invoice, sales order, and invoice entry forms offer Add Line below the last item row so long documents can grow without scrolling to the top. Their posting-account dropdown defaults to the selected customer’s linked Accounts Receivable account in the document currency.
- Partial conversion of estimates, proformas, and sales orders into one or more invoices with source-line allocation tracking.
- Customer payment entry against one or multiple open invoices, including partial allocations and refreshed invoice status.
- Customer center with balances, activity, open balances, statements, overdue analysis, and source document drill-down.
- Customer and supplier statements can include a movable bank details box: the Company Setup bank account for the statement currency (bank, account name, number, IBAN, SWIFT, currency) and its remark, editable for that statement. It prints after the statement table at the chosen left offset in screen print, standard PDF and custom-template PDF output, with the company stamp placed after it.
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
- Supplier bank details (bank name, account name, account number, IBAN, SWIFT/BIC) on each vendor, entered in the new-vendor form or Edit, shown on the Vendor Center supplier profile, and printable as a movable box on purchase orders, bills and single-vendor Vendor Statements.
- Supplier Centre Quick report and Open balance use the selected vendor’s currency, including foreign-currency vendors in a company with a different home currency.

## Inventory

- Stock, non-stock, service, other charge, subtotal, group, discount, payment, VAT item, and VAT group item types.
- Unique item numbers and SKU controls per inventory location.
- Quantity on hand, reorder points, sales prices, unit cost, GRN cost, serial numbers, and active status.
- Inventory items load independently from transactions, contacts, and account balances; historical average cost and open-PO quantities are aggregated in PostgreSQL, and long item lists are paginated for responsive browsing.
- Authorized inventory editors can mark each item inactive or active from its row. Inactive items move out of All items into the Item is inactive tab, and reactivated items return to All items. The inactive status label applies even at zero quantity; active stock counts exclude inactive items.
- Item specifications with reusable option values and generated descriptions.
- Inventory item rows show one uppercase line ordered as brand/model, generated SKU, condition such as `BRAND NEW`, remaining specifications, and the item number as a final `#` suffix. Generated and displayed descriptions omit every standalone `NO` specification. Inventory Overview email, WhatsApp, and Telegram copies retain that complete description and Item #; social copies use the same `🔺` product-title and `⚡` condition format for Brand New, Open Box, Refurbished, and Used items while omitting inventory-location lines.
- HS code, country of origin, dimensions, and weight maintenance.
- Consolidated inventory overview, out-of-stock/reorder view, and serial purchase/sales history. The Sales role can open the complete read-only Inventory Overview for its assigned companies instead of the limited Incoming items screen. The Consolidated stock heading uses a compact single-line toolbar with search and refresh controls. Every Inventory Overview product shows how many days ago it was last received and provides a read-only Product Customization Details popup to all roles with inventory access. Incoming links every outstanding quantity to its Purchase Order, labels it ready for Bill conversion or identifies its latest partial Bill, and removes converted/fully received POs. New Arrival lists stock received through saved Enter Bill documents for 12 hours from the bill creation timestamp, with supplier, received quantity, purchase price, and a View link to the bill. Price Change keeps only each item's latest valid selling-price change for 12 hours. Time-limited entries expire while the overview is open.
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

Vendors reports use a deduplicated ten-report library grouped into balances/aging, supplier activity and trends. Views provide search, supplier, posted account, status, document-type and past-due filters, matching summaries, desktop numeric tables and tablet/mobile cards. A4 print/PDF, CSV and Excel follow the displayed rows; Excel includes a Vendors summary sheet and identifies transaction currency. Posted payable or settlement accounts link to account history with existing permissions; planned purchase orders and missing or ambiguous historical links remain labelled. Running balances and unit prices are never summed. Supplier balance summaries and detail retain all prior activity through the selected as-of date. Posted payable entries classify charges and settlements; cash-paid expenses do not increase payable balances, and bill-linked bank cheques reduce balances and statements. Statements keep their server-side supplier, currency and date filters and opening/closing totals. Vendor stamps use the scaled A4 mouse/touch, keyboard and millimetre preview.

Sales reports use a deduplicated library grouped by daily activity, customers/delivery, products, performance/trends and pipeline/fulfilment. Search, customer/rep/account/status filters and numeric sorting drive the same summaries, charts, table/cards and A4 print/PDF, CSV and Excel downloads. Desktop aligns quantities and prices; tablet/mobile retain labelled details. Detail links open actual posted receivable/receipt and revenue accounts, while unposted documents retain saved planned accounts. Daily summaries count unique documents and use document totals; freight-only lines are excluded from unit counts. Sales Order Fulfilment shows ordered, invoiced and remaining quantities from current allocations. Excel includes a Sales summary sheet. The Sales stamp control provides a proportional A4 preview, mouse/touch dragging, keyboard movement and millimetre offsets shared by print/PDF.

Purchases reports are grouped by supplier spending, purchases by sales rep, item purchasing and orders/receiving. Purchases by Sales Rep (summary and detail) groups bills, received-item bills, purchase expenses and vendor credits (negative) by the Sales Rep saved on each document, in home currency, excluding cancelled/void documents; detail rows open the source document and its posted payable/payment account. Views include search, supplier/sales-rep/account/status filters, numeric sorting, matching summaries and report totals, desktop tables and tablet/mobile cards. A4 print/PDF, CSV and Excel use the displayed rows; Excel includes a Purchases summary sheet. Supplier spend excludes VAT consistently with detail. Outstanding purchase orders subtract saved receiving allocations, show commitments before VAT in home currency, and separate closed/cancelled orders in status counts. Detail account links use actual posted journal credits for bills/expenses; purchase orders show their saved planned account because they do not post. Missing or ambiguous historical account links are shown for review.

VAT reports use a grouped, deduplicated seven-report library with company-wide scope, code/rate labels, text/code/direction/account/status filters, filtered summaries and responsive table/cards. Detail VAT is signed for credit notes and includes per-line freight in taxable values; item groups separate saved codes/rates and input/output direction. Documents open their original source, VAT codes open a filtered register, and verified VAT accounts open ledger history. The code register shows current system VAT controls, not code-specific overrides. VAT Position Summary shows document output/input/net before manual adjustments rather than a complete VAT201 return. A4 portrait/landscape print/PDF, CSV and Excel share the visible rows and additive totals; unit prices and rates are never summed. VAT uses the proportional movable stamp preview.

The Report Center contains 124 report definitions with no duplicate entries: every category uses the same theme-token colours in light and dark mode, wide tables scroll sideways on desktop, and tables switch to labelled cards below 1024 px (tablet and phone). Money columns show negatives in red; identifiers, codes and years are shown without thousands separators. Every category, including Profit & Loss, places the movable company stamp after the final table in PDF output. For reports using the standard PDF layout, including customer and vendor statements, the stamp position guide draws the page where the table ends. It shows the real header, summary cards, rows and bank boxes, and puts the stamp where it will print, outlining your chosen spot when the stamp has to move below the table or onto a new page (`lib/report-stamp-preview.ts`). Inventory reports are grouped into valuation, availability/purchasing, and stock health/verification. Their views provide search, asset-account and status/aging filters, numeric sorting, summaries and totals for the displayed row set, desktop tables and tablet/mobile stock cards. A4 portrait/landscape PDF, CSV and Excel exports share the displayed filters; Excel includes a separate Inventory summary sheet. Saved asset-account IDs remain authoritative even after account renaming or deactivation, and a missing saved link is shown explicitly instead of silently using the default.

| Category | Count | Coverage examples |
| --- | ---: | --- |
| Profit & Loss | 12 | Standard, detail, item, sales rep, job, class, YTD, prior year, graphs |
| Financial | 16 | Business final report, balance sheet, cash flow, income, expenses, net worth |
| Budgets | 4 | Overview, budget vs actual and graph, P&L budget performance |
| Accountant | 11 | Trial balance, general ledger, journal, transaction detail, audit trail |
| Lists | 14 | Accounts, contacts, terms, transactions, memorised reports, currencies |
| Employees & HR | 2 | Employee balances and payment detail |
| Banking | 2 | Bank register and cheque detail |
| VAT | 7 | Summary, detail, exceptions, reverse charge, items, codes |
| Customers | 16 | Open balance, aging, statements, income, payments, invoices |
| Sales | 12 | Sales by customer, item, rep, transaction detail, pending documents |
| Vendors | 10 | Balances, statements, aging, supplier detail and quick reports |
| Purchases | 10 | Supplier, sales rep and item purchasing, order status, outstanding quantities and commitments |
| Inventory | 8 | Valuation, quantity, stock status, transaction detail, pricing/profit |

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
| Sales | My daily work, own customers/balances, quotations/sales orders/proforma creation, incoming items |
| Purchasing | Home, inventory context, purchases, cheques, vendors |
| Inventory Manager | Home, inventory, logistics, counts, and transfers |
| Viewer | Home, serial search, inventory overview/check reports, and Report Center |

The API permission model is authoritative; navigation visibility is a matching user experience layer.

### Shared Professional Report Center

The Report Center shows company/inventory context, accurate available-category counts, saved views and export formats. Report definitions are deduplicated by report key, retaining distinct reports with similar names. Desktop has a category sidebar; tablet/mobile have a compact category selector. Generic library cards use one open indicator. Supplier/currency options remain available when vendor reports appear in All Reports or search. Unknown or inaccessible saved report definitions are hidden.

Shared report tables use weighted desktop columns and labeled mobile/tablet cards with readable quantities and prices. Generic quantities retain up to six decimal places. Account links continue to use server-resolved account IDs and permission checks; ambiguous matches remain explicit review issues. Every report can use the optional A4 stamp preview with mouse, touch, keyboard or millimetre positioning; a single print stamp matches PDF coordinates. CSV and Excel now include available category summaries consistently with PDF. Generic exports use right-aligned numeric fields, wrapped Excel descriptions and A4 portrait/landscape tables. Employee balance amounts use the recorded employee currency on screen.

The generic table-export toolbar is suppressed inside Report Center dialogs, which already own PDF, Excel and CSV exports. This prevents duplicate export controls and keeps users on the report-aware output path that includes summaries, selected A4 orientation and stamps. Other transaction/table screens retain the fallback toolbar.

### Profit & Loss presentation and account reconciliation

The Profit & Loss library groups statements/comparisons, profitability analysis, and cost/account review. Reports use clear currency-labeled summary cards, section/subtotal/net-result styling, light/dark colors, and labeled mobile/tablet cards below 1024 px; A4 printing restores the complete table. A single export menu provides PDF, Excel and CSV. Account warnings are visible and included with the reporting basis and summary in every export; Excel also includes a formatted ledger-detail sheet. Detail and COGS reports avoid repeating the same ledger table below the main report. Existing shared stamp controls support mouse/touch dragging, arrow keys and millimetre offsets, with A4 portrait/landscape print and PDF placement.

Standard and comparison P&L totals use the same resolved Chart of Accounts IDs as ledger details. Same-name accounts do not repeat postings in comparisons, and currency-resolved accounts remain visible in standard statements. Existing account-resolution rules and permission checks remain authoritative; unresolved postings stay in Unclassified and are flagged rather than assigned automatically. No posting accounts or journal entries are changed by viewing reports.

### Financial report library

Financial reports are grouped into financial position, income/expenses, and cash/exchange differences, retaining all 15 category reports with one open indicator per card. The 14 ledger-based financial reports use report-specific summary cards: balance-sheet assets, liabilities, equity and reconciliation difference; cash opening/movement/closing; latest net-worth snapshot; forecast opening/inflows/outflows/final balance; customer/supplier totals; and calculated FX gains/losses with missing-rate counts. Snapshot and running balances are never summed across periods. The Complete Business Final Report retains its management overview.

Financial tables use the shared desktop table and tablet/mobile cards with labeled numeric fields, light/dark styling, and A4 print layouts. One export menu supplies PDF, CSV and Excel; all formats include the same summaries and account-review issues. Excel includes A4 account-detail and review sheets. Currency-qualified account names link through their resolved IDs, while customer/supplier labels remain separate and account permissions are preserved. Detail reports avoid repeating identical supporting rows on screen. Existing shared stamp controls allow dragging, keyboard movement and millimetre positioning for portrait/landscape print and PDF. FX estimates remain clearly identified as calculated, not automatically posted journals.

### Budget report comparisons

Budgets contains four reports: Overview, Budget vs. Actual, P&L Budget Performance (moved from the P&L category without duplicating its report key), and the monthly comparison graph. These reports use posted results for the matching prior-year period as a historical baseline, not saved or approved budget plans. The library, summary notes and exports state that basis; API results include both actual and baseline date ranges. Account rows retain verified Chart of Accounts IDs and existing access checks. Unmatched or ambiguous postings in either comparison period are excluded from classified totals and explicitly listed for review on screen and in PDF, CSV and Excel.

Shared tables provide readable desktop numeric columns and labeled tablet/mobile cards, with light/dark colors, A4 portrait/landscape print and exports, and a single export menu. The monthly graph shows positive and negative net results on opposite sides of a zero line; it displays the latest 12 months with the complete dataset in the table and downloads. Income variance is actual minus baseline; expense variance is baseline minus actual. P&L summaries exclude the displayed Net Profit row from summed income/expense cards to avoid double counting. Optional company stamps retain shared drag, touch, keyboard and millimetre positioning.

## Accountant report review

The eleven Accountant reports use a deduplicated library grouped into ledger/reconciliation, document activity and audit/exceptions. Search and verified-account filters preserve original row order and running balances. Summaries, desktop tables, tablet/mobile cards and A4 print/PDF, CSV and Excel use the same displayed records. Running balances and unit prices are never summed. Trial Balance describes its posted-entry scope and cautions that filtered subsets may not balance. Business-document totals are distinguished from ledger balances.

Verified accounts open Chart of Accounts history with existing permissions. Unresolved links keep their recorded amounts and carry account-review warnings into PDF, CSV and a separate Excel review sheet. No accounts or postings are created or changed. Light/dark styles, a single export menu, portrait/landscape A4 and the shared stamp preview with touch/mouse, keyboard and millimetre movement are retained.

## Lists report library

Fifteen Lists reports are grouped into accounts/assets, items/pricing, contact directories and terms/working records, with duplicate report keys removed from the library. Each report has text search, available-status filtering and ascending/descending sorting; quantities, prices and numeric columns sort numerically. Summaries, responsive desktop tables/tablet/mobile cards and A4 print/PDF, CSV and Excel use the same displayed rows. Unit prices are not summed. Shared light/dark controls, one export menu and movable stamp preview support portrait and landscape output.

The three item lists include verified inventory asset-account links for stock items (non-stock/service items display a dash) using the existing saved-account/default rules. Missing account links remain visible with their original records and produce review warnings in downloads. Account Listing retains system roles and parent-account links. Terms Listing describes terms derived from document dates, while Memorised Transaction Listing identifies memo keywords rather than scheduled transactions. No account or posting records are changed.

## Home workflow dashboard

Home groups tasks into Suppliers, Customers, Banking and Company & reports with readable independent cards, light/dark colors, keyboard focus and one/two/four-column layouts. Deposits are grouped under Banking. Redundant Inventory/Add Item and Bank Register/Reconcile navigation shortcuts are consolidated into Inventory Center and Banking Center. Users with report access have a Report Center shortcut describing its existing A4/PDF/Excel/CSV and movable-stamp capabilities. Transaction-entry routes and account-posting rules remain unchanged; Home itself is a navigation screen.

## Employee salary, loan and vacation profile

Administrators can save/edit monthly salary, a salary Expense account, a manually recorded employee loan balance, vacation departure and return dates. Amounts use the employee currency. The list displays these details, and Employee Balance Summary includes them with a link to the salary account in A4 print/PDF, CSV and Excel output. Non-admin contact-list responses omit these private HR fields.

Selecting an employee for a salary cheque prefills the saved salary amount when visible and selects its expense account. The server validates and enforces the employee's configured salary account when posting salary cheques; existing bank-credit posting applies. Only active, uniquely named Expense accounts in the same company may be selected. Profile saves do not post journals, disburse loans, deduct repayments or create payroll schedules. The recorded loan balance is maintained manually and is separate from the employee's existing accounting balance. Vacation return cannot precede departure.


Employee record windows ignore outside clicks and have an explicit Minimize button; restoring from the dock retains the draft. Banking → Write Cheque → Employee loan requires an employee and an active, same-currency Other Current Asset account without a system role. Posted payments appear automatically in the employee HR form/list with payment number, date, currency, amount and account. Totals are loan amounts paid, not remaining balances: repayments and payroll deductions are not included. Existing manual loan figures remain separate to avoid double counting. Historical unlinked transactions are not assigned by name automatically.


The HR employee form now exposes a Loan / advance account selector directly below Salary expense account. It lists active, same-currency Other Current Asset accounts without system roles. The saved link is shown in HR and Employee Balance Summary; Banking employee loan payments select it automatically. This is an employee loan receivable account, not a company borrowing liability or bank account.


## Staff salary sheets

Employees & HR provides a Salary sheets control for administrators. Its monthly staff template follows the supplied STAF layout: serial number, employee name, personal number, card details, bank, IBAN, salary, service-fee count/rate, salary total, editable charges and grand total. Users can create, save, view, edit and delete company-scoped sheets. HR employee selection prefills name/salary, while personal/bank identifiers remain text. A4 landscape PDF and print share the same paginated output, with company letterhead and page numbers. Saved sheets retain their company branding snapshot. The optional Ref. No. field appears in the saved list, preview and A4 print/PDF. After saving, Attachments opens upload, download and removal controls (10 files maximum, 3 MB each); these controls also appear when viewing or editing the sheet. Files are kept with the sheet and excluded from print/PDF. Documents do not post payroll or adjust balances.

Employee edits open the dedicated Employee form, including salary, loan-account and vacation fields. Find existing bank loan lets an administrator explicitly select an unlinked, posted, tax-free bank cheque against an eligible advance asset in the employee currency. Linking saves immediately, is audited, and never posts a second payment or changes manual balances. Employee choices in Banking display the employee name rather than their company name.

Salary sheet dialogs use the available desktop width, retain scrollable forms and visible save controls, and stack preview rows on mobile. Saved lists show the name, month and date range. PDF filenames use the saved document name, salary month, start/end dates and record ID. A4 landscape columns total 273 mm inside 12 mm margins.

HR profiles have a separate Payment bank / Pay from dropdown for active company banks in the employee currency. Banking salary/employee-loan selection prefills this saved bank, while users can choose another valid bank for a payment. The Loan / advance dropdown always offers “Create loan account for this employee on Save”; saving creates or reuses a uniquely named employee advance asset account with zero opening balance. Cancel creates no account, and manual loan balances are not posted to the ledger. The salary sheet Add employee row action uses a green high-contrast style in both appearance modes.


### Chart of Accounts controls

Account rows expose red delete icons to administrators. Main and system accounts remain protected; deletion is still limited to eligible unused sub-accounts. Users with accounting management access can make unlinked accounts inactive or active with the power icon, and filter All/Active/Inactive accounts. System accounts, active parent/child dependencies and saved customer/vendor/employee/item links are protected. Historical balances and journals remain unchanged. Account status changes are audited and reject stale updates.

Negative account balances use the app accent color (readable shades in light and dark mode), retain their minus sign and stay together on desktop. Account rows become labeled cards on tablet/mobile. The Chart of Accounts toolbar has an explicit Minimize icon and label, with a Restore action retaining the current search and filters. Account dialogs retain their existing minimize/maximize controls.


### HS code, COO and packing dimensions

The item logistics editor provides searchable theme-aware HS code and country-of-origin pickers with explicit Add actions. Custom choices persist for the selected company and can be reused across inventories; each item keeps one selected HS code and COO. Country suggestions include the full country list. HS code choices store the code itself, with an optional descriptive label. Adding a choice selects it on the item; Save Changes applies the item update. All choices, including built-in suggestions, have a blue edit icon and red delete icon for users with inventory management access. Edit opens a value/description form with Save choice and Cancel; delete asks for confirmation. Built-in edits and deletions persist as company-specific overrides and do not affect other companies. Changes affect the choice catalog only; saved item and packing-list values remain intact. Select an edited choice and Save Changes to apply it to an item.

Entering positive length, width and height automatically fills Dimension as L × W × H cm. New invoice packing drafts load the saved item dimensions, HS code and COO. Editing carton dimensions updates the displayed and saved dimension text; existing saved packing lists keep their snapshots when item logistics change. Minimize/Restore in the logistics header preserves unsaved edits, search and pagination, and Reset asks before discarding changes. Pickers fit light/dark mode and small screens; packing rows use labeled grids on standard desktop/tablet/mobile widths instead of forcing an 1850 px table. Existing packing dialog minimize controls and A4 output remain available.

### Operational roles and pending invoices

Administrators alone delete saved records or cancel business documents. Users may still cancel their own unsaved forms. Accountants have a dedicated Company Setup panel for the company stamp and bank details, with responsive fields and explicit Minimize/Restore. It includes the default account's bank stamp and the Bank accounts by currency editor, each account with its own bank stamp, all saved by one button.

Admins and accountants can create, edit and reopen Pending Invoices from Sales. These are drafts with no stock, VAT journal or customer-balance posting. Convert to Invoice posts once through the normal invoice validation and numbering workflow.

Inventory users can add/edit items, change inventory details, transfer stock, create purchase orders and vendors, and create/print warranty and supplier receipts. They can view/edit bills and receipts only on their creation day in UAE time. The deadline is based on creation time, not the invoice date; opening an old URL or attachment cannot bypass it. Their sales view is read-only except for Add serial numbers on saved invoices, which appends serials while preserving existing serials, quantities, prices and accounting.

Shared dialogs retain explicit Minimize/Restore. Pending-invoice quantity and price fields use the existing responsive transaction editor. Serial entry and stamp/bank settings reflow across desktop, tablet and phone widths. Warranty lists become labeled cards on tablets and phones, keeping receipt actions visible.

### Restricted sales workspace

Sales users have four navigation entries: My daily work, Sales, My customers & balances, and Inventory Overview. They can create quotations (including the existing estimate type), sales orders, and proforma invoices for their assigned active customers, and can read the complete Inventory Overview for their assigned companies. They cannot post invoices/payments, cancel/delete documents, modify inventory, or open company-wide reports. Daily work uses UAE creation dates and shows only their own newly created document activity.

Saved proformas are handed to accounting: sales sees only a confirmation and daily activity reference, with no reopen/edit/print/PDF or attachment access. Accountants and admins can reopen the saved proforma and use the existing PDF, stamp and bank controls.

Customer names are rejected at 70% or greater normalized edit-distance similarity, across billing/company names and all company customers (including other reps' customers). Punctuation/case normalize before comparison. Existing exact TRN and normalized international contact/WhatsApp checks remain. New sales-created customers automatically belong to that user with zero opening balance. Admins assign or reassign existing customers in Customer Center. Unassigned legacy customers remain restricted until assigned; ownership is never guessed from a free-text salesman name.

Incoming shows only outstanding purchase-order item quantities, SKU/item number, inventory and selling price. Supplier names, purchase prices, bill/PO identifiers, other stock activity and purchase links are absent from the sales response. New views use responsive cards, theme colors, labeled quantities/prices and explicit Minimize/Restore controls.


### Invoice stock returns and copy selection

Invoice entry includes **Add stock return**, including active stock items with zero availability. Entering a negative quantity such as -1 adds one unit to the invoice inventory on save. These lines require zero selling price and zero VAT: they change stock and internal inventory/COGS postings without changing the customer balance or invoice amount. Return cost comes from the current item cost, excluding configured purchase VAT and converted into the invoice currency. This option is not a customer credit/refund.

Customer Copy is the default invoice preview/PDF and hides both negative quantities and zero selling-price lines. New item lines carry the complete inventory description (name, SKU, condition, and specifications), but customer invoice copies omit the Item #. Inventory Copy includes all lines, labels stock returns, and appends the Item # to each linked item description. A zero purchase cost does not hide a charged item. Save/Download exports the selected copy; inventory PDFs have an Inventory_Copy filename suffix. Print 2 A4 copies uses separate customer and inventory content with signature areas. Native browser print uses the selected copy.

For source-document conversions, save the conversion first and then edit the saved invoice to add stock returns. Administrators editing invoices can append return lines or correct the quantity of an existing return; an existing sale line cannot change direction. Reversals are refused if returned stock has already been consumed. Existing permissions remain: inventory users cannot change invoice quantities or prices. Negative return lines are excluded from packing lists, warranty item choices and Just Sold activity. Positive zero-price outgoing items remain packing-eligible. Invoice delivery-note output hides internal invoice lines. Quantity/price fields reflow on desktop, tablet and mobile; shared invoice and return dialogs provide explicit Minimize/Restore icons.


### Posted journal register

Posted Journal Entries uses a searchable register with one row per journal, date/source/account/currency filters, 50-entry screen pages and debit/credit summary cards. The initial period is the current UAE month; Today and Reset / all dates offer quick changes. Search covers references, descriptions, dates, account names/codes and sources. Date endpoints are inclusive. The old 300-entry cutoff is removed; unposted journals never enter the register. Separate journals sharing a reference remain separate, identified by journal ID.

Expand account postings or open View to inspect a journal. Verified company Chart of Accounts links open account history; ambiguous/missing links are flagged without hiding their amounts. Account filters retain the full journal and balancing accounts. Transaction postings open their source document. Existing administrator-only manual-journal edit/delete controls and revision checks remain unchanged.

A4 Print opens the same PDF output in a print-capable browser tab. PDF, CSV and Excel include all filtered entries across screen pages, with the selected period, inventory, company, home currency, summaries and account-link review notes. Include account lines switches exports to detailed postings while preserving totals. File names include company, period and download date. A4 portrait is the default, with landscape available. Shared company-stamp controls support mouse/touch dragging, arrow keys and millimetre placement; print/PDF use that position on the first page.

Desktop uses aligned list columns; tablets and phones use labeled cards and expandable postings. Journal entry amount fields also reflow. Light/dark colors follow the app theme, red delete actions stay permission-controlled, and explicit Minimize/Restore preserves list filters and dialog drafts.

## Income tax reporting

Report Library → Financial → Income Tax Working Paper provides editable percentage bands, threshold, tax period, additions/deductions and explanations. The AED preset uses 0% up to AED 375,000 and 9% above it; Flat rate sets threshold to zero. Non-AED companies start with zero rates/threshold and require custom configuration. The threshold is applied once to the selected period, without proration. This is an estimate: special regimes, exemptions, reliefs, loss utilisation, credits and top-up tax require separate review. Rate reference: https://mof.gov.ae/en/news/ministry-of-finance-confirms-applicable-taxable-income-threshold-for-corporate-tax-abu-dhabi-uae/ (checked 2026-10-04).

Posted ledger income less COGS/expenses gives accounting profit. The selected tax-expense account is added back to derive profit before income tax, followed by manual adjustments. Negative adjusted profit produces zero current estimated taxable income, not an automatic tax-loss carry-forward. Summaries and detailed calculations use home currency across all company inventories. Verified account links open history; missing/ambiguous links are flagged. A provision comparison identifies the selected expense/payable accounts without automatically posting anything.

Administrators/accountants can create/link the standard tax accounts, save working papers and update saved periods. One configuration per company/date range prevents duplicates and revision checks prevent overwriting another user's changes. Report readers may preview and export. Saved configurations recalculate from the live ledger; they are not filed-return snapshots. Clear company → saved reports includes working papers.

Responsive calculation rows, light/dark styling, shared Minimize/Restore dialog controls, A4 portrait/landscape print/PDF, CSV and Excel, report summaries and draggable/touch/keyboard stamp placement share the same calculation. Exports require recalculation after settings change, include company/period/date in filenames, and show assumptions and review notes. Print opens the A4 PDF in a printable browser tab; stamps are on the first PDF page.

## Admin backup controls

Admin Controls includes company-scoped manual backups, one-time/daily/weekly/monthly UAE date/time schedules, 7/30/90/365-day retention, private downloads, SHA-256 verification and a responsive light/dark history view. The latest successful file is retained during automatic cleanup. Passwords and authentication configuration are excluded; recovery is administrator-assisted, not a one-click ledger overwrite. See [Company backups](BACKUPS.md).

## Sales document workspace

The Sales document workflow has responsive preparation/confirmation/order/invoice cards, a minimize/restore action, and role-aware pending invoice and Chart of Accounts shortcuts. Sales-only users retain their restricted quotation/order/proforma handoff. The document register provides a filtered summary, status/currency/date/search filters and recorded posting/planned accounts. Duplicate display IDs are collapsed without deleting saved documents.

A4 print preview, PDF, CSV and real XLSX use the selected company/inventory context and saved document output design. Administrators and accountants can include and reposition the company stamp for sales-register print/PDF. Register summaries describe the loaded list (up to 500 recent transactions); they do not combine currencies or count non-posting document values as revenue. Document conversion uses responsive item cards with source unit prices and clearly labelled quantity fields, preserving existing stock/allocation validation.

## Purchase document workspace

Purchasing has responsive Order/Receive/Bill/Pay/Return cards and an explicit minimize/restore control. Inventory users retain their existing restricted actions. The register shows filtered document counts and recorded posting/planned accounts with search, date, status and currency filters. Duplicate display IDs are collapsed without deleting saved business records.

Register exports support A4 portrait/landscape PDF and print preview, CSV and Excel, including company/inventory context and original currencies. Admins and accountants can enable and move the company stamp. Counts avoid combining order, receipt, bill and payment values as if they were expenses. The loaded register is limited to recent transactions; authorized users can open Purchase Order Summary for broader reporting. Source order selection and receiving use responsive cards with quantities and original unit prices. Existing accounting, stock, import-document and permission rules remain in force.

### Document controls and clear stamp placement

Document previews group layout choices, copy selection and print/PDF actions into responsive sections with theme-aware colors. Record registers separate search/date filters from output actions. On transaction previews (classic templates and Layout Builder layouts) the company stamp and a bank details box can be placed anywhere on the first page: drag them or type Left / Top in millimetres from the top-left of the printable area. The bank details box prints, as text, the Company Setup bank account matching the document currency (default account and every extra currency account) with that account's remark and optional bank stamp image; the remark can be rewritten for a single document. A Layout Builder "{status}" stamp (OPEN, PAID, …) can also be moved, hidden and saved as a Status stamp; the template's own bank block follows the template design. Both stamps start switched off on every document type until ticked, and Save stamp positions stores their on/off state and position per document type. Standard report PDFs place stamps after the last table, adding a page when necessary and preserving footer clearance. Custom template body fields and accounting values are unchanged.

### Shared workspace arrangement

All shared dialogs use a dedicated control bar for minimize, maximize/restore and close, with consistent touch targets and light/dark colors. Controls remain outside the document content and are hidden in print. Minimized dialogs retain a visible title and restore controls.

The app header Shortcuts button opens a searchable, categorized list derived from the current user's permitted sidebar pages. Ctrl/Command+K opens it when no dialog is active; selecting a page preserves the active company. Shortcut IDs are deduplicated. A compact calculator icon on the same header row opens a light/dark-mode keypad for quick arithmetic without leaving the current workspace. Customer/vendor/banking action cards use the shared theme. Register-owned exports suppress redundant generic toolbar exports, while shared numeric table fields retain responsive widths and alignment. Existing structured A4/PDF/CSV/Excel reports, accounting links and stamp rules remain unchanged.

Company and inventory administration is accessed through the Management navigation group. The duplicate Companies & inventory sidebar footer shortcut is removed.

### Customer and vendor sub-accounts

Customer and vendor Add/Edit forms include Sub-account of and Active/Inactive controls. Lists provide All/Active/Inactive filters and display the parent name; A4/PDF/CSV/Excel list exports include the parent and status. Each sub-account retains its own balance, currency and AR/AP ledger link; parent links do not consolidate balances or change posting. Existing duplicate-name, phone and TRN rules still apply.

Parents must be the same contact type and company; sales users can select only their own customers. Self-links and cycles are rejected. Active children must be moved or made inactive before their parent is deactivated; parents with children cannot be deleted. Inactive contacts remain in history and can be reactivated. New trading documents reject inactive parties, while payment lists retain them for balance settlement and credit/return workflows remain available.

Authorized users can also Activate/Make inactive directly from a contact row. This narrow action preserves identity details and rejects stale status changes.

- **Invoice line Pending Cart:** per-line Pending and Restore actions in invoice entry/editing; atomic save to non-posting customer drafts in Sales → Pending Cart, with stock/accounting reversal for posted lines and payment, packing, source-link and revision protection.

- **Complete invoice series customization:** administrators can replace the full invoice format per inventory, including fixed text, separators, suffixes, optional company/prefix placeholders, number padding and next sequence. Live previews use the same formatter as posting; saved invoice numbers remain unchanged, with duplicate and stale-editor protection.

### Insights daily transaction activity

Company Home → Insights includes an Entry date selector (today in UAE time by default), Today and Refresh actions, a matching entry count and paginated access to every permitted transaction entered that day. Rows show entry time, original document date, type/reference, party, inventory, creator, status and amount in the recorded currency, with View to open the source. Backdated documents appear on their actual entry day. Company, inventory and server-side role restrictions apply. Current balance and financial overview cards remain clearly labelled as unfiltered current figures; sales representatives retain their dedicated My daily work screen.
