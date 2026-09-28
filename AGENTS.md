<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository documentation first

Before doing a repository-wide analysis, read these maintained files in order:

1. `README.md`
2. `docs/README.md`
3. `docs/CODEBASE-MAP.md`
4. The task-relevant files among `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/FEATURES.md`, and `docs/WORKFLOWS.md`

Use `docs/CODEBASE-MAP.md` to choose the narrow source area to inspect. The files `docs/codebase-review.md`, `docs/financial-report-audit.md`, and `docs/runtime-review.md` are historical audit snapshots, not current specifications.

When code behavior changes, update the affected canonical document in the same change. If code and documentation conflict, verify the implementation, then correct the documentation so future work does not require another full-codebase scan.
