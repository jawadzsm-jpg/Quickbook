import { openApiDocument } from "@/lib/openapi";
import { appBaseUrl } from "@/lib/app-url";

/** GET /api/v1/openapi.json — public API description for developers and tools such as Postman. */
export async function GET(request: Request) {
  const serverUrl = (appBaseUrl(request)).replace(/\/$/, "");
  return Response.json(openApiDocument(serverUrl), { headers: { "Cache-Control": "public, max-age=300" } });
}
