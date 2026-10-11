import { openApiDocument } from "@/lib/openapi";

/** GET /api/v1/openapi.json — public API description for developers and tools such as Postman. */
export async function GET(request: Request) {
  const serverUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  return Response.json(openApiDocument(serverUrl), { headers: { "Cache-Control": "public, max-age=300" } });
}
