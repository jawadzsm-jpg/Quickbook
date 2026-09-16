import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const repository = "jawadzsm-jpg/Quickbook";
const repositoryId = "1359351844";
const workflowPath = ".github/workflows/ci-cd.yml";
const requiredJobs = ["Full source validation", "CodeQL security analysis"];

export function selectRun(runs, sha, branch) {
  if (!Array.isArray(runs)) throw new Error("GitHub returned no workflow run list.");
  return runs.filter((run) => run.head_sha === sha && run.head_branch === branch &&
    run.event === "push" && run.path === workflowPath &&
    run.repository?.full_name === repository)
    .sort((a, b) => b.id - a.id)[0];
}

export function requireSuccessfulJobs(jobs) {
  if (!Array.isArray(jobs)) throw new Error("GitHub returned no job list.");
  for (const name of requiredJobs) {
    const job = jobs.find((entry) => entry.name === name);
    if (!job || job.status !== "completed" || job.conclusion !== "success") {
      throw new Error(`Required check did not succeed: ${name}`);
    }
  }
}

export function runLocalReleaseChecks(env = process.env) {
  const checks = [
    ["npm", ["run", "lint"]],
    ["npm", ["test"]],
    ["npm", ["run", "typecheck"]],
  ];
  for (const [command, args] of checks) {
    const result = spawnSync(command, args, { stdio: "inherit", env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Local release check failed: ${command} ${args.join(" ")}`);
    }
  }
  console.log("Local release checks passed for private-repository deployment.");
}

export async function requireCI(env = process.env, fetcher = fetch, sleep = delay, localCheck = runLocalReleaseChecks) {
  // Local development/CI uses build:ci. Hosted builds must verify the source before continuing.
  if (env.VERCEL !== "1" && env.VERCEL_ENV !== "production") return;
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const branch = env.VERCEL_GIT_COMMIT_REF;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "") || !branch) {
    throw new Error("Deployment requires Vercel Git commit metadata; manual unverified builds are blocked.");
  }

  const token = env.CI_GITHUB_TOKEN || env.GITHUB_TOKEN;
  const api = `https://api.github.com/repos/${repository}`;
  async function get(path) {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "Quickbook-CI-Gate",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(`${api}${path}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = new Error(`Cannot verify CI (GitHub HTTP ${response.status}). Deployment blocked.`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  for (let attempt = 0; attempt < 26; attempt++) {
    let result;
    try {
      result = await get(`/actions/workflows/ci-cd.yml/runs?head_sha=${sha}&event=push&per_page=100`);
    } catch (error) {
      const isLinkedPrivateRepo = String(env.VERCEL_GIT_REPO_ID ?? "") === repositoryId;
      if (error?.status === 404 && !token && isLinkedPrivateRepo) {
        console.warn("Private GitHub repository is not visible to the anonymous GitHub API; running local release checks for the linked repository instead.");
        localCheck(env);
        return;
      }
      throw error;
    }

    const run = selectRun(result.workflow_runs, sha, branch);
    if (run?.status === "completed") {
      if (run.conclusion !== "success") throw new Error(`CI ${run.conclusion}: ${run.html_url}. Deployment blocked.`);
      const jobs = await get(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
      requireSuccessfulJobs(jobs.jobs);
      console.log(`CI and CodeQL passed for ${sha}: ${run.html_url}`);
      return;
    }
    console.log(`Waiting for CI and CodeQL for ${sha} (${attempt + 1}/26).`);
    if (attempt < 25) await sleep(30000);
  }
  throw new Error("CI did not finish within 13 minutes. Deployment blocked; redeploy after checks succeed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await requireCI();
}
