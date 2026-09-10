import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const user = { id: 1, email: "admin@example.test", role: "admin", companyIds: [1], mustChangePassword: false };
globalThis.__comnetTestUser = user;
globalThis.__comnetDbCalls = 0;
const vite = await createServer({
  appType: "custom", configFile: false, root,
  resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false, ws: false },
  plugins: [{
    name: "security-test-boundaries", enforce: "pre",
    resolveId(id) {
      if (/\/lib\/auth(?:\.ts)?$/.test(id)) return "\0test-auth";
      if (/\/db(?:\/index\.ts)?$/.test(id)) return "\0test-db";
      if (id === "server-only") return "\0server-only";
    },
    load(id) {
      if (id === "\0server-only") return "export {}";
      if (id === "\0test-db") return `
        export function getDb() { globalThis.__comnetDbCalls++; throw new Error("Database access before authorization"); }
        export async function withWriteTransaction(work) { return work(); }
      `;
      if (id === "\0test-auth") return `
        export * from "/lib/access.ts";
        export * from "/lib/password.ts";
        import { canAccessCompany, hasPermission, isAdministrator } from "/lib/access.ts";
        export async function requireApiUser(request, permission = false) {
          const user = globalThis.__comnetTestUser;
          if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
          if (permission === true && !isAdministrator(user) || typeof permission === "string" && !hasPermission(user, permission)) return Response.json({ error: "Forbidden" }, { status: 403 });
          return user;
        }
        export async function requireCompanyAccess(request, companyId, permission) {
          const user = await requireApiUser(request, permission);
          if (user instanceof Response) return user;
          return canAccessCompany(user, companyId) ? user : Response.json({ error: "Forbidden" }, { status: 403 });
        }
      `;
    },
  }],
});
after(async () => { await vite.close(); delete globalThis.__comnetTestUser; delete globalThis.__comnetDbCalls; });

const access = await vite.ssrLoadModule("/lib/access.ts");
const api = await vite.ssrLoadModule("/lib/api.ts");
const request = (method, body, url = "https://app.test/api/records?companyId=2&kind=items") => new Request(url, {
  method, headers: { origin: "https://app.test", "content-type": "application/json" },
  ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) }),
});

test("company membership denies other companies and invalid IDs even for global admins", () => {
  assert.equal(access.canAccessCompany(user, 1), true);
  assert.equal(access.canAccessCompany(user, 2), false);
  assert.equal(access.canAccessCompany({ ...user, role: "all_admin" }, 2), true);
  for (const id of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(access.canAccessCompany({ ...user, role: "all_admin" }, id), false);
});

test("origin validation rejects scheme mismatch and forged forwarding headers", () => {
  const old = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  try {
    assert.equal(access.sameOrigin(request("POST", {})), true);
    for (const origin of ["http://app.test", "https://attacker.test", "null"]) {
      assert.equal(access.sameOrigin(new Request("https://app.test/api", { headers: { origin, "x-forwarded-host": "attacker.test" } })), false);
    }
  } finally { if (old === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = old; }
});

for (const name of ["records", "reports", "journal-entries", "admin-settings", "memorised-reports", "exchange-rates", "vat-management", "company-setup", "vat-codes", "item-logistics", "inventory-check-reports", "attachments"]) {
  test(`${name}: every handler rejects an unassigned company before querying it`, async () => {
    const routes = await vite.ssrLoadModule(`/app/api/${name}/route.ts`);
    const before = globalThis.__comnetDbCalls;
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      if (!routes[method]) continue;
      const response = await routes[method](request(method, { companyId: 2, id: 1, kind: "items", type: "invoice" }));
      assert.equal(response.status, 403, `${name} ${method}: ${await response.text()}`);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
    assert.equal(globalThis.__comnetDbCalls, before);
  });
}

test("company administrators cannot manage global identities or SMTP settings", async () => {
  for (const name of ["admin-users", "email-settings"]) {
    const routes = await vite.ssrLoadModule(`/app/api/${name}/route.ts`);
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      if (routes[method]) assert.equal((await routes[method](request(method, {}))).status, 403);
    }
  }
});

test("API rejects malformed/non-object/oversized JSON and hides internal errors", async () => {
  const handler = api.apiRoute(async () => Response.json({ ok: true }), { public: true, maxBytes: 16 });
  for (const [body, status] of [["{", 400], ["null", 400], ["[]", 400], ['{"data":"01234567890123456789"}', 413]]) {
    const req = new Request("https://app.test/api", { method: "POST", headers: { origin: "https://app.test", "content-type": "application/json", "content-length": "1" }, body });
    assert.equal((await handler(req)).status, status);
  }
  const secret = "postgres://user:secret@internal/database";
  for (const work of [async () => { throw new Error(secret); }, async () => Response.json({ error: secret }, { status: 500 })]) {
    const response = await api.apiRoute(work, { public: true })(request("GET"));
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /postgres|secret|internal/);
  }
});

test("password and PIN verifiers reject malformed hashes and excessive work factors", async () => {
  const password = await vite.ssrLoadModule("/lib/password.ts");
  const pin = await vite.ssrLoadModule("/lib/admin-pin.ts");
  const hash = await password.hashPassword("correct password");
  assert.equal(await password.verifyPassword("correct password", hash), true);
  assert.equal(await password.verifyPassword("wrong password", hash), false);
  for (const malformed of ["scrypt$16384$8$1$aa$zz", hash.replace("16384", "1073741824"), `${hash}$extra`, ""]) assert.equal(await password.verifyPassword("correct password", malformed), false);
  const pinHash = await pin.hashAdminPin("123456");
  assert.equal(await pin.verifyAdminPin("123456", pinHash), true);
  assert.equal(await pin.verifyAdminPin("654321", pinHash), false);
  assert.equal(await pin.verifyAdminPin("123456", pinHash.replace("120000", "999999999")), false);
  assert.equal(await pin.verifyAdminPin("123456", "pbkdf2$120000$YQ==$!!!!"), false);
});

test("attachments validate actual bytes, MIME agreement, and active content", async () => {
  const { parseAttachment } = await vite.ssrLoadModule("/lib/attachments.ts");
  const file = { fileName: "example.txt", mimeType: "text/plain", fileData: "data:text/plain;base64,aGVsbG8=", fileSize: 5 };
  assert.deepEqual(parseAttachment(file), file);
  for (const change of [{ fileSize: 1 }, { fileData: "data:text/html;base64,aGVsbG8=" }, { mimeType: "image/svg+xml" }, { fileData: "data:text/plain;base64,!!!!" }, { fileName: "a\r\nb" }]) assert.equal(parseAttachment({ ...file, ...change }), null);
});

test("exports escape markup and neutralize spreadsheet formulas", async () => {
  const { csvCell, escapeHtml } = await vite.ssrLoadModule("/lib/export.ts");
  for (const value of ["=1+1", "+cmd", "-cmd", "@SUM(1)", "\t=cmd", " \r=cmd"]) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(escapeHtml('</title><script>"x"</script>'), "&lt;/title&gt;&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
});

test("date validation rejects normalized impossible dates", async () => {
  const { isIsoDate } = await vite.ssrLoadModule("/lib/validation.ts");
  assert.equal(isIsoDate("2024-02-29"), true);
  for (const date of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-1-1", "bad"]) assert.equal(isIsoDate(date), false);
});
