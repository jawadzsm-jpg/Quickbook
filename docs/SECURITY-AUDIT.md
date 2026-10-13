# Security audit (October 2026)

A full review of the codebase against a 31-point security checklist, with the fixes made in the same change. Every finding was traced in the code before it was fixed. Regression tests: the "security: sign-in limits…" test and the two-step, delivery and isolation tests in `tests/transaction-context.test.mjs`.

Verdicts:
- **PASS:** checked and secure, with or without fixes.
- **PARTIAL:** improved, but something is left open.
- **OPEN:** a deliberate follow-up, with the reason given.

## Checklist

| # | Item | Verdict | What was found and done |
|---|---|---|---|
| 1 | SQL injection | PASS | Every query uses Drizzle's parameterized `sql` template or the query builder. There is no `sql.raw`. `sql.identifier` takes only hard-coded table names. No ORDER BY or column name comes from the request. |
| 2 | Cross-site scripting | PASS | React escapes output. The only stored HTML (letterhead text) is sanitized on write with an allowlist. Print popups escape every value. **Fixed:** three CSV exports did not neutralise spreadsheet formulas (`=HYPERLINK(...)` in a product name); they now use `csvCell`. |
| 3 | CSRF protection | PASS | The session cookie is `HttpOnly; Secure; SameSite=Strict`. Every write route checks the request Origin. **Fixed:** the shared-items POST was missing the Origin check. |
| 4 | File upload validation | PASS | Attachments use a type allowlist (no HTML/SVG), a 3 MB limit, strict base64 and download-only serving with `nosniff`. Document emails check the PDF's magic bytes. **Fixed:** logo/stamp checks were not anchored and the stamp accepted SVG; they are now strict PNG/JPEG/WebP, and the screen converts any stamp image to PNG. The attachment upload body is capped before parsing. |
| 5 | Broken object-level authorization | PASS | **Fixed:** an Administrator of one company could change another company's exchange rates. Memorised reports had no company check. New items and documents could reference another company's inventory. Inventory-check reports showed other companies' stock to readers outside those companies. |
| 6 | Rate limiting | PASS | **Fixed:** the sign-in limiter existed but was never called. It now covers sign-in (overall, per email, per IP), with an atomic lockout counter that parallel guesses cannot defeat. Also added: limits on password changes, Admin PIN guesses (per user and per company), password-reset requests per IP, and test, login and document emails. The public API was already limited per key. |
| 7 | JWT security | PASS | JWTs are used only for the backup/notification worker (GitHub OIDC). It checks RS256 only, issuer, audience, max age, required claims and pinned repository/workflow, and is production only. Sessions are opaque random tokens stored as SHA-256 digests. |
| 8 | API secrets server-side | PASS | Secret-using modules import `server-only`; this change also adds it to `db/index.ts` and `lib/company-backups.ts`. The only `NEXT_PUBLIC_` variable is the app URL. The SMTP password is never returned to the browser. **Improved:** secrets use `SMTP_ENCRYPTION_KEY` when set, separate from the database credential (see open items). |
| 9 | Password hashing | PASS | Salted scrypt with a timing-safe compare. **Fixed:** there were two implementations, one blocking the server and with no length limit. There is now one asynchronous implementation with a 128-character limit. |
| 10 | Multi-factor authentication | PASS | **Added:** optional two-step sign-in with an authenticator app (TOTP, RFC 6238), replay-protected codes and 10 one-time backup codes. Keys are encrypted at rest. Administrators can reset it for a user. |
| 11 | CORS | PASS | No `Access-Control-Allow-*` headers anywhere. The integration API is server-to-server. |
| 12 | Auth tokens in local storage | PASS | Only UI conveniences are stored in the browser. The session lives in an HttpOnly cookie. |
| 13 | Server-side permissions | PASS | Every route checks role or permission on the server. **Fixed:** the VAT code detail listed every document to sales and inventory users (now accounting roles only). Employee files (passport/ID scans) were readable by every role (now Administrators only). Document attachments now follow the document's visibility for every role. |
| 14 | Row-level security | OPEN | Tenant isolation is enforced in the application layer: every query filters by an authorized company, and the gaps found were fixed. PostgreSQL row-level security would touch every table and query. It is a separate, separately tested project: per-transaction `set_config('app.company_ids', …)` plus policies on the core tables. |
| 15 | Webhook signatures | PASS | There are no third-party webhooks. The scheduled-job endpoints verify GitHub OIDC tokens (see 7). |
| 16 | SSRF | PASS | Server requests go only to fixed hosts (turboSMTP, GitHub). **Fixed:** the admin-set SMTP host now has to be a public address on a mail port, so it cannot probe the private network or cloud metadata. |
| 17 | Exposed source maps | PASS | Browser source maps are off (`productionBrowserSourceMaps: false`). The live `.map` request returns 403. |
| 18 | Sensitive data in logs | PASS | **Fixed:** the add-user and password-reset logs printed full error objects, which could contain email addresses or SMTP responses. Logs now record event names and error codes only. |
| 19 | Vulnerable dependencies | PASS (production) | **Fixed:** `next` 16.2.6 → 16.4.0 (critical advisories) and `nodemailer` → 10.1.0 (high). The `uuid` used by `exceljs` is pinned to 11.1.1 by an override. Five unused packages were removed. `npm audit --omit=dev`: **0 vulnerabilities**. The remaining advisories are only in development tooling (see open items). |

