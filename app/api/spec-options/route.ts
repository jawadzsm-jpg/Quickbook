import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { specificationOptions } from "../../../db/schema";
import { specificationFields, specificationPresets } from "@/lib/specification-presets";
import { requireApiUser } from "@/lib/auth";
import { normalizeComparableText, uppercaseText } from "@/lib/text-normalization";

type OptionPayload = { type?: unknown; label?: unknown; value?: unknown; oldValue?: unknown; newValue?: unknown };
const LABEL_SCOPE = "__specification_detail_names__";
const CATEGORY_SCOPE = "__item_categories__";
const defaultCategories = ["LAPTOP", "DESKTOP", "ALL-IN-ONE", "MONITOR", "PRINTER", "NETWORKING", "STORAGE", "ACCESSORY"];

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

function includesComparable(values: string[], candidate: string) {
  const normalized = normalizeComparableText(candidate);
  return values.some((value) => normalizeComparableText(value) === normalized);
}

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "inventory:read");
  if (authorization instanceof Response) return authorization;
  try {
    const rows = await getDb().select().from(specificationOptions).orderBy(asc(specificationOptions.label), asc(specificationOptions.value));
    const options: Record<string, string[]> = Object.fromEntries(Object.entries(specificationPresets).map(([label, values]) => [label, [...new Set(values.map(uppercaseText))]]));
    const disabled: Record<string, string[]> = {};
    const labels = [...specificationFields] as string[];
    const disabledLabels: string[] = [];
    const categories = [...defaultCategories];
    const disabledCategories: string[] = [];
    for (const row of rows) {
      if (row.label === CATEGORY_SCOPE) {
        const value = uppercaseText(row.value);
        if (row.active && !includesComparable(categories, value)) categories.push(value);
        if (!row.active) {
          const index = categories.findIndex((category) => normalizeComparableText(category) === normalizeComparableText(value));
          if (index >= 0) categories.splice(index, 1);
          if (!includesComparable(disabledCategories, value)) disabledCategories.push(value);
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
      const value = uppercaseText(row.value);
      if (row.active) {
        if (!includesComparable(options[row.label], value)) options[row.label].push(value);
      } else {
        options[row.label] = options[row.label].filter((option) => normalizeComparableText(option) !== normalizeComparableText(value));
        if (!includesComparable((disabled[row.label] ??= []), value)) disabled[row.label].push(value);
      }
    }
    return Response.json({ options, disabled, labels, disabledLabels, categories, disabledCategories });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load specification choices." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await requireApiUser(request, "inventory:manage", true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as OptionPayload;
    const label = payload.type === "label" ? LABEL_SCOPE : payload.type === "category" ? CATEGORY_SCOPE : text(payload.label);
    const value = payload.type === "label" ? text(payload.value) : uppercaseText(payload.value);
    if (!label || !value) return Response.json({ error: "Detail and value are required." }, { status: 400 });
    const rows = await getDb().select({ value: specificationOptions.value, active: specificationOptions.active }).from(specificationOptions).where(eq(specificationOptions.label, label));
    const existing = rows.find((row) => normalizeComparableText(row.value) === normalizeComparableText(value));
    if (existing?.active) return Response.json({ error: "This choice already exists." }, { status: 409 });
    if (existing) {
      await setOption(label, existing.value, true);
      return Response.json({ ok: true }, { status: 201 });
    }
    const builtInValues = label === CATEGORY_SCOPE ? defaultCategories : label === LABEL_SCOPE ? [...specificationFields] : specificationPresets[label] ?? [];
    if (builtInValues.some((builtIn) => normalizeComparableText(builtIn) === normalizeComparableText(value))) return Response.json({ error: "This choice already exists." }, { status: 409 });
    await setOption(label, value, true);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add the choice." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireApiUser(request, "inventory:manage", true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as OptionPayload;
    const isLabel = payload.type === "label";
    const label = isLabel ? LABEL_SCOPE : payload.type === "category" ? CATEGORY_SCOPE : text(payload.label);
    const oldValue = isLabel ? text(payload.oldValue) : uppercaseText(payload.oldValue);
    const newValue = isLabel ? text(payload.newValue) : uppercaseText(payload.newValue);
    if (!label || !oldValue || !newValue) return Response.json({ error: "Detail, old value and new value are required." }, { status: 400 });
    const rowsWithValue = await getDb().select({ value: specificationOptions.value }).from(specificationOptions).where(eq(specificationOptions.label, label));
    const storedOldValue = rowsWithValue.find((row) => normalizeComparableText(row.value) === normalizeComparableText(oldValue))?.value ?? oldValue;
    const builtInValues = label === CATEGORY_SCOPE ? defaultCategories : label === LABEL_SCOPE ? [...specificationFields] : specificationPresets[label] ?? [];
    if (normalizeComparableText(oldValue) !== normalizeComparableText(newValue) && (rowsWithValue.some((row) => normalizeComparableText(row.value) === normalizeComparableText(newValue)) || builtInValues.some((builtIn) => normalizeComparableText(builtIn) === normalizeComparableText(newValue)))) {
      return Response.json({ error: "This choice already exists." }, { status: 409 });
    }
    if (storedOldValue !== newValue) await setOption(label, storedOldValue, false);
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
  const authorization = await requireApiUser(request, "inventory:manage", true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as OptionPayload;
    const label = payload.type === "label" ? LABEL_SCOPE : payload.type === "category" ? CATEGORY_SCOPE : text(payload.label);
    const value = payload.type === "label" ? text(payload.value) : uppercaseText(payload.value);
    if (!label || !value) return Response.json({ error: "Detail and value are required." }, { status: 400 });
    const rows = await getDb().select({ value: specificationOptions.value }).from(specificationOptions).where(eq(specificationOptions.label, label));
    const storedValue = rows.find((row) => normalizeComparableText(row.value) === normalizeComparableText(value))?.value ?? value;
    await setOption(label, storedValue, false);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove the choice." }, { status: 500 });
  }
}
