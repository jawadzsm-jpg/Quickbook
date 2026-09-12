import { randomUUID } from "node:crypto";
import { requireApiUser } from "@/lib/auth";
import { withWriteTransaction } from "@/db";
import { readJsonBody } from "@/lib/api";
import { RequestError, failureResponse } from "@/lib/errors";
import { releaseOtherSkus, releaseSkus, reserveSkus, skuKeys, type LockInput } from "@/lib/sku-locks";

async function handle(request: Request) {
  try {
    const user = await requireApiUser(request, false, true);
    if (user instanceof Response) return user;
    if (user.role === "viewer") throw new RequestError("Read-only users cannot reserve inventory.", 403);
    const payload = await readJsonBody(request, 200_000) as { token: string; input: LockInput; renew?: boolean };
    if (!/^[a-f0-9-]{36}$/i.test(payload.token ?? "")) throw new RequestError("Invalid reservation token.");
    return await withWriteTransaction(async () => {
      if (request.method === "DELETE") await releaseSkus(user.id, payload.token);
      else {
        const keys = await skuKeys(payload.input, user);
        await reserveSkus(keys, user.id, payload.token, payload.renew === true);
        if (!payload.renew) await releaseOtherSkus(keys, user.id, payload.token);
      }
      return Response.json({ ok: true, expiresInSeconds: 120 }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { return failureResponse(error, randomUUID(), "/api/sku-locks"); }
}
export const POST = handle;
export const DELETE = handle;
