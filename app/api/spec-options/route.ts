import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { specificationOptions } from "../../../db/schema";
import { specificationPresets } from "@/lib/specification-presets";

type OptionPayload = { label?: unknown; value?: unknown; oldValue?: unknown; newValue?: unknown };

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function setOption(label: string, value: string, active: boolean) {
  const db = getDb();
  await db.insert(specificationOptions).values({ label, value, active }).onConflictDoUpdate({
    target: [specificationOptions.label, specificationOptions.value],
    set: { active },
  });
}

export async function GET() {
  try {
    const rows = await getDb().select().from(specificationOptions).orderBy(asc(specificationOptions.label), asc(specificationOptions.value));
    const options: Record<string, string[]> = Object.fromEntries(Object.entries(specificationPresets).map(([label, values]) => [label, [...values]]));
    const disabled: Record<string, string[]> = {};
    for (const row of rows) {
      options[row.label] ??= [];
      if (row.active) {
        if (!options[row.label].includes(row.value)) options[row.label].push(row.value);
      } else {
        options[row.label] = options[row.label].filter((value) => value !== row.value);
        (disabled[row.label] ??= []).push(row.value);
      }
    }
    return Response.json({ options, disabled });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load specification choices." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as OptionPayload;
    const label = text(payload.label);
    const value = text(payload.value);
    if (!label || !value) return Response.json({ error: "Detail and value are required." }, { status: 400 });
    await setOption(label, value, true);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add the choice." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as OptionPayload;
    const label = text(payload.label);
    const oldValue = text(payload.oldValue);
    const newValue = text(payload.newValue);
    if (!label || !oldValue || !newValue) return Response.json({ error: "Detail, old value and new value are required." }, { status: 400 });
    if (oldValue !== newValue) await setOption(label, oldValue, false);
    await setOption(label, newValue, true);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not rename the choice." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as OptionPayload;
    const label = text(payload.label);
    const value = text(payload.value);
    if (!label || !value) return Response.json({ error: "Detail and value are required." }, { status: 400 });
    await setOption(label, value, false);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove the choice." }, { status: 500 });
  }
}
