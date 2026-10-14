"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SIGNATURE_ADDRESS_MAX, SIGNATURE_FIELD_MAX, SIGNATURE_IMAGE_MAX, signatureHtml, type EmailSignature } from "@/lib/email-signature";

type TextField = Exclude<keyof EmailSignature, "enabled" | "bannerData">;
const lines: { key: TextField; label: string; placeholder: string; wide?: boolean }[] = [
  { key: "closing", label: "Closing line", placeholder: "Thanks and regards" },
  { key: "fullName", label: "Name", placeholder: "Your full name" },
  { key: "jobTitle", label: "Job title", placeholder: "Optional", wide: true },
  { key: "landline", label: "Lan Line", placeholder: "+971 4 …" },
  { key: "fax", label: "Fax", placeholder: "+971 4 …" },
  { key: "mobile", label: "Mobile", placeholder: "+971 5…" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+971 5…" },
  { key: "msn", label: "MSN", placeholder: "name@hotmail.com" },
  { key: "skype", label: "Skype", placeholder: "Skype name" },
  { key: "email", label: "Email", placeholder: "name@company.com" },
  { key: "website", label: "Website", placeholder: "www.company.com" },
];

/**
 * An uploaded image as a PNG (JPEG for large photos) data URL, scaled down to `maxWidth`: mail programs do not all
 * show WebP, and the stored image must stay under the size limit.
 */
async function emailImage(file: File, maxWidth: number) {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the image.")); };
    image.src = url;
  });
  const scale = Math.min(1, maxWidth / source.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.naturalWidth * scale); canvas.height = Math.round(source.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read the image.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  if (png.length <= SIGNATURE_IMAGE_MAX) return png;
  // JPEG has no transparency: paint a white background first.
  context.globalCompositeOperation = "destination-over"; context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
  for (const quality of [0.9, 0.8, 0.7, 0.6]) { const jpeg = canvas.toDataURL("image/jpeg", quality); if (jpeg.length <= SIGNATURE_IMAGE_MAX) return jpeg; }
  throw new Error("The image is too large. Use a smaller one (up to 500 KB).");
}

function ImageField({ label, hint, value, maxWidth, onChange }: { label: string; hint: string; value: string; maxWidth: number; onChange: (value: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file.");
    try { onChange(await emailImage(file, maxWidth)); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read the image."); }
  };
  return <div className="space-y-1.5">
    <Label>{label}</Label>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- inline data-URL preview */}
      {value ? <img src={value} alt="" className="h-12 max-w-48 rounded bg-white object-contain p-1" /> : <span className="px-1 text-xs text-muted-foreground">No image</span>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void pick(event)} />
      <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" />{value ? "Replace" : "Upload"}</Button>
      {value ? <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange("")}><Trash2 className="size-4" />Remove</Button> : null}
    </div>
    <p className="text-xs text-muted-foreground">{hint}</p>
  </div>;
}

/**
 * The person's own email signature for this company: closing line, name, the company logo, address, contact details and a brands
 * banner, added under every document and stock-list email they send.
 */
export function EmailSignatureEditor({ companyId }: { companyId: number }) {
  const [signature, setSignature] = useState<EmailSignature | null>(null);
  const [companyLogo, setCompanyLogo] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/email-signatures?companyId=${companyId}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load the signature.");
      if (active) { setSignature(data.signature); setCompanyLogo(data.companyLogo ?? ""); setSaved(data.saved === true); }
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load the signature."); });
    return () => { active = false; };
  }, [companyId]);

  if (!signature) return <p className="p-6 text-center text-sm text-muted-foreground">Loading signature…</p>;
  const set = (patch: Partial<EmailSignature>) => setSignature({ ...signature, ...patch });
  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/email-signatures", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...signature }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save the signature.");
      setSignature(data.signature); setSaved(true);
      toast.success(signature.enabled ? "Signature saved — it is added to your emails" : "Signature saved (turned off)");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the signature."); }
    finally { setBusy(false); }
  };
  const preview = signatureHtml(signature, { logo: companyLogo || undefined, banner: signature.bannerData || undefined });

  return <div className="space-y-4">
    <label className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm"><Checkbox className="mt-0.5" checked={signature.enabled} onCheckedChange={(checked) => set({ enabled: checked === true })} /><span>Add my signature to the emails I send<span className="block text-xs text-muted-foreground">Under the message of document and stock-list emails from this company. Only you can change your signature.{saved ? "" : " Not saved yet."}</span></span></label>
    <div className="grid gap-3 sm:grid-cols-2">
      {lines.map(({ key, label, placeholder, wide }) => <div key={key} className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}><Label htmlFor={`signature-${key}`}>{label}</Label><Input id={`signature-${key}`} value={signature[key]} maxLength={SIGNATURE_FIELD_MAX} placeholder={placeholder} onChange={(event) => set({ [key]: event.target.value })} /></div>)}
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="signature-address">Address</Label><Textarea id="signature-address" rows={2} value={signature.address} maxLength={SIGNATURE_ADDRESS_MAX} placeholder={"Shop / building, street\nP.O. Box, city, country"} onChange={(event) => set({ address: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Logo</Label><div className="flex min-h-[3.75rem] items-center rounded-lg border bg-muted/20 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline data-URL preview */}
        {companyLogo ? <img src={companyLogo} alt="" className="h-12 max-w-48 rounded bg-white object-contain p-1" /> : <span className="px-1 text-xs text-muted-foreground">No company logo</span>}</div><p className="text-xs text-muted-foreground">The company logo{companyLogo ? "" : " (set it in Company setup)"}.</p></div>
      <ImageField label="Brands banner" hint="Optional strip shown at the bottom, e.g. the brands you sell." value={signature.bannerData} maxWidth={1300} onChange={(bannerData) => set({ bannerData })} />
    </div>
    <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Preview</p><div className="overflow-x-auto rounded-lg border p-4" style={{ background: "#fff", color: "#0f172a" }} dangerouslySetInnerHTML={{ __html: preview }} /></div>
    <div className="flex justify-end"><Button type="button" disabled={busy} onClick={() => void save()}><Save className="size-4" />{busy ? "Saving…" : "Save signature"}</Button></div>
  </div>;
}