| # | Additional check | Verdict | Notes |
|---|---|---|---|
| A1 | Exposed environment variables | PASS | Only `NEXT_PUBLIC_APP_URL` reaches the browser. `.env.example` has no values. **Fixed:** emailed links used the request Host header when `NEXT_PUBLIC_APP_URL` was unset; they now use configuration only (`lib/app-url.ts`). |
| A2 | Admin routes | PASS | User, settings, backup, email, API-key, edition and company-setup routes check Administrator / All-Admin and company scope. |
| A3 | Authentication mechanism | PASS | **Fixed (critical):** accounts without a password could sign in with *any company's* Admin PIN. The seeded `admin@comnet.local` row (migration 0014) was such an account. The path is removed and migration 0124 deactivates passwordless accounts. Also: sign-in answers unknown emails, wrong passwords and locked accounts identically and in the same time; reset emails are sent after the response. |
| A4 | Access control | PASS | See 5 and 13. **Also fixed:** the online-users list showed users of every company. It now shows only colleagues who share a company, plus All-Admins. |
| A5 | Form sanitization | PASS | Server-side validation everywhere. **Fixed:** new records now enforce text limits (as edits already did) and at most 1,000 lines. SMTP settings have length limits. |
| A6 | API endpoints | PASS | Authentication, Origin, company and permission checks on all 66 route files. |
| A7 | Security headers | PARTIAL | **Added:** HSTS (2 years, preload), Cross-Origin-Opener-Policy, `object-src 'none'`, DNS-prefetch off. Removed `X-Powered-By`. **Open:** a `script-src` CSP needs per-request nonces for Next.js inline scripts; this is a separate change. |
| A8 | Debug mode / verbose errors | PASS | **Fixed:** 28 route files returned raw database errors to the browser, including SQL text, parameters and schema names (for example `?locationId=9999999999`). `publicErrorMessage` now replaces them with the route's message and logs only the SQLSTATE code. The local database mode is restricted to development. |
| A9 | Unused packages | PASS (runtime) | Removed `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@hookform/resolvers` and `date-fns`. See open items for the old "sites" toolchain. |
| A10 | Exposed files | PASS | `public/` holds only images and the favicon. No route serves files by path. `/.env` and `/.git` return 404. |
| A11 | Database | PASS | TLS connections (Neon). Credentials are server-only. The local database is guarded to development. Backups go to private Blob storage. See open items for least privilege. |
| A12 | Full audit | PASS | Five independent reviews (injection/XSS, sign-in/sessions, authorization, files/headers/secrets, dependencies); each finding was verified, then fixed or listed below. |

## Open items (owner decisions)

1. **Set `SMTP_ENCRYPTION_KEY` in Vercel production** (32+ random characters). Until it is set, encrypted secrets use a key derived from `DATABASE_URL`. Existing secrets stay readable after it is set and are re-encrypted the next time they are saved.
2. **Row-level security** (item 14): plan it as its own change, with tests per table.
3. **Content-Security-Policy `script-src` with nonces** (A7): add it through a `proxy.ts` nonce, after testing the print popups and the layout builder.
4. **Old "sites" build toolchain:** `vinext`, `wrangler`, `@cloudflare/vite-plugin`, `@vitejs/plugin-rsc`, `@vitejs/plugin-react`, `react-server-dom-webpack`, plus `scripts/build-verified.sh`, `install-ci.sh`, `sites-env.sh` and `.openai/hosting.json`. These are development-only but carry most of the remaining `npm audit` advisories. Remove them if that hosting is no longer used. `drizzle-kit` and `eslint-config-next` have advisories with no non-downgrade fix (development only).
5. **Database least privilege:** use a separate DML-only Neon role at runtime; keep the owner role for migrations.
6. **SMTP host DNS changes:** the private-address check runs when settings are saved. A name that later resolves to a private address is not re-checked at send time. Only an All-Admin can set the host.
