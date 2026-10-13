import { getRequestUser, markRequestSessionActive, sameOrigin } from "@/lib/auth";

// Keyboard/mouse/touch activity ping for the automatic sign-out after inactivity. It answers with the user's current
// idle limit so a change made in Users & access reaches open sessions. An idle-expired session gets 401.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  await markRequestSessionActive(request);
  return Response.json({ idleTimeoutMinutes: user.idleTimeoutMinutes }, { headers: { "Cache-Control": "no-store" } });
}
