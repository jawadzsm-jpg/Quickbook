# ComNet Enterprise Accounting

Next.js application with PostgreSQL, company-scoped access, inventory, invoicing, accounting and staff administration. Requires Node.js 22.13 or later.

## Run locally

```sh
npm ci
npm run dev:local
```

Open http://localhost:3000. The local launcher applies the SQL migrations to a persistent embedded PostgreSQL database and creates an administrator with a randomly generated password. Read the email and password from `.local-data/login.json`. The database and credentials are ignored by Git. This mode binds to loopback and is disabled in production. Stop with Ctrl+C; restart using the same command to retain data. Use `COMNET_LOCAL_DATA_DIR` for a separate local dataset and `PORT` to change the port. Only one process may use a dataset at a time.

## Use Neon PostgreSQL

Set `DATABASE_URL` and `NEXT_PUBLIC_APP_URL` in `.env.local`, then run `npm run db:migrate`. New installations without an active All-Admin can set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` and run `npm run admin:bootstrap`. Sign in and change the temporary password. Run `npm run dev` for development or `npm run build` followed by `npm start` for production. `build` checks the configured hosted release gate and applies migrations; `build:ci` builds without database access.

Migration `0033_request_safety.sql` is required for shared login limits and write retry protection. Back up and test against staging before applying migrations to an existing production database. The local mode does not validate Neon connectivity, production data, or outgoing email.

## Verification

```sh
npm run ci
npx playwright install chromium
npm run test:browser
```

The CI command runs lint, application/database/security/UI tests, type checking, production build, production HTTP smoke tests and the dependency audit. Browser tests start or reuse the local server on port 3000, exercise authenticated navigation and real accounting writes, and create local test fixtures. They use the default `.local-data` directory. GitHub Actions also runs Chromium browser tests and CodeQL.

Review findings and remaining limitations are in [the codebase review](docs/codebase-review.md) and [the runtime follow-up](docs/runtime-review.md).
