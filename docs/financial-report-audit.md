# Financial report audit — 2026-09-15

Scope: all 14 reports in Report Center’s Financial category. No production data was changed.

## Read-only database checks

Checked the main branch of the connected COMNET database: four companies, 68 Chart of Accounts records and 60 posted journal entries.

No unmatched or ambiguous posted account names, duplicate account-name mappings, unsupported account types, unbalanced posted journals, tested system-role/type mismatches, document AR/AP currency mismatches, cross-company journal source links, or journal/source inventory mismatches were found. These are structural checks, not verification against external bank statements or source invoices.

## Report corrections

| Reports | Corrected basis and links |
| --- | --- |
| Income by Customer Summary / Detail | Posted income and other-income accounts; credits reverse income; manual entries remain Unallocated; detail links source documents and actual account IDs. |
| Expenses by Supplier Summary / Detail | Posted expense and COGS accounts; payments against AP no longer count as a second expense. |
| Income & Expense Graph | Same posted income/expense totals as the ledger, grouped by posting month. |
| Balance Sheet Standard / Detail / Summary | Asset, liability and equity account classifications plus accumulated unclosed earnings, including prior periods. |
| Balance Sheet Prev Year Comparison | Cumulative posted balances at matching current/prior-year dates, including earnings. |
| Net Worth Graph | Cumulative asset balances less liabilities at each month end. |
| Statement of Cash Flows | Opening cash, operating/investing/financing movements and closing cash from Bank accounts; internal transfers net to zero; mixed entries remain explicitly unclassified. |
| Cash Flow Forecast | Current posted bank balance plus remaining posted AR/AP documents after validated allocations and legacy direct payment links; unapplied payments/credits retained, overdue amounts bucketed into current month. |
| Realised Gains & Losses | Validated allocated settlements at saved settlement versus booked rates, with opposite signs for receivables/payables. These are calculated differences, not automatically posted FX profit. |
| Unrealised Gains & Losses | Remaining posted AR/AP currency positions at current configured rates; missing rates produce no invented gain. Does not revalue foreign bank or other monetary accounts. |

All financial reports expose account/source drill-down details; account history respects existing accounting permissions and covers the full company. Ambiguous account names are excluded from classification and recorded in API diagnostics rather than linked arbitrarily. Existing UI warning-banner visibility preferences are preserved.

## Validation

Regression coverage exercises all 14 report routes, account IDs, source links, partial allocations, cheque settlement, credit reversal, future payment exclusion, draft-journal exclusion, prior-year balances, cash reconciliation, duplicate account-name handling and company access.

The existing company-clear test still expected assigned administrators to be rejected, despite main already permitting them. Updated the test to check rejection of unassigned administrators and acceptance of assigned administrators; no production permission logic changed.

Limitations: no authenticated browser interaction was performed. Reports cannot correct missing source costs or unposted FX adjustments. No transactions, balances, account configuration or database schema were modified.
