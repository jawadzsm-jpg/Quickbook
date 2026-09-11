export const appRoles = ["all_admin", "admin", "accountant", "sales", "purchasing", "inventory", "viewer"] as const;
export type AppRole = typeof appRoles[number];
export type Permission = "workspace:read" | "inventory:read" | "inventory:manage" | "inventory:transfer" | "reports:read" | "sales:write" | "purchases:write" | "banking:write" | "accounting:manage" | "customers:manage" | "vendors:manage";
export type SessionUser = { id: number; fullName: string; email: string; avatarData: string; themeColor: string; appearanceMode: "light" | "dark"; role: AppRole; mustChangePassword: boolean; companyIds: number[] };

const fullPermissions: Permission[] = ["workspace:read", "inventory:read", "inventory:manage", "inventory:transfer", "reports:read", "sales:write", "purchases:write", "banking:write", "accounting:manage", "customers:manage", "vendors:manage"];
const rolePermissions: Record<AppRole, Permission[]> = {
  all_admin: fullPermissions,
  admin: fullPermissions,
  accountant: ["workspace:read", "inventory:read", "reports:read", "sales:write", "purchases:write", "banking:write", "accounting:manage", "customers:manage", "vendors:manage"],
  sales: ["workspace:read", "inventory:read", "sales:write", "customers:manage"],
  purchasing: ["workspace:read", "inventory:read", "purchases:write", "vendors:manage"],
  inventory: ["workspace:read", "inventory:read", "inventory:manage", "inventory:transfer"],
  viewer: ["workspace:read", "inventory:read", "reports:read"],
};

export function hasPermission(user: SessionUser, permission: Permission) {
  return rolePermissions[user.role]?.includes(permission) ?? false;
}

export function isGlobalAdmin(user: Pick<SessionUser, "role">) {
  return user.role === "all_admin";
}

export function isAdministrator(user: Pick<SessionUser, "role">) {
  return user.role === "all_admin" || user.role === "admin";
}

export function canAccessCompany(user: Pick<SessionUser, "role" | "companyIds">, companyId: number) {
  return Number.isSafeInteger(companyId) && companyId > 0 && (user.role === "all_admin" || user.companyIds.includes(companyId));
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const expected = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
    return new URL(origin).origin === expected;
  } catch { return false; }
}
