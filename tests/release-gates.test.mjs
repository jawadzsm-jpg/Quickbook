import test from "node:test";
import assert from "node:assert/strict";
import { requireCI, requireSuccessfulJobs, selectRun } from "../scripts/require-ci.mjs";
import { requireCleanSarif } from "../scripts/check-codeql.mjs";

const sha = "a".repeat(40);
const run = { id: 10, head_sha: sha, head_branch: "main", event: "push",
  path: ".github/workflows/ci-cd.yml", repository: { full_name: "jawadzsm-jpg/Quickbook" },
  status: "completed", conclusion: "success", run_attempt: 1 };
const jobs = ["Full source validation", "CodeQL security analysis"].map((name) =>
  ({ name, status: "completed", conclusion: "success" }));
const env = { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: sha, VERCEL_GIT_COMMIT_REF: "main" };
const response = (data) => ({ ok: true, json: async () => data });

test("only the matching repository, workflow, branch, event and SHA qualify", () => {
  for (const changes of [{ head_sha: "b".repeat(40) }, { head_branch: "other" },
    { event: "pull_request" }, { path: "other.yml" }, { repository: { full_name: "other/repo" } }]) {
    assert.equal(selectRun([{ ...run, ...changes }], sha, "main"), undefined);
  }
  assert.equal(selectRun([run, { ...run, id: 11 }], sha, "main").id, 11);
});
test("missing, failed or skipped jobs block release", () => {
  requireSuccessfulJobs(jobs);
  assert.throws(() => requireSuccessfulJobs([]));
  for (const conclusion of ["failure", "cancelled", "skipped", "neutral", null]) {
    assert.throws(() => requireSuccessfulJobs([jobs[0], { ...jobs[1], conclusion }]));
  }
});
test("hosted builds without commit metadata are blocked", async () => {
  await assert.rejects(requireCI({ VERCEL: "1" }));
});
test("matching clean run allows release", async () => {
  await requireCI(env, async (url) => response(url.includes("/jobs?") ? { jobs } : { workflow_runs: [run] }));
});
test("API errors and failed workflows block release", async () => {
  await assert.rejects(requireCI(env, async () => ({ ok: false, status: 403 })));
  await assert.rejects(requireCI(env, async () => response({ workflow_runs: [{ ...run, conclusion: "failure" }] })));
});
test("pending workflows time out without deploying", async () => {
  await assert.rejects(requireCI(env, async () => response({ workflow_runs: [] }), async () => {}), /did not finish/);
});
test("CodeQL fails closed on findings or missing results", () => {
  const report = { version: "2.1.0", runs: [{ tool: { driver: { name: "CodeQL" } }, results: [] }] };
  requireCleanSarif([report]);
  assert.throws(() => requireCleanSarif([]));
  assert.throws(() => requireCleanSarif([{}]));
  report.runs[0].results.push({ ruleId: "js/test" });
  assert.throws(() => requireCleanSarif([report]));
});
