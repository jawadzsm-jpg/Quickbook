import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, authSessions } from "@/db/schema";
import { requireApiUser, touchRequestSession } from "@/lib/auth";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  const currentUser = await requireApiUser(request, false, true);
  if (currentUser instanceof Response) return currentUser;
  await touchRequestSession(request);

  const now = new Date();
  const activeSince = new Date(now.getTime() - ONLINE_WINDOW_MS).toISOString();
  const rows = await getDb().select({
    id: appUsers.id,
    fullName: appUsers.fullName,
    email: appUsers.email,
    avatarData: appUsers.avatarData,
    ipAddress: authSessions.ipAddress,
    lastSeenAt: authSessions.lastSeenAt,
  }).from(authSessions)
    .innerJoin(appUsers, eq(authSessions.userId, appUsers.id))
    .where(and(gt(authSessions.lastSeenAt, activeSince), gt(authSessions.expiresAt, now.toISOString()), eq(appUsers.active, true)))
    .orderBy(desc(authSessions.lastSeenAt));

  const users = [...new Map(rows.map((row) => [row.id, row])).values()];
  return Response.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
