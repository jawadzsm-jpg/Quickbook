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
