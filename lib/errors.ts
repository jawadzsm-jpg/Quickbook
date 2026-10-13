export class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function databaseErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : undefined;
  }
}

export function failureResponse(error: unknown, requestId: string, path: string) {
  if (error instanceof RequestError) return Response.json({ error: error.message, requestId }, { status: error.status });
  const code = databaseErrorCode(error);
  const conflict = ["40001", "40P01", "23505", "23503"].includes(code ?? "");
  // Codes and correlation IDs are useful for operations; messages/SQL can contain secrets.
  console.error(JSON.stringify({ event: "api_request_failed", requestId, path, code: code ?? "unknown" }));
  return Response.json({ error: conflict ? "The data changed, already exists, or is still in use. Refresh and try again." : "The request could not be completed. Please try again.", requestId }, { status: conflict ? 409 : 500 });
}

const internalText = /Failed query:|\bparams:|violates (?:unique|foreign key|check|not-null) constraint|relation "[^"]+" does not exist|column "[^"]+" (?:of relation "[^"]+" )?does not exist|syntax error at or near|out of range for type|invalid input syntax for type|duplicate key value|deadlock detected|could not serialize access|connection (?:terminated|refused)|ECONNRESET|NeonDbError/i;

/** Database and driver errors carry SQL text, parameters and schema names; they must never reach a browser. */
export function isInternalError(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { name?: unknown; message?: unknown; severity?: unknown; routine?: unknown };
    if (record.name === "DrizzleQueryError" || typeof record.severity === "string" || typeof record.routine === "string") return true;
    if (typeof record.message === "string" && internalText.test(record.message)) return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return typeof error === "string" && internalText.test(error);
}

/**
 * The message safe to show for a caught error: validation and business messages as written; database/driver errors
 * replaced by `fallback` (a conflict gets a "refresh and try again" message) and logged by SQLSTATE code only.
 */
export function publicErrorMessage(error: unknown, fallback: string) {
  if (error instanceof RequestError) return error.message;
  if (!isInternalError(error)) return error instanceof Error && error.message ? error.message : fallback;
  const code = databaseErrorCode(error);
  console.error(JSON.stringify({ event: "internal_error_hidden", code: code ?? "unknown" }));
  if (code === "23505") return "This already exists. Refresh and check the existing record.";
  if (["40001", "40P01", "23503"].includes(code ?? "")) return "The data changed or is still in use. Refresh and try again.";
  return fallback;
}
