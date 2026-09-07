import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { specificationOptions } from "../../../db/schema";
import { specificationFields, specificationPresets } from "@/lib/specification-presets";

type OptionPayload = { type?: unknown; label?: unknown; value?: unknown; oldValue?: unknown; newValue?: unknown };
const LABEL_SCOPE = "__specification_detail_names__";
const CATEGORY_SCOPE = "__item_categories__";
const defaultCategories = ["Laptop", "Desktop", "All-in-One", "Monitor", "Printer", "Networking", "Storage", "Accessory"];

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
    const labels = [...specificationFields] as string[];
    const disabledLabels: string[] = [];
    const categories = [...defaultCategories];
    const disabledCategories: string[] = [];
    for (const row of rows) {
      if (row.label === CATEGORY_SCOPE) {
        if (row.active && !categories.includes(row.value)) categories.push(row.value);
        if (!row.active) {
          const index = categories.indexOf(row.value);
          if (index >= 0) categories.splice(index, 1);
          disabledCategories.push(row.value);
        }
        continue;
      }
      if (row.label === LABEL_SCOPE) {
        if (row.active && !labels.includes(row.value)) labels.push(row.value);
        if (!row.active) {
          const index = labels.indexOf(row.value);
          if (index >= 0) labels.splice(index, 1);
          disabledLabels.push(row.value);
        }
        continue;
      }
      options[row.label] ??= [];
      if (row.active) {
        if (!options[row.label].includes(row.value)) options[row.label].push(row.value);
      } else {
        options[row.label] = options[row.label].filter((value) => value !== row.value);
        (disabled[row.label] ??= []).push(row.value);
      }
    }
    return Response.json({ options, disabled, labels, disabledLabels, categories, disabledCategories });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load specification choices." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as OptionPayload;
    const label = payload.type === "label" ? LABEL_SCOPE : payload.type === "category" ? CATEGORY_SCOPE : text(payload.label);
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
    const isLabel = payload.type === "label";
    const label = isLabel ? LABEL_SCOPE : payload.type === "category" ? CATEGORY_SCOPE : text(payload.label);
    const oldValue = text(payload.oldValue);
    const newValue = text(payload.newValue);
    if (!label || !oldValue || !newValue) return Response.json({ error: "Detail, old value and new value are required." }, { status: 400 });
    if (oldValue !== newValue) await setOption(label, oldValue, false);
    await setOption(label, newValue, true);
    if (isLabel && oldValue !== newValue) {
      const rows = await getDb().select().from(specificationOptions).orderBy(asc(specificationOptions.value));
      const activeValues = new Set(specificationPresets[oldValue] ?? []);
      for (const row of rows) {
        if (row.label !== oldValue) continue;
        if (row.active) activeValues.add(row.value);
        else activeValues.delete(row.value);
      }
      for (const option of activeValues) await setOption(newValue, option, true);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not rename the choice." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as OptionPayload;
    const label = payload.type === "label" ? LABEL_SCOPE : payload.type === "category" ? CATEGORY_SCOPE : text(payload.label);
    const value = text(payload.value);
    if (!label || !value) return Response.json({ error: "Detail and value are required." }, { status: 400 });
    await setOption(label, value, false);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove the choice." }, { status: 500 });
  }
}
