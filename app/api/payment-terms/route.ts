import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { specificationOptions } from "../../../db/schema";
import { requireApiUser } from "@/lib/auth";
import { normalizeComparableText } from "@/lib/text-normalization";

const PAYMENT_TERMS_SCOPE = "__payment_terms__";
const defaults = ["Due on receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Advance payment", "50% advance · 50% on delivery"];

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

async function rows() {
  return getDb().select({ value: specificationOptions.value, active: specificationOptions.active })
    .from(specificationOptions)
    .where(eq(specificationOptions.label, PAYMENT_TERMS_SCOPE))
    .orderBy(asc(specificationOptions.value));
}

async function save(value: string, active: boolean) {
  await getDb().insert(specificationOptions).values({ label: PAYMENT_TERMS_SCOPE, value, active }).onConflictDoUpdate({
    target: [specificationOptions.label, specificationOptions.value],
    set: { active },
  });
}

export async function GET(request: Request) {
  const user = await requireApiUser(request, "sales:write");
  if (user instanceof Response) return user;
  try {
    const stored = await rows();
    const disabled = new Set(stored.filter((row) => !row.active).map((row) => normalizeComparableText(row.value)));
    const terms = [...defaults, ...stored.filter((row) => row.active).map((row) => row.value)]
      .filter((value, index, list) => !disabled.has(normalizeComparableText(value)) && list.findIndex((candidate) => normalizeComparableText(candidate) === normalizeComparableText(value)) === index);
    return Response.json({ terms });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load payment terms." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireApiUser(request, "sales:write", true);
  if (user instanceof Response) return user;
  try {
    const value = clean((await request.json()).value);
    if (!value || value.length > 200) return Response.json({ error: "Enter payment terms up to 200 characters." }, { status: 400 });
    const existing = (await rows()).find((row) => normalizeComparableText(row.value) === normalizeComparableText(value));
    if (existing?.active || defaults.some((term) => normalizeComparableText(term) === normalizeComparableText(value)) && !existing) return Response.json({ error: "These payment terms already exist." }, { status: 409 });
    await save(existing?.value ?? value, true);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add payment terms." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, "sales:write", true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json();
    const oldValue = clean(payload.oldValue);
    const newValue = clean(payload.newValue);
    if (!oldValue || !newValue || newValue.length > 200) return Response.json({ error: "Enter valid payment terms up to 200 characters." }, { status: 400 });
    const all = [...defaults, ...(await rows()).map((row) => row.value)];
    if (normalizeComparableText(oldValue) !== normalizeComparableText(newValue) && all.some((term) => normalizeComparableText(term) === normalizeComparableText(newValue))) return Response.json({ error: "These payment terms already exist." }, { status: 409 });
    await save(oldValue, false);
    await save(newValue, true);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not rename payment terms." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireApiUser(request, "sales:write", true);
  if (user instanceof Response) return user;
  try {
    const value = clean((await request.json()).value);
    if (!value) return Response.json({ error: "Select payment terms to remove." }, { status: 400 });
    await save(value, false);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove payment terms." }, { status: 500 });
  }
}
