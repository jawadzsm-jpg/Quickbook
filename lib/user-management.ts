import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireApiUser, type AppRole, type SessionUser } from "@/lib/auth";

// Shared by the user-management API routes.
export const roleNames: Record<AppRole, string> = { all_admin: "All-Admin", admin: "Administrator", accountant: "Accountant", sales: "Sales", purchasing: "Purchasing", inventory: "Inventory Manager", customization: "Product Customization", viewer: "Viewer" };

export async function companyIdsForUser(userId: number) {
  const result = await getDb().execute(sql`SELECT company_id FROM app_user_companies WHERE user_id = ${userId} ORDER BY company_id`);
  return result.rows.map((row) => Number(row.company_id));
}

// A company Administrator manages only operational users (not Administrators or All-Admins) whose every company is one
// of their own; an All-Admin manages everyone.
const elevatedRoles: AppRole[] = ["all_admin", "admin"];
export const isCompanyAdmin = (manager: SessionUser) => manager.role !== "all_admin";
const withinCompanies = (manager: SessionUser, companyIds: number[]) => companyIds.length > 0 && companyIds.every((id) => manager.companyIds.includes(id));
export const canManage = (manager: SessionUser, role: AppRole, companyIds: number[]) => !isCompanyAdmin(manager) || (!elevatedRoles.includes(role) && withinCompanies(manager, companyIds));

// All-Admins manage every user. Company Administrators manage operational users of their own companies only (see
// `canManage`). If no active All-Admin remains, `scripts/bootstrap-admin.mjs` restores one.
export async function requireUserManager(request: Request, mutating = false) {
  return requireApiUser(request, true, mutating);
}

export const outOfScope = () => Response.json({ error: "Company Administrators can only manage non-administrator users of their own companies." }, { status: 403 });
