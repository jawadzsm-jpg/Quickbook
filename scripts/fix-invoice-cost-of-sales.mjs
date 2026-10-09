// Corrects the cost of sales saved on posted invoices and sales receipts whose stock lines used an item's saved Cost
// field instead of what the stock was bought for (before invoices switched to the average purchase cost).
// Dry run by default; pass --apply to update.
//
//   node scripts/fix-invoice-cost-of-sales.mjs                                   (dry run, all companies)
//   node scripts/fix-invoice-cost-of-sales.mjs --company comnet [--invoice INV-1] (dry run; company name or id)
//   node scripts/fix-invoice-cost-of-sales.mjs --company 1 --apply
//
// The correct unit cost is the item's average purchase cost from bills and item receipts dated on or before the
// invoice (quantity × unit price + line freight, at each document's rate, home currency; cancelled, void and draft
// purchases ignored). For each invoice that differs, the line unit cost, the sale stock movement cost, and the posted
// Cost of Goods Sold debit and inventory asset credit change by the same amount; nothing else is touched.
// Invoices that were edited after posting, have more than one journal entry, or whose journal lines cannot be matched
// are listed for manual review and left unchanged. Every corrected invoice gets an audit-log entry with old values.

const closed = ["void", "voided", "cancelled", "canceled", "draft", "deleted"];
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function run(sql, { companyOption, invoiceNumber, apply = false, log = console.log } = {}) {
  let companyId = null;
  if (companyOption && /^\d+$/.test(companyOption)) companyId = Number(companyOption);
  else if (companyOption) {
    const found = await sql`SELECT id, name FROM companies WHERE name ILIKE ${"%" + companyOption + "%"} ORDER BY id`;
    if (found.length !== 1) { log(`"${companyOption}" matches ${found.length} companies; pass --company <id>:`); for (const company of found) log(`  ${company.id}  ${company.name}`); return { error: "company" }; }
    companyId = found[0].id;
    log(`Company: ${found[0].name} (#${companyId})`);
  }

  const lines = await sql`
    SELECT tl.id AS line_id, tl.transaction_id, tl.item_id, tl.quantity, tl.unit_cost,
      t.company_id, t.number, t.type, t.transaction_date, t.exchange_rate, t.party,
      i.name AS item_name, i.sku, i.cogs_account_id, i.asset_account_id,
      purchase.quantity AS bought_quantity, purchase.value AS bought_value
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    JOIN items i ON i.id = tl.item_id
    LEFT JOIN LATERAL (
      SELECT sum(pl.quantity) AS quantity, sum((pl.quantity * pl.unit_price + pl.freight_charge) * p.exchange_rate) AS value
      FROM transaction_lines pl JOIN transactions p ON p.id = pl.transaction_id
      WHERE pl.item_id = tl.item_id AND p.type IN ('bill', 'item receipt') AND NOT pl.is_freight_charge AND pl.quantity > 0
        AND lower(p.status) <> ALL(${closed}::text[]) AND p.transaction_date <= t.transaction_date
    ) purchase ON true
    WHERE t.type IN ('invoice', 'sales receipt') AND lower(t.status) <> ALL(${closed}::text[])
      AND i.item_type = 'stock-part' AND tl.quantity > 0 AND NOT tl.is_freight_charge
      AND (${companyId}::int IS NULL OR t.company_id = ${companyId}::int)
      AND (${invoiceNumber ?? null}::text IS NULL OR t.number = ${invoiceNumber ?? null}::text)
    ORDER BY t.company_id, t.transaction_date, t.id, tl.id`;

  const noPurchase = [];
  const byInvoice = new Map();
  for (const line of lines) {
    const rate = Number(line.exchange_rate) || 1;
    const oldHome = round2(Number(line.unit_cost) * rate);
    if (!(Number(line.bought_quantity) > 0)) { noPurchase.push({ ...line, oldHome }); continue; }
    const newHome = round2(Number(line.bought_value) / Number(line.bought_quantity));
    if (Math.abs(newHome - oldHome) < 0.01) continue;
    const entry = byInvoice.get(line.transaction_id) ?? { ...line, rate, lines: [] };
    entry.lines.push({ ...line, oldHome, newHome, delta: round2(Number(line.quantity) * (newHome - oldHome)) });
    byInvoice.set(line.transaction_id, entry);
  }

  const fixable = [];
  const review = [];
  for (const invoice of byInvoice.values()) {
    const edits = await sql`SELECT count(*)::int AS n FROM inventory_movements WHERE transaction_id = ${invoice.transaction_id} AND movement_type NOT IN ('invoice', 'sales receipt')`;
    if (edits[0].n) { review.push({ invoice, reason: "edited after posting (item changes, edits or void movements)" }); continue; }
    const entries = await sql`SELECT id FROM journal_entries WHERE transaction_id = ${invoice.transaction_id} AND posted = true`;
    if (entries.length !== 1) { review.push({ invoice, reason: `${entries.length} posted journal entries` }); continue; }
    const journal = await sql`SELECT id, account_name, debit, credit, original_debit, original_credit FROM journal_lines WHERE journal_entry_id = ${entries[0].id} ORDER BY id`;
    const accountName = async (accountId, role, fallback) => {
      if (accountId) { const [row] = await sql`SELECT name FROM accounts WHERE id = ${accountId} AND company_id = ${invoice.company_id}`; if (row) return row.name; }
      const [system] = await sql`SELECT name FROM accounts WHERE company_id = ${invoice.company_id} AND system_role = ${role} ORDER BY active DESC, id LIMIT 1`;
      return system?.name ?? fallback;
    };
    const changes = new Map();
    let problem = "";
    for (const line of invoice.lines) {
      const cogs = await accountName(line.cogs_account_id, "COGS", "Cost of Goods Sold");
      const asset = await accountName(line.asset_account_id, "INVENTORY", "Inventory Asset");
      const cogsLines = journal.filter((row) => row.account_name === cogs && Number(row.debit) > 0);
      const assetLines = journal.filter((row) => row.account_name === asset && Number(row.credit) > 0);
      if (cogsLines.length !== 1 || assetLines.length !== 1) { problem = `cannot match one "${cogs}" debit and one "${asset}" credit in the journal`; break; }
      changes.set(cogsLines[0].id, { row: cogsLines[0], side: "debit", delta: round2((changes.get(cogsLines[0].id)?.delta ?? 0) + line.delta) });
      changes.set(assetLines[0].id, { row: assetLines[0], side: "credit", delta: round2((changes.get(assetLines[0].id)?.delta ?? 0) + line.delta) });
    }
    if (!problem && [...changes.values()].some((change) => Number(change.row[change.side]) + change.delta < 0)) problem = "the correction would make a journal line negative";
    if (problem) { review.push({ invoice, reason: problem }); continue; }
    fixable.push({ invoice, journalEntryId: entries[0].id, changes: [...changes.values()] });
  }

  const money = (value) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  log(`\nWILL CORRECT: ${fixable.length} invoices`);
  for (const { invoice } of fixable) {
    log(`  ${invoice.number} (${invoice.type}, ${invoice.transaction_date}, ${invoice.party}) [company #${invoice.company_id}]`);
    for (const line of invoice.lines) log(`    ${line.sku} ${line.item_name}: qty ${line.quantity} × unit cost ${money(line.oldHome)} → ${money(line.newHome)}  (cost of sales ${line.delta >= 0 ? "+" : ""}${money(line.delta)})`);
  }
  log(`\nNEEDS MANUAL REVIEW, left unchanged: ${review.length}`);
  for (const { invoice, reason } of review) log(`  ${invoice.number} [company #${invoice.company_id}]: ${reason}`);
  log(`\nNO PURCHASE ON OR BEFORE THE INVOICE DATE, left unchanged: ${noPurchase.length} line(s)`);
  for (const line of noPurchase) log(`  ${line.number} ${line.sku} ${line.item_name}: unit cost ${money(line.oldHome)}`);

  if (!apply) { log("\nDry run only. Re-run with --apply to correct the invoices listed under WILL CORRECT."); return { fixable, review, noPurchase, applied: 0 }; }
  let applied = 0;
  for (const { invoice, journalEntryId, changes } of fixable) {
    const [entry] = await sql`SELECT exchange_rate FROM journal_entries WHERE id = ${journalEntryId}`;
    const entryRate = Number(entry?.exchange_rate) || 1;
    const details = JSON.stringify({ actorName: "fix-invoice-cost-of-sales script", mode: "cost-of-sales-correction", number: invoice.number, lines: invoice.lines.map((line) => ({ lineId: line.line_id, sku: line.sku, quantity: Number(line.quantity), oldHomeUnitCost: line.oldHome, newHomeUnitCost: line.newHome, costOfSalesChange: line.delta })) });
    const queries = [];
    for (const line of invoice.lines) {
      const newUnitCost = line.newHome / invoice.rate;
      queries.push(sql`UPDATE transaction_lines SET unit_cost = ${newUnitCost} WHERE id = ${line.line_id}`);
      queries.push(sql`UPDATE inventory_movements SET unit_cost = ${newUnitCost} WHERE transaction_id = ${invoice.transaction_id} AND item_id = ${line.item_id} AND movement_type = ${invoice.type} AND quantity < 0`);
    }
    for (const change of changes) {
      queries.push(change.side === "debit"
        ? sql`UPDATE journal_lines SET debit = round((debit + ${change.delta})::numeric, 2)::double precision, original_debit = CASE WHEN original_debit IS NULL THEN NULL ELSE original_debit + ${change.delta / entryRate} END WHERE id = ${change.row.id}`
        : sql`UPDATE journal_lines SET credit = round((credit + ${change.delta})::numeric, 2)::double precision, original_credit = CASE WHEN original_credit IS NULL THEN NULL ELSE original_credit + ${change.delta / entryRate} END WHERE id = ${change.row.id}`);
    }
    queries.push(sql`INSERT INTO audit_log (company_id, action, entity_type, entity_id, details) VALUES (${invoice.company_id}, 'updated', 'transaction', ${invoice.transaction_id}, ${details})`);
    // One transaction per invoice: the line, movement, both journal sides and the audit entry change together.
    await sql.transaction(queries);
    applied += 1;
  }
  log(`\nCorrected ${applied} invoices.`);
  return { fixable, review, noPurchase, applied };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { config } = await import("dotenv");
  const { neon } = await import("@neondatabase/serverless");
  config({ path: ".env.local" });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
  await run(neon(process.env.DATABASE_URL), { companyOption: option("company"), invoiceNumber: option("invoice"), apply: args.includes("--apply") });
}
