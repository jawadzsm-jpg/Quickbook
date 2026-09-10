# CI and production deployment

GitHub Actions scans on every push, PR to main, weekly, and manual dispatch. Jobs lint the full source, test release gates, type-check, compile without database credentials, and run CodeQL security-extended analysis across JavaScript/TypeScript. CodeQL findings fail the job, rather than merely being uploaded as alerts.

Vercel Git auto-deployment remains enabled. Its build command waits for a successful push workflow for the exact deployed SHA, branch and repository, and independently verifies both required jobs succeeded. Missing/failed/skipped results, API errors, or a 13-minute timeout block the build before migrations. The existing production deployment stays live if a new build fails. If CI finishes after the timeout, redeploy that same commit after checks succeed.

This uses GitHub's public-repository read API without credentials. If the repository becomes private, configure authenticated read access before deploying; do not remove the gate. GitHub API rate limits also fail closed.

## Local validation

`npm ci --ignore-scripts` followed by `npm run ci`.

`npm run build:ci` never runs migrations. Hosted `npm run build` requires verified CI before running the existing migration/build sequence. Deployment credentials are not needed in GitHub Actions.

## Administrative protections

Repository owners should require **Full source validation** and **CodeQL security analysis** in main branch protection, require PR review, and disallow bypass. Restrict Vercel settings/manual deployment permissions to trusted maintainers. These account-level protections are not configured by a source commit; an administrator who can change the workflow or build settings can bypass a source-level gate.

Automation is not proof that every line is defect-free. No application-wide functional, browser, or migration integration test suite is included yet; the tests here specifically cover release-gate behavior. CodeQL analyzes supported languages, not SQL correctness or every business rule. Add company isolation, permissions, invoice calculations and migration tests as the next coverage layer.
