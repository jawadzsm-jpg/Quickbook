import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { getRequestUser, sameOrigin, verifyPassword } from "@/lib/auth";
import { backupCodesLeft, checkSecondFactor, mfaCleared } from "@/lib/mfa";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { newBackupCodes, newTotpSecret, otpauthUri, verifyTotp } from "@/lib/totp";

// Two-step sign-in for the signed-in user: status, start setup (QR code), turn on with a code, new backup codes, turn off.
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function currentUser(request: Request) {
  const session = await getRequestUser(request);
  if (!session) return json({ error: "Authentication required." }, 401);
  if (session.mustChangePassword) return json({ error: "Change your temporary password first." }, 403);
  const [user] = await getDb().select().from(appUsers).where(eq(appUsers.id, session.id)).limit(1);
  return user ?? json({ error: "Authentication required." }, 401);
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (user instanceof Response) return user;
  return json({ enabled: user.mfaEnabled, enabledAt: user.mfaEnabledAt, backupCodesLeft: user.mfaEnabled ? backupCodesLeft(user) : 0 });
}

export async function POST(request: Request) {
  try { return await handlePost(request); }
  catch (error) {
    console.error(JSON.stringify({ event: "two_step_failed", reason: error instanceof Error && /encryption|SMTP_ENCRYPTION_KEY/.test(error.message) ? "encryption_key" : "unknown" }));
    return json({ error: error instanceof Error && /encryption|SMTP_ENCRYPTION_KEY/.test(error.message) ? "Two-step sign-in is not available: the server's encryption key is not configured. Ask your administrator." : "Could not update two-step sign-in. Try again." }, 500);
  }
}

async function handlePost(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const user = await currentUser(request);
  if (user instanceof Response) return user;
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(payload.action ?? "");
  const code = String(payload.code ?? "").trim();
  const db = getDb();
  const save = (values: Partial<typeof appUsers.$inferInsert>) => db.update(appUsers).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));

  if (action === "start") {
    if (user.mfaEnabled) return json({ error: "Two-step sign-in is already on." }, 409);
    const secret = newTotpSecret();
    await save({ mfaPendingSecretEncrypted: encryptSecret(secret) });
    const uri = otpauthUri("EasyBook", user.email, secret);
    const qr = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
    return json({ secret: secret.replace(/(.{4})/g, "$1 ").trim(), otpauthUri: uri, qrCode: `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}` });
  }

  if (action === "enable") {
    if (user.mfaEnabled) return json({ error: "Two-step sign-in is already on." }, 409);
    if (!user.mfaPendingSecretEncrypted) return json({ error: "Start the setup again." }, 409);
    const step = verifyTotp(decryptSecret(user.mfaPendingSecretEncrypted), code);
    if (step === null) return json({ error: "The code is incorrect or has expired. Enter the current 6-digit code from the app." }, 400);
    const backup = newBackupCodes();
    await save({ mfaEnabled: true, mfaSecretEncrypted: user.mfaPendingSecretEncrypted, mfaPendingSecretEncrypted: "", mfaBackupCodes: JSON.stringify(backup.digests), mfaLastStep: step, mfaEnabledAt: new Date().toISOString() });
    return json({ enabled: true, backupCodes: backup.codes });
  }

  if (action === "backup-codes") {
    if (!user.mfaEnabled) return json({ error: "Two-step sign-in is off." }, 409);
    const checked = checkSecondFactor(user, code);
    if (!checked) return json({ error: "The code is incorrect." }, 400);
    const backup = newBackupCodes();
    await save({ ...checked, mfaBackupCodes: JSON.stringify(backup.digests) });
    return json({ backupCodes: backup.codes });
  }

  if (action === "disable") {
    if (!user.mfaEnabled) return json({ enabled: false });
    if (!(await verifyPassword(String(payload.password ?? ""), user.passwordHash))) return json({ error: "The password is incorrect." }, 403);
    if (!checkSecondFactor(user, code)) return json({ error: "The code is incorrect." }, 400);
    await save(mfaCleared);
    return json({ enabled: false });
  }

  return json({ error: "Unknown action." }, 400);
}
