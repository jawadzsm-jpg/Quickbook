import { idempotentWrite } from "./idempotency";
import { randomUUID } from "node:crypto";
import { RequestError, failureResponse } from "./errors";
export { RequestError } from "./errors";
import { canAccessCompany, requireApiUser, sameOrigin, type SessionUser } from "@/lib/auth";
import { withWriteTransaction } from "@/db";

type Handler = (request: Request) => Promise<Response>;
type Options = { public?: boolean; transaction?: boolean; maxBytes?: number; allowEmptyBody?: boolean };

export async function readJsonBody(request: Request, maxBytes: number) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new RequestError("Use application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("A JSON object is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    for (const field of ["lines", "records", "attachments"]) {
      if (field in value) {
        const entries = (value as Record<string, unknown>)[field];
        if (!Array.isArray(entries) || entries.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) throw new Error();
      }
    }
    return value;
  } catch { throw new RequestError("A valid JSON object is required."); }
}

/** Bound parsing, authenticate before large bodies, and keep internal errors private. */
export function apiRoute(handler: Handler, options: Options = {}): Handler {
  return async (request) => {
    let response: Response;
    const requestId = randomUUID();
    try {
      const mutating = !["GET", "HEAD"].includes(request.method);
      if (mutating && !sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
      let authenticatedUser: SessionUser | undefined;
      if (!options.public) {
        const user = await requireApiUser(request);
        if (user instanceof Response) return privateResponse(user);
        authenticatedUser = user;
        const company = new URL(request.url).searchParams.get("companyId");
        if (company !== null && !canAccessCompany(user, Number(company))) throw new RequestError("You do not have access to this company.", 403);
      }
      if (mutating && !request.body && !options.allowEmptyBody) throw new RequestError("A JSON object is required.");
      if (mutating && request.body) {
        const payload = await readJsonBody(request, options.maxBytes ?? 2_000_000);
        if (authenticatedUser && "companyId" in payload && !canAccessCompany(authenticatedUser, Number(payload.companyId))) throw new RequestError("You do not have access to this company.", 403);
        // Keep request identity so the authentication lookup can be reused.
        request.json = async () => payload;
      }
      const work = () => handler(request);
      response = options.transaction && mutating
        ? await withWriteTransaction(() => authenticatedUser && request.method === "POST" ? idempotentWrite(request, authenticatedUser.id, work) : work())
        : await handler(request);
      if (response.status >= 500) response = failureResponse(new Error("Handler failure"), requestId, new URL(request.url).pathname);
    } catch (error) {
      response = failureResponse(error, requestId, new URL(request.url).pathname);
    }
    response.headers.set("X-Request-Id", requestId);
    return privateResponse(response);
  };
}

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
