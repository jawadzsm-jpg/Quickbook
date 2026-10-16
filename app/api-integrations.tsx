"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Plug, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirmDelete } from "./confirm-delete-dialog";

type ApiKey = { id: number; name: string; keyPrefix: string; scopes: string[]; createdByName: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; revokedByName: string };

// Database timestamps can arrive as "2026-10-08 10:21:08+04"; normalise them so every browser parses them.
const uaeTime = (value: string | null) => value ? new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "Never";

async function copyText(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
  catch { toast.error("Could not copy. Select the text and copy it manually."); }
}

/** Admin Controls → API & Integrations: read-only API keys for websites, and how to connect. */
export function ApiIntegrations({ companyId, companyName }: { companyId: number; companyName: string }) {
  const { confirmDelete, confirmDeleteDialog } = useConfirmDelete();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin] = useState(() => typeof window === "undefined" ? "" : window.location.origin);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/api-keys?companyId=${companyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load API keys.");
      setKeys(data.keys as ApiKey[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load API keys."); }
    finally { setLoading(false); }
  }, [companyId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create the key.");
      setCreating(false); setName(""); setCopied(false);
      setSecret({ name: data.key.name, key: data.secret });
      setKeys((current) => [data.key as ApiKey, ...current]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the key."); }
    finally { setSaving(false); }
  }

  async function revoke(key: ApiKey) {
    if (!(await confirmDelete({ title: `Revoke API key ${key.name}?`, description: "Any website using this key stops receiving data immediately. This cannot be undone.", details: [{ label: "Type", value: "API key" }, { label: "Name", value: key.name }, { label: "Key", value: `${key.keyPrefix}…` }, { label: "Scopes", value: key.scopes.join(", ") }, { label: "Created by", value: key.createdByName }, { label: "Created", value: key.createdAt }, { label: "Last used", value: key.lastUsedAt || "Never" }], confirmLabel: "Revoke key" }))) return;
    try {
      const response = await fetch("/api/api-keys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: key.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not revoke the key.");
      setKeys((current) => current.map((entry) => entry.id === key.id ? data.key as ApiKey : entry));
      toast.success(`"${key.name}" revoked`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not revoke the key."); }
  }

  const base = `${origin}/api/v1`;
  const examples = [
    { label: "curl", code: `curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  "${base}/products?limit=50"` },
    { label: "PHP (WordPress)", code: `$response = wp_remote_get('${base}/products?limit=50', [\n  'headers' => ['Authorization' => 'Bearer ' . EASYBOOK_API_KEY],\n]);\n$products = json_decode(wp_remote_retrieve_body($response), true)['data'];` },
    { label: "JavaScript (server)", code: `const response = await fetch("${base}/products?updated_since=" + lastSync, {\n  headers: { Authorization: \`Bearer \${process.env.EASYBOOK_API_KEY}\` },\n});\nconst { data, has_more, next_cursor } = await response.json();` },
  ];

  return <section className="space-y-4" aria-label="API & Integrations">{confirmDeleteDialog}
    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-80 gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200"><Plug className="size-5" /></div><div className="min-w-0"><h2 className="font-semibold">API keys for {companyName}</h2><p className="text-sm text-muted-foreground">Websites (Shopify, WordPress, your own site) use a key to read this company&apos;s products, stock, prices and Today Offers. Keys are read-only.</p></div></div>
        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" />Refresh</Button><Button type="button" size="sm" onClick={() => setCreating(true)}><Plus className="size-4" />Create API key</Button></div>
      </div>
      <div className="mt-4 divide-y rounded-xl border">
        {loading ? <p className="p-4 text-sm text-muted-foreground">Loading keys…</p> : keys.length ? keys.map((key) => <div key={key.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
          <KeyRound className={`size-4 shrink-0 ${key.revokedAt ? "text-muted-foreground" : "text-violet-600"}`} />
          <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 font-medium">{key.name}{key.revokedAt ? <Badge variant="secondary">Revoked</Badge> : <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">Active</Badge>}</p><p className="mt-0.5 text-xs text-muted-foreground"><span className="font-mono">{key.keyPrefix}…</span> · Read products · Created {uaeTime(key.createdAt)}{key.createdByName ? ` by ${key.createdByName}` : ""} · Last used {uaeTime(key.lastUsedAt)}{key.revokedAt ? ` · Revoked ${uaeTime(key.revokedAt)}${key.revokedByName ? ` by ${key.revokedByName}` : ""}` : ""}</p></div>
          {!key.revokedAt ? <Button type="button" variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => void revoke(key)}><Trash2 className="size-4" />Revoke</Button> : null}
        </div>) : <p className="p-4 text-sm text-muted-foreground">No API keys yet. Create one for each website, so you can revoke one without affecting the others.</p>}
      </div>
    </div>

    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <h3 className="font-semibold">Connect a website</h3>
      <p className="mt-1 text-sm text-muted-foreground">Give your developer the API address, a key, and the API description. Keys belong on the website&apos;s server, never in browser code.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border bg-muted/30 p-3"><p className="text-xs font-medium text-muted-foreground">API address</p><p className="mt-1 flex items-center gap-2 font-mono text-sm"><span className="truncate">{base}</span><button type="button" aria-label="Copy API address" className="shrink-0 rounded p-1 hover:bg-muted" onClick={() => void copyText(base, "API address")}><Copy className="size-3.5" /></button></p></div>
        <div className="min-w-0 rounded-xl border bg-muted/30 p-3"><p className="text-xs font-medium text-muted-foreground">API description (OpenAPI — import into Postman)</p><a className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm text-primary hover:underline" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">/api/v1/openapi.json<ExternalLink className="size-3.5" /></a></div>
      </div>
      <ul className="mt-3 grid gap-1 text-sm"><li><span className="font-mono text-xs">GET /products</span> — products with stock, price and Today Offer; filters <span className="font-mono text-xs">updated_since</span>, <span className="font-mono text-xs">category</span>, <span className="font-mono text-xs">inventory</span>, <span className="font-mono text-xs">status=all</span>; paging with <span className="font-mono text-xs">next_cursor</span>.</li><li><span className="font-mono text-xs">GET /products/{"{sku}"}</span> — one product.</li><li><span className="font-mono text-xs">GET /categories</span> — categories and colours.</li></ul>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">{examples.map((example) => <div key={example.label} className="min-w-0 rounded-xl border"><div className="flex items-center justify-between border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">{example.label}<button type="button" aria-label={`Copy ${example.label} example`} className="rounded p-1 hover:bg-muted" onClick={() => void copyText(example.code, `${example.label} example`)}><Copy className="size-3.5" /></button></div><pre className="overflow-x-auto p-3 text-xs leading-5"><code>{example.code}</code></pre></div>)}</div>
    </div>

    <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="sm:max-w-md"><form onSubmit={create} className="space-y-4"><DialogHeader><DialogTitle>Create API key</DialogTitle><DialogDescription>For {companyName}. Read-only: products, stock, prices, offers and categories.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="api-key-name">Name</Label><Input id="api-key-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Shopify store" required autoFocus /><p className="text-xs text-muted-foreground">Name it after the website that will use it.</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Creating…" : "Create key"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(secret)} onOpenChange={(open) => { if (!open) setSecret(null); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>API key for {secret?.name}</DialogTitle><DialogDescription>Copy it now and store it on the website&apos;s server. It is not shown again; if it is lost, revoke it and create a new one.</DialogDescription></DialogHeader>{secret ? <div className="space-y-3"><p className="break-all rounded-xl border bg-muted/30 p-3 font-mono text-sm">{secret.key}</p><Button type="button" variant="outline" className="w-full" onClick={() => { void copyText(secret.key, "API key"); setCopied(true); }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy API key"}</Button><p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"><ShieldAlert className="size-4 shrink-0" />Anyone with this key can read this company&apos;s product list, stock and prices. Never share it in chat or put it in website pages.</p></div> : null}<DialogFooter><Button type="button" onClick={() => setSecret(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
