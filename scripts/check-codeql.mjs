import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function requireCleanSarif(reports) {
  if (!reports.length) throw new Error("CodeQL produced no SARIF reports.");
  let findings = 0;
  for (const report of reports) {
    if (report.version !== "2.1.0" || !Array.isArray(report.runs) || !report.runs.length) {
      throw new Error("Invalid CodeQL SARIF report.");
    }
    for (const run of report.runs) {
      if (run.tool?.driver?.name !== "CodeQL" || !Array.isArray(run.results)) {
        throw new Error("Missing CodeQL results.");
      }
      if (run.invocations?.some((invocation) => invocation.executionSuccessful === false)) {
        throw new Error("CodeQL analysis failed.");
      }
      for (const result of run.results) {
        // CodeQL retains source-suppressed results in SARIF. Respect only explicit
        // in-source suppressions; every other result must continue to fail closed.
        if (result.suppressions?.some((suppression) => suppression.kind === "inSource")) continue;
        findings += 1;
        const location = result.locations?.[0]?.physicalLocation;
        console.error(JSON.stringify({
          rule: result.ruleId,
          file: location?.artifactLocation?.uri,
          line: location?.region?.startLine,
          message: result.message?.text,
        }));
      }
    }
  }
  if (findings) throw new Error(`CodeQL reported ${findings} finding(s). Resolve them before production deployment.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2] ?? "codeql-results";
  const reports = readdirSync(directory).filter((name) => name.endsWith(".sarif"))
    .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")));
  requireCleanSarif(reports);
  console.log("CodeQL reports contain no unsuppressed findings.");
}
