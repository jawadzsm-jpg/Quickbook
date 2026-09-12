import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, companies } from "@/db/schema";
import { canAccessCompany, hasPermission, requireApiUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await requireApiUser(request, "accounting:manage");
  if (user instanceof Response) return user;
  if (!hasPermission(user, "accounting:manage")) return Response.json({ error: "Your role cannot view account history." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get("companyId")), accountId = Number(params.get("accountId")), page = Number(params.get("page") || 1);
  if (![companyId, accountId, page].every((value) => Number.isSafeInteger(value) && value > 0) || page > 100000) return Response.json({ error: "Select a valid account and page." }, { status: 400 });
  if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
  try {
    const db = getDb();
    const [account] = await db.select({ name: accounts.name, currency: companies.baseCurrency }).from(accounts).innerJoin(companies, eq(companies.id, accounts.companyId)).where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)));
    if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
    const result = await db.execute(sql`
      with history as (
        select j.id, j.entry_date as date, j.reference, j.description,
          t.id as transaction_id, coalesce(t.type, 'Journal entry') as type,
          coalesce(t.party, '') as party, coalesce(nullif(t.memo, ''), j.description) as memo,
          coalesce(l.name, 'Company-wide') as inventory,
          sum(lines.debit) as debit, sum(lines.credit) as credit
        from journal_entries j
        join journal_lines lines on lines.journal_entry_id=j.id
        left join transactions t on t.id=j.transaction_id and t.company_id=j.company_id
        left join inventory_locations l on l.id=j.location_id and l.company_id=j.company_id
        where j.company_id=${companyId} and j.posted=true and lines.account_name=${account.name}
        group by j.id,t.id,l.name
      ), paged as (select * from history order by date desc,id desc limit 50 offset ${(page - 1) * 50})
      select (select count(*)::int from history) as total,
        coalesce((select json_agg(paged order by date desc,id desc) from paged), '[]'::json) as rows
    `);
    const row = result.rows[0];
    return Response.json({ accountId, companyId, currency: account.currency, page, pageSize: 50, total: Number(row.total), rows: row.rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Could not load account history. Please retry." }, { status: 500 }); }
}
