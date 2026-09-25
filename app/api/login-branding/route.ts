import { publicLoginBranding } from "@/lib/public-login-branding";

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("companyId"));
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
  try {
    const branding = await publicLoginBranding(id);
    if (!branding) return Response.json({ error: "Company not available." }, { status: 404 });
    return Response.json({ branding }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not load company login details." }, { status: 503 });
  }
}
