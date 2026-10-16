"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bold, Code, Italic, List as ListIcon, ListOrdered, Quote, Strikethrough, Lock, Pencil, BadgeDollarSign, Boxes, CalendarClock, ChevronDown, Clock, Download, Eye, FileSpreadsheet, Mail, PackageCheck, PackageOpen, PackageX, PlaneLanding, Printer, RefreshCw, Rocket, Search, ShoppingCart, Trash2, TriangleAlert, UserRound, Warehouse, X, Tag, Underline, EyeOff, Link as LinkIcon, ArrowUpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FilePlus2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { StockHoldDialog, StockHoldsPanel, heldTotals, type StockHold } from "./stock-holds";
import { defaultShareEmoji, shareEmojiStyle, shareEmojiStyles } from "@/lib/share-emoji";
import { applyInlineFormat, applyLineFormat, applyLink, inlineFormatsFor, telegramHtml, type FormatResult, type InlineFormat, type LineFormat } from "@/lib/share-format";
import { inventoryItemCondition, inventoryItemLine, inventoryLineParts, partNumberInLine, inventorySocialShareText, itemSpecificationDescription } from "@/lib/item-description";
import { matchesSearch } from "@/lib/search";
import { inactiveCodeMatches } from "@/lib/inactive-item-match";
import { InactiveItemNotice } from "./inactive-item-notice";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TelegramIcon, WhatsAppIcon } from "./brand-icons";
import { CopyOnHover } from "./copy-on-hover";
import { TodayOffersPanel, runningOffers, type TodayOffer } from "./today-offers";
import { offerEndsText, offerRemaining, offerShareText } from "@/lib/item-offers";
import { categoryColor, categoryPalette } from "@/lib/category-colors";
import { CategoryColorPicker } from "./category-color-picker";
import type { PrintOrientation } from "@/components/print-orientation-select";
import { applyCustomizationUpgrades, customizationBoxValue, customizationFieldLabels, customizationOptionFields, isOnboardValue, type CustomizationOptionField, type CustomizationOptions, type CustomizationUpgrades } from "@/lib/customization-options";
import { InventoryEmailDialog } from "./inventory-email-dialog";
import { convertSharePrice, missingShareRateMessage, shareCurrencies, shareCurrencyOption, shareCurrencyRate } from "@/lib/share-currency";


type OverviewItem = {
  id: number;
  itemNumber: string | null;
  sku: string;
  name: string;
  category: string;
  description: string;
  specifications: string;
  quantity: number;
  reorderPoint: number;
  salesPrice: number;
  status: string;
  createdAt: string;
  customizationRam: string;
  customizationStorage: string;
  customizationScreen: string;
  partNumber: string;
  itemSerialNumber: string;
  upcNumber: string;
  customizationDetails: string;
  latestReceivedAt: string | null;
  companyId: number;
  companyName: string;
  currency: string;
  locationId: number;
  locationName: string;
  locationCode: string;
  /** Per-warehouse quantities, present only when the inventory has more than one warehouse. */
  warehouses?: Array<{ warehouseId: number; name: string; code: string; isDefault: boolean; quantity: number }>;
};

type InventoryPresence = Pick<OverviewItem, "id" | "companyId" | "companyName" | "currency" | "locationId" | "locationName" | "locationCode" | "quantity" | "reorderPoint" | "salesPrice" | "warehouses">;

type ConsolidatedItem = OverviewItem & {
  inventories: InventoryPresence[];
  recordIds: number[];
};

type StockFilter = "all" | "in" | "low" | "out" | "hold" | "recent7" | "recent30" | `location:${number}`;
type PriceAdjust = { mode: "percent" | "amount"; value: string };
type VatMode = "exclude" | "include" | "zero";
const vatModes = [["exclude", "No VAT", "Prices without VAT"], ["include", "Inc VAT", "Prices including 5% VAT"], ["zero", "0% VAT", "Zero-rated prices (0% VAT), e.g. exports"]] as const;
const vatLabels: Record<VatMode, string> = { exclude: " (VAT excluded)", include: " (VAT included)", zero: " (0% VAT)" };
// Brand: a well-known brand found in the item name, then its description/specifications; otherwise the name's first word.
const knownBrands = ["DELL", "HP", "HPE", "LENOVO", "ASUS", "ACER", "APPLE", "MSI", "SAMSUNG", "MICROSOFT", "TOSHIBA", "HUAWEI", "GIGABYTE", "LG", "SONY", "PANASONIC", "FUJITSU", "ALIENWARE", "RAZER", "KINGSTON", "CRUCIAL", "ADATA", "IMATION", "SANDISK", "SEAGATE", "WD", "WESTERN DIGITAL", "TRANSCEND", "CORSAIR", "INTEL", "AMD", "NVIDIA", "LOGITECH", "EPSON", "CANON", "BROTHER", "XEROX", "CISCO", "TP-LINK", "D-LINK", "NETGEAR", "UBIQUITI", "APC", "BENQ", "VIEWSONIC", "PHILIPS", "AOC", "SYNOLOGY", "QNAP", "ZEBRA", "HONEYWELL", "XIAOMI"];
// Escape every regular-expression metacharacter (including backslash) before building the brand pattern.
const escapeRegExp = (value: string) => value.replace(/[\\^$.*+?()[\]{}|-]/g, "\\$&");
const brandPattern = new RegExp(`(?:^|[^A-Z0-9])(${[...knownBrands].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})(?=$|[^A-Z0-9])`);
const brandOf = (record: { name: string; description?: string; specifications?: string }) => {
  for (const text of [record.name, record.description, record.specifications]) {
    const match = String(text ?? "").toUpperCase().match(brandPattern);
    if (match) return match[1];
  }
  return (String(record.name).trim().split(/\s+/)[0] || "").toUpperCase();
};
const receivedWithin = (record: { latestReceivedAt: string | null }, days: number, now: number) => Boolean(record.latestReceivedAt) && now - new Date(String(record.latestReceivedAt).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).getTime() <= days * 86_400_000;
const OVERVIEW_PAGE_ROWS = 150;
type ShareChannel = "whatsapp" | "telegram" | "email";
type ActivityView = "incoming" | "launched" | "priceChanges" | "sold";
type ActivityRecord = {
  id: number;
  itemId: number;
  transactionId: number | null;
  date: string;
  documentNumber: string;
  documentType?: string;
  documentStatus?: string;
  linkedBillId?: number | null;
  linkedBillNumber?: string | null;
  party: string;
  salesRep: string;
  sku: string;
  itemNumber: string | null;
  itemName: string;
  companyId: number;
  locationId: number;
  companyName: string;
  locationName: string;
  currency: string;
  quantity: number;
  price: number;
  previousPrice?: number;
  currentPrice?: number;
};
type InventoryActivity = Record<ActivityView, ActivityRecord[]>;
const emptyActivity: InventoryActivity = { incoming: [], launched: [], priceChanges: [], sold: [] };

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-AE", { maximumFractionDigits: 2 })}`;
  }
}

function specificationText(record: OverviewItem) {
  try {
    const parsed = JSON.parse(record.specifications) as Array<{ label?: string; value?: string }>;
    const values = parsed.filter((entry) => entry?.value).map((entry) => entry.value).join(" | ");
    if (values) return itemSpecificationDescription(values, record.name, record.sku, record.itemNumber);
  } catch {
    // Older records can still fall back to their saved description.
  }
  return itemSpecificationDescription(record.description, record.name, record.sku, record.itemNumber);
}

/**
 * The specifications for the item line and for WhatsApp, Telegram, Email copies and the Excel export: Product
 * Customization Details (RAM, Storage, Screen Details, Part Number, Serial, UPC No.) are left out; they show only in
 * Details. Saving them used to write RAM, Storage and Part Number into the specifications, so any specification equal to
 * a customization value is dropped too. The on-screen line keeps the Part Number (it copies on hover).
 */
function shareSpecificationText(record: OverviewItem, keepPartNumber = false) {
  const custom = new Set([record.customizationRam, record.customizationStorage, record.customizationScreen, keepPartNumber ? "" : record.partNumber, record.itemSerialNumber, record.upcNumber]
    .map((value) => String(value ?? "").trim().toLocaleUpperCase("en")).filter(Boolean));
  if (!custom.size) return specificationText(record);
  return specificationText(record).split("|").map((part) => part.trim()).filter((part) => part && !custom.has(part.toLocaleUpperCase("en"))).join(" | ");
}

const noCondition = "Not specified";
// Condition (BRAND NEW, OPEN BOX, ...) as written in the product's specifications or description.
const conditionOf = (record: OverviewItem) => inventoryItemCondition(record.name, record.sku, specificationText(record), record.itemNumber) || noCondition;
// Part number: the item's Part Number field, else its Part Number / MPN specification; capitals, as in the product line.
function partNumberOf(record: Pick<OverviewItem, "partNumber" | "specifications">) {
  let value = record.partNumber;
  if (!value?.trim()) {
    try {
      const parsed = JSON.parse(record.specifications) as Array<{ label?: string; value?: string }>;
      value = parsed.find((entry) => ["PART NUMBER", "MPN"].includes(String(entry?.label ?? "").trim().toUpperCase()) && entry.value?.trim())?.value ?? "";
    } catch { value = ""; }
  }
  return String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en");
}

function plainMoney(value: number) {
  return value.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function xml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function activityDate(value: string) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function receivedAge(value: string | null) {
  if (!value) return "Receipt date unavailable";
  const received = new Date(value);
  if (Number.isNaN(received.getTime())) return "Receipt date unavailable";
  const days = Math.max(0, Math.floor((Date.now() - received.getTime()) / 86_400_000));
  return days === 0 ? "Received today" : `Received ${days} ${days === 1 ? "day" : "days"} ago`;
}

function specificationValue(record: OverviewItem, labels: string[]) {
  try {
    const wanted = new Set(labels.map((label) => label.toLowerCase()));
    const parsed = JSON.parse(record.specifications) as Array<{ label?: string; value?: string }>;
    return parsed.find((entry) => wanted.has(String(entry.label ?? "").trim().toLowerCase()))?.value?.trim() ?? "";
  } catch { return ""; }
}

/** Sales documents the Inventory Overview cart can start. */
export type OverviewCartDocument = "invoice" | "sales order" | "proforma invoice" | "estimate";
type CartEntry = { key: number; sku: string; name: string; quantity: number; inventories: Array<{ companyId: number; locationId: number; itemId: number; companyName: string; locationName: string; quantity: number }> };
const cartStorageKey = "comnet-overview-cart";
const cartDocuments: Array<[OverviewCartDocument, string]> = [["invoice", "Invoice"], ["sales order", "Sales Order"], ["proforma invoice", "Proforma Invoice"], ["estimate", "Estimate"]];

export function InventoryOverview({ companyId, onOpenDocument, onOpenItem, onCreateDocument, emailFrom }: { companyId?: number; emailFrom?: { companyId: number; companyName: string; role: string; name: string; email: string }; onOpenDocument?: (id: number) => void; onOpenItem?: (id: number) => void; onCreateDocument?: (request: { type: OverviewCartDocument; companyId: number; locationId: number; lines: Array<{ itemId: number; quantity: number; sku: string; name: string }> }) => void } = {}) {
  const [records, setRecords] = useState<OverviewItem[]>([]);
  // Inactive items (codes only) and whether this user may reactivate them, for the "it is in Inactive items" notice.
  const [inactiveItems, setInactiveItems] = useState<Array<Record<string, unknown> & { id: number }>>([]);
  const [canReactivateItems, setCanReactivateItems] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [activity, setActivity] = useState<InventoryActivity>(emptyActivity);
  const [activityView, setActivityView] = useState<ActivityView | "offers">("incoming");
  const [offers, setOffers] = useState<TodayOffer[]>([]);
  const [canManageOffers, setCanManageOffers] = useState(false);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [canManageCategories, setCanManageCategories] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [canSelectItems, setCanSelectItems] = useState(false);
  const [canBulkSelect, setCanBulkSelect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showQuantity, setShowQuantity] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  // Shared price format: VAT excluded (net), VAT included (+5%), or 0% VAT (zero-rated, e.g. exports: net price, labelled).
  const [vatMode, setVatMode] = useState<VatMode>("exclude");
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("portrait");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  // Price adjustment for what is shown and shared (WhatsApp, Telegram, email, Excel); saved prices never change.
  const [priceAdjust, setPriceAdjust] = useState<PriceAdjust>({ mode: "percent", value: "" });
  // Price currency for what is shown and shared: "" keeps the base currency; USD or EUR converts with the company's
  // saved exchange rates (Currencies). Saved prices never change.
  const [shareCurrency, setShareCurrency] = useState("");
  const [exchangeRates, setExchangeRates] = useState<Array<{ currencyCode: string; rate: number; active?: boolean }>>([]);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [detailRecord, setDetailRecord] = useState<ConsolidatedItem | null>(null);
  // Upgrade picks (RAM, Storage, Screen Details options from Product Customization Details) per product, for this
  // user's on-screen line, copies, print and Excel only; nothing is saved.
  const [upgradeOptions, setUpgradeOptions] = useState<CustomizationOptions>({ ram: [], storage: [], screen: [] });
  const [upgrades, setUpgrades] = useState<Record<number, CustomizationUpgrades>>({});
  const [upgradeRecord, setUpgradeRecord] = useState<ConsolidatedItem | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/customization-options", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (active && data?.options) setUpgradeOptions({ ram: [], storage: [], screen: [], ...data.options }); }).catch(() => { /* upgrades stay unavailable */ });
    return () => { active = false; };
  }, []);
  // A box that says ONBOARD cannot be upgraded; the others offer their saved options.
  const upgradeFields = (record: ConsolidatedItem) => customizationOptionFields.filter((field) => upgradeOptions[field].length && !isOnboardValue(customizationBoxValue(record, field)));
  const withUpgrades = (record: ConsolidatedItem, text: string) => {
    const picked = upgrades[record.id];
    if (!picked || !Object.values(picked).some(Boolean)) return text;
    const current = Object.fromEntries(customizationOptionFields.map((field) => [field, customizationBoxValue(record, field)]));
    return applyCustomizationUpgrades(text, current, picked);
  };
  const pickUpgrade = (record: ConsolidatedItem, field: CustomizationOptionField, value: string) => setUpgrades((current) => ({ ...current, [record.id]: { ...current[record.id], [field]: value } }));
  // Cart: products and quantities to start an invoice, sales order, proforma or estimate (kept for this browser tab).
  const [cart, setCart] = useState<CartEntry[]>(() => { try { return JSON.parse(window.sessionStorage.getItem(cartStorageKey) || "[]") as CartEntry[]; } catch { return []; } });
  const [cartQuantities, setCartQuantities] = useState<Record<number, string>>({});
  useEffect(() => { try { window.sessionStorage.setItem(cartStorageKey, JSON.stringify(cart)); } catch { /* optional */ } }, [cart]);
  const addToCart = (record: ConsolidatedItem) => {
    const quantity = Number(cartQuantities[record.id] ?? "1");
    if (!Number.isFinite(quantity) || quantity <= 0) return toast.error("Enter a quantity above zero.");
    const inventories = record.inventories.map((inventory) => ({ companyId: inventory.companyId, locationId: inventory.locationId, itemId: inventory.id, companyName: inventory.companyName, locationName: inventory.locationName, quantity: Number(inventory.quantity) }));
    setCart((current) => current.some((entry) => entry.key === record.id)
      ? current.map((entry) => entry.key === record.id ? { ...entry, quantity: entry.quantity + quantity, inventories } : entry)
      : [...current, { key: record.id, sku: record.sku, name: record.name, quantity, inventories }]);
    setCartQuantities((current) => ({ ...current, [record.id]: "1" }));
    toast.success(`${quantity.toLocaleString()} × ${record.name} added to the cart`);
  };
  const createFromCart = (type: OverviewCartDocument) => {
    if (!onCreateDocument || !cart.length) return;
    // The document is made in the inventory that holds the most cart products (most stock breaks a tie).
    const places = new Map<string, { companyId: number; locationId: number; lines: number; stock: number }>();
    for (const entry of cart) for (const inventory of entry.inventories) {
      const key = `${inventory.companyId}:${inventory.locationId}`;
      const place = places.get(key) ?? { companyId: inventory.companyId, locationId: inventory.locationId, lines: 0, stock: 0 };
      places.set(key, { ...place, lines: place.lines + 1, stock: place.stock + inventory.quantity });
    }
    const target = [...places.values()].sort((a, b) => b.lines - a.lines || b.stock - a.stock)[0];
    if (!target) return;
    onCreateDocument({ type, companyId: target.companyId, locationId: target.locationId, lines: cart.map((entry) => ({ itemId: entry.inventories.find((inventory) => inventory.companyId === target.companyId && inventory.locationId === target.locationId)?.itemId ?? 0, quantity: entry.quantity, sku: entry.sku, name: entry.name })) });
    setCart([]);
  };
  const cartUnits = cart.reduce((sum, entry) => sum + entry.quantity, 0);
  const [holds, setHolds] = useState<StockHold[]>([]);
  const [canManageHolds, setCanManageHolds] = useState(false);
  const [editor, setEditor] = useState<{ channel: ShareChannel; text: string } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [shareEmoji, setShareEmoji] = useState<{ whatsapp: string; telegram: string; offCompanyIds: number[] }>({ whatsapp: defaultShareEmoji, telegram: defaultShareEmoji, offCompanyIds: [] });
  const [holdTarget, setHoldTarget] = useState<ConsolidatedItem | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return; // wait for the selected company
    setLoading(true);
    setCanSelectItems(false);
    setSelectedIds(new Set());
    try {
      // Only the selected company's stock and activity (a new company starts empty).
      const response = await fetch(`/api/inventory-overview?companyId=${companyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load inventory overview");
      setRecords(data.records as OverviewItem[]);
      setInactiveItems(Array.isArray(data.inactive) ? data.inactive : []);
      setCanReactivateItems(data.canReactivateItems === true);
      setLoadedAt(Date.now());
      setActivity({ ...emptyActivity, ...(data.activity as Partial<InventoryActivity> | undefined) });
      setCanSelectItems(data.canSelectItems === true);
      setCanBulkSelect(data.canBulkSelect === true);
      setHolds((data.holds ?? []) as StockHold[]);
      setCanManageHolds(data.canManageHolds === true);
      setOffers((data.offers ?? []) as TodayOffer[]);
      setCanManageOffers(data.canManageOffers === true);
      setCategoryColors((data.categoryColors ?? {}) as Record<string, string>);
      setCanManageCategories(data.canManageCategories === true);
      if (data.shareEmoji) setShareEmoji(data.shareEmoji);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load inventory overview");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    fetch(`/api/exchange-rates?companyId=${companyId}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (active) setExchangeRates(Array.isArray(data?.rates) ? data.rates : []); }).catch(() => { if (active) setExchangeRates([]); });
    return () => { active = false; };
  }, [companyId]);

  // Initial load synchronizes the overview with all persisted inventories.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Expire bill receipts and price changes even while the overview stays open.
  useEffect(() => {
    const expiringEntries = [...activity.launched, ...activity.priceChanges];
    if (!expiringEntries.length) return;
    const expiresAt = Math.min(...expiringEntries.map((entry) => new Date(entry.date).getTime() + 12 * 60 * 60 * 1000));
    const timer = window.setTimeout(() => {
      const cutoff = Date.now() - 12 * 60 * 60 * 1000;
      setActivity((current) => ({
        ...current,
        launched: current.launched.filter((entry) => new Date(entry.date).getTime() > cutoff),
        priceChanges: current.priceChanges.filter((entry) => new Date(entry.date).getTime() > cutoff),
      }));
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [activity.launched, activity.priceChanges]);

  const inStockRecords = useMemo(() => records.filter((record) => Number(record.quantity) > 0), [records]);

  // Group stock rows for the same product (item number or SKU) within a company into one line.
  const consolidate = useCallback((list: OverviewItem[]) => {
    const grouped = new Map<string, ConsolidatedItem>();
    for (const record of list) {
      const identity = record.itemNumber?.trim() || record.sku.trim().toLowerCase();
      const key = `${record.companyId}:${identity}`;
      const inventory: InventoryPresence = {
        id: record.id,
        companyId: record.companyId,
        companyName: record.companyName,
        currency: record.currency,
        locationId: record.locationId,
        locationName: record.locationName,
        locationCode: record.locationCode,
        quantity: Number(record.quantity),
        reorderPoint: Number(record.reorderPoint),
        salesPrice: Number(record.salesPrice),
        warehouses: record.warehouses,
      };
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += Number(record.quantity);
        existing.reorderPoint += Number(record.reorderPoint);
        existing.inventories.push(inventory);
        existing.recordIds.push(record.id);
        if (new Date(record.latestReceivedAt ?? 0).getTime() > new Date(existing.latestReceivedAt ?? 0).getTime()) existing.latestReceivedAt = record.latestReceivedAt;
        for (const field of ["customizationRam", "customizationStorage", "customizationScreen", "partNumber", "itemSerialNumber", "upcNumber", "customizationDetails"] as const) {
          if (!existing[field] && record[field]) existing[field] = record[field];
        }
      } else {
        grouped.set(key, {
          ...record,
          quantity: Number(record.quantity),
          reorderPoint: Number(record.reorderPoint),
          inventories: [inventory],
          recordIds: [record.id],
        });
      }
    }
    return [...grouped.values()];
  }, []);
  const consolidatedRecords = useMemo(() => consolidate(inStockRecords), [consolidate, inStockRecords]);
  // Products with no stock in any inventory (for the Out of stock filter).
  const outOfStockRecords = useMemo(() => consolidate(records).filter((record) => Number(record.quantity) <= 0), [consolidate, records]);

  const locations = useMemo(() => {
    const grouped = new Map<number, { id: number; company: string; location: string; quantity: number; itemCount: number }>();
    for (const record of inStockRecords) {
      const existing = grouped.get(record.locationId);
      if (existing) {
        existing.quantity += Number(record.quantity);
        existing.itemCount += 1;
      } else {
        grouped.set(record.locationId, { id: record.locationId, company: record.companyName, location: record.locationName, quantity: Number(record.quantity), itemCount: 1 });
      }
    }
    return [...grouped.values()].sort((a, b) => a.company.localeCompare(b.company) || a.location.localeCompare(b.location));
  }, [inStockRecords]);

  // Held quantity per stock row, summed for a consolidated product; names for the "Stock on hold" list.
  const heldByItem = useMemo(() => heldTotals(holds), [holds]);
  const heldOn = (record: ConsolidatedItem) => record.recordIds.reduce((sum, id) => sum + (heldByItem.get(id) ?? 0), 0);
  const holdNames = useMemo(() => new Map(records.map((item) => [item.id, `${item.name} · ${item.sku} · ${item.locationName}`])), [records]);
  const totals = useMemo(() => ({
    quantity: inStockRecords.reduce((sum, record) => sum + Number(record.quantity), 0),
    inStock: consolidatedRecords.length,
    healthy: consolidatedRecords.filter((record) => Number(record.quantity) > Number(record.reorderPoint)).length,
    low: consolidatedRecords.filter((record) => Number(record.quantity) <= Number(record.reorderPoint)).length,
  }), [consolidatedRecords, inStockRecords]);

  const adjustValue = Number(priceAdjust.value) || 0;
  // The overview lists one company, so every record shares its base currency.
  const baseCurrency = records[0]?.currency || "AED";
  const shareRate = shareCurrency ? shareCurrencyRate(exchangeRates, baseCurrency, shareCurrency) : 1;
  const priceCurrency = shareCurrency && shareRate ? shareCurrency : baseCurrency;
  const pickShareCurrency = (code: string) => {
    if (code && !shareCurrencyRate(exchangeRates, baseCurrency, code)) {
      toast.error(missingShareRateMessage(code, baseCurrency, records[0]?.companyName ?? ""));
      return setShareCurrency("");
    }
    setShareCurrency(code);
  };
  // The increase applies in the base currency, then VAT, then the conversion to the picked currency.
  const priceFor = (record: { salesPrice: number | string }, mode: VatMode = vatMode) => {
    const base = Number(record.salesPrice);
    const adjusted = priceAdjust.mode === "percent" ? base * (1 + adjustValue / 100) : base + adjustValue;
    const priced = Math.round(Math.max(0, adjusted) * (mode === "include" ? 1.05 : 1) * 100) / 100;
    return shareCurrency && shareRate ? convertSharePrice(priced, shareRate) : priced;
  };
  const adjustLabel = adjustValue ? (priceAdjust.mode === "percent" ? ` +${adjustValue}%` : ` +${adjustValue}`) : "";
  const categoryOptions = useMemo(() => [...new Set(records.map((record) => record.category).filter(Boolean))].sort(), [records]);
  const brandOptions = useMemo(() => [...new Set(records.map((record) => brandOf(record)).filter(Boolean))].sort(), [records]);
  const conditionOptions = useMemo(() => [...new Set(records.map(conditionOf))].sort((a, b) => Number(a === noCondition) - Number(b === noCondition) || a.localeCompare(b)), [records]);
  const statusCounts = useMemo(() => ({
    out: outOfStockRecords.length,
    hold: consolidatedRecords.filter((record) => record.recordIds.some((id) => heldByItem.has(id))).length,
  }), [outOfStockRecords, consolidatedRecords, heldByItem]);
  // Warehouses of inventories that have more than one (the filter only appears when there are any).
  const warehouseOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const record of records) for (const share of record.warehouses ?? []) options.set(String(share.warehouseId), `${record.locationName} · ${share.name}`);
    return [...options].sort((a, b) => a[1].localeCompare(b[1]));
  }, [records]);
  // A warehouse filter keeps only stock held in that warehouse and shows its quantity.
  const inWarehouse = <T extends { quantity: number; warehouses?: Array<{ warehouseId: number; quantity: number }> }>(inventories: T[], warehouseId: string) => !warehouseId ? inventories : inventories.flatMap((inventory) => {
    const share = inventory.warehouses?.find((entry) => String(entry.warehouseId) === warehouseId);
    return share && share.quantity > 0 ? [{ ...inventory, quantity: share.quantity }] : [];
  });
  const extraFilters = Boolean(category || brand || condition || priceMin || priceMax || warehouseFilter);
  const clearExtraFilters = () => { setCategory(""); setBrand(""); setCondition(""); setPriceMin(""); setPriceMax(""); setWarehouseFilter(""); };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = priceMin === "" ? null : Number(priceMin), max = priceMax === "" ? null : Number(priceMax);
    return (filter === "out" ? outOfStockRecords : consolidatedRecords).flatMap((record) => {
      if (filter === "low" && !(Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint))) return [];
      if (filter === "hold" && !record.recordIds.some((id) => heldByItem.has(id))) return [];
      if (filter === "recent7" && !receivedWithin(record, 7, loadedAt)) return [];
      if (filter === "recent30" && !receivedWithin(record, 30, loadedAt)) return [];
      if (category && record.category !== category) return [];
      if (brand && brandOf(record) !== brand) return [];
      if (condition && conditionOf(record) !== condition) return [];
      if (min !== null && Number.isFinite(min) && Number(record.salesPrice) < min) return [];
      if (max !== null && Number.isFinite(max) && Number(record.salesPrice) > max) return [];
      const locationId = filter.startsWith("location:") ? Number(filter.split(":")[1]) : null;
      const located = locationId === null ? record.inventories : record.inventories.filter((inventory) => inventory.locationId === locationId);
      const inventories = inWarehouse(located, warehouseFilter);
      if (!inventories.length) return [];
      if (term && !matchesSearch([record.name, record.sku, record.itemNumber, record.category, record.description, record.specifications, record.companyName, ...inventories.flatMap((inventory) => [inventory.locationName, inventory.locationCode])], term)) return [];
      return [{
        ...record,
        inventories,
        quantity: inventories.reduce((sum, inventory) => sum + Number(inventory.quantity), 0),
        reorderPoint: inventories.reduce((sum, inventory) => sum + Number(inventory.reorderPoint), 0),
      }];
    });
  }, [consolidatedRecords, outOfStockRecords, filter, search, category, brand, condition, priceMin, priceMax, warehouseFilter, heldByItem, loadedAt]);

  const categories = useMemo(() => {
    const grouped = new Map<string, ConsolidatedItem[]>();
    for (const record of filtered) {
      const category = record.category.trim() || "General";
      grouped.set(category, [...(grouped.get(category) ?? []), record]);
    }
    return [...grouped.entries()];
  }, [filtered]);

  // Draw the table progressively: large catalogues rendered every row at once and made the overview slow to open.
  // The limit resets whenever the filtered list changes; search, selection, copy and Excel still use the full list.
  const [rowWindow, setRowWindow] = useState<{ source: ConsolidatedItem[]; limit: number }>({ source: [], limit: OVERVIEW_PAGE_ROWS });
  const rowLimit = rowWindow.source === filtered ? rowWindow.limit : OVERVIEW_PAGE_ROWS;
  const showMoreRows = useCallback(() => setRowWindow({ source: filtered, limit: rowLimit + OVERVIEW_PAGE_ROWS }), [filtered, rowLimit]);
  const visibleCategories = useMemo(() => {
    let remaining = rowLimit;
    const visible: Array<[string, ConsolidatedItem[], number]> = [];
    for (const [category, items] of categories) {
      if (remaining <= 0) break;
      visible.push([category, items.slice(0, remaining), items.length]);
      remaining -= items.length;
    }
    return visible;
  }, [categories, rowLimit]);
  const hiddenRows = Math.max(0, filtered.length - rowLimit);
  const moreRowsRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const row = moreRowsRef.current;
    if (!row || !hiddenRows || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) showMoreRows(); }, { rootMargin: "600px 0px" });
    observer.observe(row);
    return () => observer.disconnect();
  }, [hiddenRows, showMoreRows]);

  const selectedRecords = useMemo(() => canSelectItems ? consolidatedRecords.filter((record) => selectedIds.has(record.id)) : [], [canSelectItems, consolidatedRecords, selectedIds]);
  // Copy and Excel export follow the Warehouse filter: that warehouse's quantity, leaving out selected items it does not hold.
  const warehouseLabel = warehouseFilter ? warehouseOptions.find(([id]) => id === warehouseFilter)?.[1] ?? "" : "";
  const shareRecords = selectedRecords.flatMap((record) => {
    const inventories = inWarehouse(record.inventories, warehouseFilter);
    return inventories.length ? [{ ...record, inventories, quantity: inventories.reduce((sum, inventory) => sum + Number(inventory.quantity), 0) }] : [];
  });
  const leftOutText = () => { const skipped = selectedRecords.length - shareRecords.length; return `${warehouseLabel ? ` · ${warehouseLabel}` : ""}${skipped ? ` (${skipped} with no stock there left out)` : ""}`; };
  const noShareRecords = (action: string) => toast.error(selectedRecords.length ? `None of the selected items have stock in ${warehouseLabel}.` : `Select at least one item to ${action}.`);
  const visibleActivity = activityView === "offers" ? [] : activity[activityView];

  const openActivityRecord = (entry: ActivityRecord, kind: "document" | "item") => {
    if (kind === "document" && entry.transactionId && onOpenDocument) return onOpenDocument(entry.transactionId);
    if (kind === "item" && onOpenItem) return onOpenItem(entry.itemId);
    window.dispatchEvent(new CustomEvent("inventory-activity-open", { detail: { kind, id: kind === "document" ? entry.transactionId : entry.itemId, companyId: entry.companyId, locationId: entry.locationId, sku: entry.sku } }));
  };
  const inactiveSearchMatches = useMemo(() => inactiveCodeMatches(inactiveItems, search), [inactiveItems, search]);
  const allVisibleSelected = filtered.length > 0 && filtered.every((record) => selectedIds.has(record.id));
  const someVisibleSelected = filtered.some((record) => selectedIds.has(record.id));

  const toggleSelected = (id: number, checked: boolean) => setSelectedIds((current) => {
    if (!canSelectItems || loading) return current;
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });

  const toggleAllVisible = (checked: boolean) => setSelectedIds((current) => {
    if (!canBulkSelect || loading) return current;
    const next = new Set(current);
    for (const record of filtered) {
      if (checked) next.add(record.id); else next.delete(record.id);
    }
    return next;
  });

  // The user's emoji style for the channel; "none" when the product's company has share emoji switched off.
  const emojiFor = (channel: "whatsapp" | "telegram", companyId: number) => shareEmojiStyle(shareEmoji.offCompanyIds.includes(companyId) ? "none" : shareEmoji[channel]);
  const chooseEmoji = async (channel: "whatsapp" | "telegram", style: string) => {
    const previous = shareEmoji[channel];
    setShareEmoji((current) => ({ ...current, [channel]: style }));
    try {
      const response = await fetch("/api/user-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [channel === "whatsapp" ? "shareEmojiWhatsapp" : "shareEmojiTelegram"]: style }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Could not save the emoji style.");
    } catch (error) {
      setShareEmoji((current) => ({ ...current, [channel]: previous }));
      toast.error(error instanceof Error ? error.message : "Could not save the emoji style.");
    }
  };
  const shareText = (channel: ShareChannel) => {
    if (!shareRecords.length) return "";
    // Items on a running Today Offer share the struck-through normal price, the offer price and when the offer ends.
    const offerByItem = new Map(runningOffers(offers).map((offer) => [offer.itemId, offer]));
    const items = shareRecords.map((record) => {
      const description = withUpgrades(record, shareSpecificationText(record));
      const emoji = channel === "email" ? shareEmojiStyle("none") : emojiFor(channel, record.companyId);
      // WhatsApp's Classic style keeps its plain detail lines; every other style marks them too.
      const lineEmoji = (mark: string) => channel === "email" || (channel === "whatsapp" && emoji.id === "classic") ? "" : mark;
      const marked = (mark: string, text: string) => lineEmoji(mark) ? `${lineEmoji(mark)} ${text}` : text;
      const title = channel === "email"
        ? `***${inventoryItemLine(record.name, record.sku, description, record.itemNumber, false)}***`
        : inventorySocialShareText(record.name, record.sku, description, channel, record.itemNumber, emoji);
      const lines = [title];
      // Product Customization Details (Screen Details and the rest) stay out of shared copies.
      const details: string[] = [];
      if (showQuantity) {
        const quantity = plainMoney(Number(record.quantity));
        details.push(channel === "email" ? `Quantity: ${quantity}` : marked(emoji.quantity, `Qty: ${quantity}`));
      }
      const offer = record.recordIds.map((id) => offerByItem.get(id)).find(Boolean);
      const offerText = showPrice && offer ? offerShareText({ channel, currency: priceCurrency, normalPrice: priceFor(record), offerPrice: priceFor({ salesPrice: offer.offerPrice }), endsAt: offer.endsAt, vatLabel: vatLabels[vatMode], mark: channel !== "email" && emoji.id !== "none" ? "🔥" : "", remaining: offerRemaining(offer) }) : null;
      if (showPrice) {
        const price = priceFor(record);
        const value = offerText?.price ?? `${priceCurrency} ${plainMoney(price)}${vatLabels[vatMode]}`;
        details.push(channel === "email" ? `Price: ${value}` : marked(emoji.price, value));
      }
      if (details.length) lines.push(details.join(" | "));
      if (offerText) lines.push(offerText.offerLine);
      return lines.filter(Boolean).join("\n");
    });
    return items.join(channel === "telegram" ? "\n──────────────\n" : "\n-------------------\n");
  };

  // Hidden when every listed company has share emoji switched off by its administrator.
  const emojiAllowed = records.some((record) => !shareEmoji.offCompanyIds.includes(record.companyId));
  // The emoji pickers shrink to their emoji below 110rem so the toolbar stays on one line on 15–32" screens.
  const emojiPicker = (channel: "whatsapp" | "telegram") => emojiAllowed ? <select aria-label={`${channel === "whatsapp" ? "WhatsApp" : "Telegram"} emoji style`} title={`${channel === "whatsapp" ? "WhatsApp" : "Telegram"} emoji style (saved for you)`} className="h-8 w-[7.5rem] rounded-md border border-input bg-card px-1.5 text-xs text-foreground @max-[110rem]:w-11 @max-[110rem]:px-1" value={shareEmoji[channel]} onChange={(event) => void chooseEmoji(channel, event.target.value)}>{shareEmojiStyles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}</select> : null;
  const channelName = (channel: ShareChannel) => channel === "whatsapp" ? "WhatsApp" : channel === "telegram" ? "Telegram" : "Email";
  const copyForChannel = async (channel: ShareChannel, edited?: string) => {
    if (!canSelectItems || loading) return;
    const text = edited ?? shareText(channel);
    if (!text) return noShareRecords("copy");
    try {
      // Telegram: put rich text (bold, italic, strikethrough, code, quotes) on the clipboard so it pastes already
      // formatted; the markdown stays as the plain-text fallback.
      if (channel === "telegram" && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([telegramHtml(text)], { type: "text/html" }) })]);
      } else await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast.success(`${channelName(channel)} format copied for ${shareRecords.length} selected ${shareRecords.length === 1 ? "item" : "items"}${leftOutText()}`);
  };
  // Edit before copying: the message opens in a text box for one-off changes; nothing typed there is saved.
  // WhatsApp-style formatting bar: change the selected words or lines, then keep them selected.
  const formatEditor = (apply: (text: string, start: number, end: number) => FormatResult) => {
    const field = editorRef.current;
    if (!field || !editor) return;
    const result = apply(editor.text, field.selectionStart, field.selectionEnd);
    setEditor({ ...editor, text: result.text });
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(result.start, result.end); });
  };
  const inlineTools: Record<InlineFormat, { label: string; Icon: typeof Bold }> = { bold: { label: "Bold", Icon: Bold }, italic: { label: "Italic", Icon: Italic }, underline: { label: "Underline", Icon: Underline }, strike: { label: "Strikethrough", Icon: Strikethrough }, code: { label: "Monospace", Icon: Code }, spoiler: { label: "Spoiler", Icon: EyeOff } };
  const toolButton = `grid size-8 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 ${editor?.channel === "telegram" ? "hover:bg-black/10 focus-visible:outline-zinc-900" : "hover:bg-white/15 focus-visible:outline-white"}`;
  // Telegram's Link tool: ask for the address and turn the selected words into a link.
  const insertLink = () => formatEditor((text, start, end) => {
    const url = window.prompt("Link address (https://…)", "https://");
    const result = url === null ? null : applyLink(text, start, end, url);
    if (url !== null && !result) toast.error("Enter a link that starts with http:// or https://");
    return result ?? { text, start, end };
  });
  const lineTools: Record<LineFormat, { label: string; Icon: typeof Bold }> = { numbered: { label: "Numbered list", Icon: ListOrdered }, bulleted: { label: "Bulleted list", Icon: ListIcon }, quote: { label: "Quote", Icon: Quote } };
  const openEditor = (channel: ShareChannel) => {
    if (!canSelectItems || loading) return;
    const text = shareText(channel);
    if (!text) return noShareRecords("edit");
    setEditor({ channel, text });
  };

  const exportExcel = (mode: VatMode) => {
    if (!canSelectItems || loading) return;
    const exportRecords = shareRecords;
    if (!exportRecords.length) return noShareRecords("export");
    const headers = ["Company", "Inventory", ...(warehouseFilter ? ["Warehouse"] : []), "Category", "Item No.", "SKU", "Item", "Specifications"];
    if (showQuantity) headers.push("Quantity");
    if (showPrice) headers.push(`${mode === "include" ? "Price including 5% VAT" : mode === "zero" ? "Price (0% VAT)" : "Export price excluding VAT"}${adjustLabel ? ` (${adjustLabel.trim()})` : ""}`, "Currency");
    // Running Today Offers: two extra columns, added only when an exported product has one.
    const offerByItem = new Map(runningOffers(offers).map((offer) => [offer.itemId, offer]));
    const offerFor = (record: ConsolidatedItem) => record.recordIds.map((id) => offerByItem.get(id)).find(Boolean);
    const offerColumns = showPrice && exportRecords.some((record) => offerFor(record));
    if (offerColumns) headers.push(`Today offer price${mode === "include" ? " including 5% VAT" : mode === "zero" ? " (0% VAT)" : ""}`, "Offer ends (UAE time)", "Offer quantity left");
    const headerRow = headers.map((header) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(header)}</Data></Cell>`).join("");
    const bodyRows = exportRecords.map((record) => {
      const values: Array<{ value: unknown; type?: "Number"; style?: string }> = [
        { value: record.companyName }, { value: record.inventories.map((inventory) => inventory.locationName).join(", ") }, ...(warehouseFilter ? [{ value: warehouseLabel.split(" · ").slice(1).join(" · ") || warehouseLabel }] : []), { value: record.category, style: `Category-${categoryColor(record.category, categoryColors).id}` },
        { value: record.itemNumber ?? "" }, { value: record.sku }, { value: record.name }, { value: withUpgrades(record, shareSpecificationText(record)) },
      ];
      if (showQuantity) values.push({ value: Number(record.quantity), type: "Number", style: "Number" });
      if (showPrice) values.push({ value: priceFor(record, mode), type: "Number", style: "Money" }, { value: priceCurrency });
      if (offerColumns) {
        const offer = offerFor(record);
        const remaining = offer ? offerRemaining(offer) : null;
        values.push(offer ? { value: priceFor({ salesPrice: offer.offerPrice }, mode), type: "Number", style: "Money" } : { value: "" }, { value: offer ? offerEndsText(offer.endsAt) : "" }, remaining === null ? { value: offer ? "No limit" : "" } : { value: remaining, type: "Number", style: "Number" });
      }
      return `<Row>${values.map((entry) => `<Cell${entry.style ? ` ss:StyleID="${entry.style}"` : ""}><Data ss:Type="${entry.type ?? "String"}">${xml(entry.value)}</Data></Cell>`).join("")}</Row>`;
    }).join("");
    // Category cells use their Inventory Overview colour (light shade; Excel has no dark mode).
    const categoryStyles = categoryPalette.map((color) => `<Style ss:ID="Category-${color.id}"><Interior ss:Color="${color.fill}" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="${color.ink}"/></Style>`).join("");
    const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default"><Alignment ss:Vertical="Top"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F172A" ss:Pattern="Solid"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="#,##0.##"/></Style><Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00"/></Style>${categoryStyles}</Styles><Worksheet ss:Name="Stock List"><Table><Column ss:Width="120"/><Column ss:Width="110"/>${warehouseFilter ? '<Column ss:Width="110"/>' : ""}<Column ss:Width="90"/><Column ss:Width="75"/><Column ss:Width="90"/><Column ss:Width="190"/><Column ss:Width="420"/><Column ss:Width="160"/><Row>${headerRow}</Row>${bodyRows}</Table></Worksheet></Workbook>`;
    const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `comnet-stock-${mode === "include" ? "vat-included" : mode === "zero" ? "zero-vat" : "export-no-vat"}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`${exportRecords.length} items exported for Excel${leftOutText()}`);
  };

  // Print: an A4 stock list of the selected items (or every listed item when none are selected). Quantities follow the
  // Warehouse filter like the copy buttons and Excel export; Hide qty / Hide price and the VAT format apply too.
  const printStockList = () => {
    if (loading) return;
    const list = selectedRecords.length ? shareRecords : filtered;
    if (!list.length) return selectedRecords.length ? noShareRecords("print") : toast.error("No items to print.");
    const money = (value: number) => value.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const headers = ["Item No.", "SKU", "Item", "Specifications", "Inventory", ...(warehouseFilter ? ["Warehouse"] : []), ...(showQuantity ? ["Qty"] : []), ...(showPrice ? [`Price${vatLabels[vatMode]}`] : [])];
    const numeric = new Set(["Qty", `Price${vatLabels[vatMode]}`]);
    const warehouseName = warehouseLabel.split(" · ").slice(1).join(" · ") || warehouseLabel;
    const body = list.map((record) => `<tr><td>${xml(record.itemNumber ?? "")}</td><td>${xml(record.sku)}</td><td><strong>${xml(record.name)}</strong></td><td>${xml(withUpgrades(record, specificationText(record)))}</td><td>${xml(record.inventories.map((inventory) => inventory.locationName).join(", "))}</td>${warehouseFilter ? `<td>${xml(warehouseName)}</td>` : ""}${showQuantity ? `<td class="num">${xml(plainMoney(Number(record.quantity)))}</td>` : ""}${showPrice ? `<td class="num">${xml(`${priceCurrency} ${money(priceFor(record))}`)}</td>` : ""}</tr>`).join("");
    const totalQuantity = list.reduce((sum, record) => sum + Number(record.quantity), 0);
    const footer = showQuantity ? `<tfoot><tr><td colspan="${headers.length - 1 - Number(showPrice)}">Total quantity</td><td class="num">${xml(plainMoney(totalQuantity))}</td>${showPrice ? "<td></td>" : ""}</tr></tfoot>` : "";
    const companies = [...new Set(list.map((record) => record.companyName))].join(", ");
    const printedAt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
    const meta = [companies, warehouseLabel || "All warehouses", `${list.length} ${list.length === 1 ? "item" : "items"}`, `Printed ${printedAt}`].filter(Boolean).join(" · ");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stock List</title><style>@page{size:A4 ${printOrientation};margin:12mm}body{margin:0;font:9.5pt Arial,Helvetica,sans-serif;color:#0f172a}h1{margin:0;font-size:16pt}p{margin:4px 0 12px;color:#475569}table{width:100%;border-collapse:collapse}th{background:#0f172a;color:#fff;text-align:left;padding:5px 6px;font-size:8.5pt}td{border-bottom:1px solid #cbd5e1;padding:5px 6px;vertical-align:top}tfoot td{border-top:2px solid #0f172a;border-bottom:0;font-weight:700}.num{text-align:right;white-space:nowrap}tr{break-inside:avoid}thead{display:table-header-group}</style></head><body><h1>Stock List</h1><p>${xml(meta)}</p><table><thead><tr>${headers.map((header) => `<th${numeric.has(header) ? ' class="num"' : ""}>${xml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody>${footer}</table></body></html>`;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60_000); };
    frame.srcdoc = html;
    document.body.appendChild(frame);
    const skipped = selectedRecords.length - shareRecords.length;
    if (selectedRecords.length && skipped) toast.info(`${skipped} selected ${skipped === 1 ? "item has" : "items have"} no stock in ${warehouseLabel} and ${skipped === 1 ? "is" : "are"} not printed.`);
  };

  // Full-width filter chips; the active chip uses the user's accent colour and each count keeps its status colour.
  const chip = (active: boolean) => `inline-flex h-9 min-w-0 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold transition-colors ${active ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary" : "border-border bg-card text-foreground/80 hover:border-foreground/30 hover:text-foreground"}`;
  const countPill = "inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums";
  const toggleFilter = (next: StockFilter) => setFilter((current) => current === next ? "all" : next);
  const columnCount = 2 + Number(showQuantity) + Number(showPrice);
  // Out of stock is not offered as a filter chip (removed on request); rows still show their status.
  const statusChips = [
    { id: "in" as const, label: "In stock", value: totals.inStock, Icon: PackageCheck, icon: "text-emerald-500", pill: "bg-emerald-400 text-slate-950", title: `Products in stock (${totals.healthy} healthy)` },
    { id: "low" as const, label: "Low stock", value: totals.low, Icon: TriangleAlert, icon: "text-amber-500", pill: "bg-amber-400 text-slate-950", title: "At or below reorder point" },
    { id: "hold" as const, label: "On hold", value: statusCounts.hold, Icon: Lock, icon: "text-amber-500", pill: "bg-amber-300 text-slate-950", title: "Reserved for sales reps" },
  ];
  const activityTabs = [
    { id: "incoming" as const, label: "Incoming", Icon: PlaneLanding, count: activity.incoming.length, badge: "bg-amber-400 text-slate-950" },
    { id: "launched" as const, label: "New Arrival", Icon: Rocket, count: activity.launched.length, badge: "bg-rose-600 text-white" },
    { id: "priceChanges" as const, label: "Price Change", Icon: BadgeDollarSign, count: activity.priceChanges.length, badge: "bg-sky-400 text-slate-950" },
    { id: "sold" as const, label: "Just Sold", Icon: ShoppingCart, count: activity.sold.length, badge: "bg-emerald-400 text-slate-950" },
    { id: "offers" as const, label: "Today Offer", Icon: Tag, count: runningOffers(offers, loadedAt).length, badge: "bg-violet-600 text-white" },
  ];
  const activityEmpty = activityView === "incoming" ? "No open purchase-order quantities." : activityView === "launched" ? "No bill receipts in the last 12 hours." : activityView === "priceChanges" ? "No selling-price changes in the last 12 hours." : "No recent invoice or sales-receipt lines.";
  const shareDisabled = !canSelectItems || loading || !selectedRecords.length;

  return <div className="space-y-4">
    {/* Filter bar: inventories, stock status and received date in one full-width, colour-coded row. */}
    <section className="rounded-xl border bg-card p-2 shadow-sm" aria-label="Stock filters">
      <div className="flex w-full flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={chip(filter === "all")} title="All inventory"><Boxes className="size-4 shrink-0 text-sky-500" />All<span className={`${countPill} bg-sky-400 text-slate-950`}>{totals.quantity.toLocaleString()}</span></button>
        {locations.map((location) => <button key={location.id} type="button" onClick={() => toggleFilter(`location:${location.id}`)} aria-pressed={filter === `location:${location.id}`} title={location.company} className={chip(filter === `location:${location.id}`)}><Warehouse className="size-4 shrink-0 text-sky-500" /><span className="max-w-40 truncate">{location.location || location.company}</span><span className={`${countPill} bg-muted text-foreground`}>{location.quantity.toLocaleString()}</span></button>)}
        {statusChips.map(({ id, label, value, Icon, icon, pill, title }) => <button key={id} type="button" onClick={() => toggleFilter(id)} aria-pressed={filter === id} title={title} className={chip(filter === id)}><Icon className={`size-4 shrink-0 ${icon}`} /><span className="truncate">{label}</span><span className={`${countPill} ${pill}`}>{value.toLocaleString()}</span></button>)}
        <button type="button" onClick={() => toggleFilter("recent7")} aria-pressed={filter === "recent7"} title="Received in the last 7 days" className={chip(filter === "recent7")}><CalendarClock className="size-4 shrink-0 text-violet-500" />7 days</button>
        <button type="button" onClick={() => toggleFilter("recent30")} aria-pressed={filter === "recent30"} title="Received in the last 30 days" className={chip(filter === "recent30")}><CalendarClock className="size-4 shrink-0 text-violet-500" />30 days</button>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className={`grid grid-cols-2 sm:grid-cols-5 ${activityOpen ? "border-b" : ""}`}>
        {activityTabs.map(({ id, label, Icon, count, badge }) => <button key={id} type="button" onClick={() => { if (activityOpen && activityView === id) setActivityOpen(false); else { setActivityView(id); setActivityOpen(true); } }} className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 border-r border-b px-2 text-[13px] font-semibold xl:gap-2 xl:px-3 xl:text-sm transition-colors even:border-r-0 last:col-span-2 last:border-r-0 sm:last:col-span-1 sm:border-b-0 sm:even:border-r sm:last:border-r-0 ${activityOpen && activityView === id ? "bg-muted/40 text-foreground shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`} aria-expanded={activityOpen && activityView === id}>
          <Icon className="size-4 shrink-0" /><span className="truncate">{label}</span><Badge className={`${badge} h-5 min-w-6 justify-center px-1.5 text-[11px] hover:opacity-90`}>{count}</Badge><ChevronDown className="hidden size-4 shrink-0 opacity-60 2xl:block transition-transform data-[open=true]:rotate-180" data-open={activityOpen && activityView === id} />
        </button>)}
      </div>
      {activityOpen && activityView === "offers" ? <TodayOffersPanel offers={offers} items={records} canManage={canManageOffers} loading={loading} onChanged={() => void load()} onOpenItem={(offer) => onOpenItem ? onOpenItem(offer.itemId) : window.dispatchEvent(new CustomEvent("inventory-activity-open", { detail: { kind: "item", id: offer.itemId, companyId: offer.companyId, locationId: offer.locationId, sku: offer.sku } }))} /> : null}
      {activityOpen && activityView !== "offers" ? <><div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader><TableRow><TableHead className="w-32">Date</TableHead><TableHead>Item</TableHead><TableHead>Company · inventory</TableHead><TableHead>Linked area</TableHead><TableHead>Activity</TableHead><TableHead className="w-24 text-right">Open</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground"><RefreshCw className="mx-auto mb-2 size-5 animate-spin" />Loading inventory activity…</TableCell></TableRow> : visibleActivity.length ? visibleActivity.map((entry) => {
              const linkedDocument = activityView === "incoming" || activityView === "launched" || activityView === "sold";
              return <TableRow key={`${activityView}-${entry.id}`} className="align-top">
                <TableCell className="whitespace-nowrap font-medium">{activityDate(entry.date)}</TableCell>
                <TableCell><p className="font-semibold text-primary">{entry.itemName}</p><p className="mt-1 text-xs text-muted-foreground">SKU {entry.sku}{entry.itemNumber ? ` · #${entry.itemNumber}` : ""}</p></TableCell>
                <TableCell><p className="font-medium">{entry.companyName}</p><p className="mt-1 text-xs text-muted-foreground">{entry.locationName || "All inventories"}</p></TableCell>
                <TableCell>{linkedDocument ? <><p className="font-mono font-semibold">{activityView === "incoming" ? "Purchase Order " : ""}{entry.documentNumber}</p><p className="mt-1 text-xs text-muted-foreground">{entry.party || (activityView === "sold" ? "Customer" : "Supplier")}</p>{activityView === "incoming" ? <p className={`mt-2 inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${entry.linkedBillNumber ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{entry.linkedBillNumber ? `Partially converted to Bill ${entry.linkedBillNumber}` : "Ready to convert to Bill"}</p> : null}{activityView === "sold" ? <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><UserRound className="size-3" />Sales rep: {entry.salesRep || "Not assigned"}</p> : null}</> : <span className="text-sm font-medium">Selling price update</span>}</TableCell>
                <TableCell>{activityView === "priceChanges" ? <><p className="font-semibold"><span className="text-muted-foreground line-through">{money(Number(entry.previousPrice), entry.currency)}</span><span className="mx-2">→</span><span className="text-emerald-600">{money(Number(entry.currentPrice), entry.currency)}</span></p></> : <><p className="font-semibold">{Number(entry.quantity).toLocaleString("en-AE")} {activityView === "sold" ? "sold" : activityView === "incoming" ? "incoming" : "received"}</p><p className="mt-1 text-xs text-muted-foreground">{money(Number(entry.price), entry.currency)} each</p></>}</TableCell>
                <TableCell className="text-right">{linkedDocument && entry.transactionId ? <Button type="button" size="sm" variant="outline" onClick={() => openActivityRecord(entry, "document")}><Eye className="size-4" />{activityView === "incoming" ? "View PO" : "View"}</Button> : <Button type="button" size="sm" variant="outline" onClick={() => openActivityRecord(entry, "item")}><Eye className="size-4" />Item</Button>}</TableCell>
              </TableRow>;
            }) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{activityEmpty}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">Incoming shows outstanding Purchase Order quantities. Open the PO to convert the remaining items to a Bill. New Arrival shows stock received through Enter Bill for 12 hours after saving. Price Change shows each item once with its latest change for 12 hours. Just Sold keeps the sales representative from the original sale.</div></> : null}
    </section>

    <StockHoldsPanel holds={holds} names={holdNames} canManage={canManageHolds} onReleased={() => void load()} />

    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      {/* Header: title, print (with the A4 orientation), search and refresh. */}
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0"><h2 className="text-base font-bold text-foreground">Consolidated stock</h2><p className="hidden truncate text-xs text-muted-foreground sm:block">All companies, inventories, item details, quantities and selling prices.</p></div>
        <div className="ml-auto flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" className="h-9 shrink-0" disabled={loading || (!selectedRecords.length && !filtered.length)} onClick={printStockList} title={selectedRecords.length ? "Print the selected items" : "Print the listed items"} aria-label="Print stock list"><Printer className="size-4" /><span className="hidden sm:inline">Print</span></Button>
            <select aria-label="A4 print orientation" title="A4 print orientation" className="h-9 w-24 shrink-0 rounded-md border border-input bg-card px-2 text-sm text-foreground" value={printOrientation} onChange={(event) => setPrintOrientation(event.target.value as PrintOrientation)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
          </div>
          <div className="flex min-w-[16rem] flex-1 gap-2">
            <div className="relative min-w-0 flex-1 sm:w-96 sm:flex-none"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, item, specs or inventory…" className="h-9 pl-9" /></div>
            <Button variant="outline" size="icon" className="size-9" onClick={load} disabled={loading} aria-label="Refresh inventory overview"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button>
          </div>
        </div>
      </div>

      {inactiveSearchMatches.length > 0 && <InactiveItemNotice compact matches={inactiveSearchMatches} companyId={companyId}
        onOpen={(item) => window.dispatchEvent(new CustomEvent("inventory-activity-open", { detail: { kind: "item", id: item.id, companyId: item.companyId, locationId: item.locationId, sku: item.sku, inactive: true } }))}
        onReactivated={canReactivateItems ? () => void load() : undefined} />}

      {/* Filters: category, brand, condition and price range. */}
      <div className="border-b bg-muted/20 px-4 py-3" aria-label="Filters">
        {/* Phones use a two-column grid so the filters never overlap; wider screens keep one wrapping row. */}<div className="grid grid-cols-[repeat(2,minmax(0,1fr))] items-end gap-3 sm:flex sm:flex-wrap">
          <label className="grid min-w-0 flex-1 gap-1 sm:min-w-40 text-xs font-medium text-muted-foreground sm:flex-none">Category<select className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-sm text-foreground" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="grid min-w-0 flex-1 gap-1 sm:min-w-36 text-xs font-medium text-muted-foreground sm:flex-none">Brand<select className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-sm text-foreground" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="">All brands</option>{brandOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="grid min-w-0 flex-1 gap-1 sm:min-w-36 text-xs font-medium text-muted-foreground sm:flex-none">Condition<select className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-sm text-foreground" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="">All conditions</option>{conditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          {warehouseOptions.length > 0 && <label className="grid min-w-0 flex-1 gap-1 sm:min-w-44 text-xs font-medium text-muted-foreground sm:flex-none">Warehouse<select className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-sm text-foreground" value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}><option value="">All warehouses</option>{warehouseOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
          <div className="col-span-2 grid gap-1 text-xs font-medium text-muted-foreground">Selling price (excl. VAT)<div className="flex items-center gap-1.5"><Input aria-label="Minimum price" type="number" min="0" inputMode="decimal" placeholder="Min" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} className="h-9 min-w-0 flex-1 sm:w-24 sm:flex-none" /><span>–</span><Input aria-label="Maximum price" type="number" min="0" inputMode="decimal" placeholder="Max" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} className="h-9 min-w-0 flex-1 sm:w-24 sm:flex-none" /></div></div>
          {(extraFilters || filter !== "all") && <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { clearExtraFilters(); setFilter("all"); }}><X className="size-4" />Clear filters</Button>}
          <span className="ml-auto self-center text-xs text-muted-foreground"><strong className="text-foreground tabular-nums">{filtered.length}</strong> {filtered.length === 1 ? "product" : "products"}</span>
        </div>
      </div>

      {onCreateDocument && cart.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b bg-rose-500/5 px-4 py-2.5" aria-label="Cart">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="size-4 text-rose-600" />Cart: {cart.length} {cart.length === 1 ? "product" : "products"} · {cartUnits.toLocaleString()} {cartUnits === 1 ? "unit" : "units"}</span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" className="h-8"><Eye className="size-3.5" />View cart<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-2">
            <ul className="max-h-72 space-y-1 overflow-y-auto">{cart.map((entry) => <li key={entry.key} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{entry.name}</span><span className="block truncate font-mono text-[11px] text-muted-foreground">{entry.sku}</span></span><Input type="number" min="1" step="1" aria-label={`Quantity of ${entry.name}`} className="h-8 w-20 text-right" value={entry.quantity} onChange={(event) => { const quantity = Number(event.target.value); if (Number.isFinite(quantity) && quantity > 0) setCart((current) => current.map((item) => item.key === entry.key ? { ...item, quantity } : item)); }} /><Button type="button" size="icon" variant="ghost" className="size-8 text-rose-600" aria-label={`Remove ${entry.name} from the cart`} onClick={() => setCart((current) => current.filter((item) => item.key !== entry.key))}><Trash2 className="size-4" /></Button></li>)}</ul>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setCart([])}>Clear</Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild><Button type="button" size="sm" className="h-8 bg-gradient-to-r from-rose-600 to-orange-500 text-white hover:from-rose-700 hover:to-orange-600"><FilePlus2 className="size-3.5" />Create<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">{cartDocuments.map(([type, label]) => <DropdownMenuItem key={type} onSelect={() => createFromCart(type)}>{label}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>}
      {/* Share bar: price display options on the left, copy and export actions on the right. Labels collapse to icons before the row wraps. */}
      <div className="@container flex flex-wrap items-center gap-1.5 border-b px-4 py-2 whitespace-nowrap [&_[data-slot=button]]:h-8 [&_[data-slot=button]]:gap-1.5 [&_[data-slot=button]]:px-2.5 [&_[data-slot=button]]:text-xs [&_[data-slot=button]_svg]:size-3.5">
        <span className={`inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold tabular-nums ${selectedRecords.length ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`} title={`${selectedRecords.length} selected`}>{selectedRecords.length}<span className="@max-[91rem]:hidden">&nbsp;selected</span></span>
        <label title="Hide qty in what is shown and shared" className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium text-muted-foreground @max-[91rem]:gap-1 @max-[91rem]:px-1.5"><Checkbox aria-label="Hide qty" checked={!showQuantity} onCheckedChange={(checked) => setShowQuantity(checked !== true)} /><EyeOff className="hidden size-3.5 @max-[91rem]:block" /><span className="@max-[91rem]:hidden">Hide </span>qty</label>
        <label title="Hide price in what is shown and shared" className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium text-muted-foreground @max-[91rem]:gap-1 @max-[91rem]:px-1.5"><Checkbox aria-label="Hide price" checked={!showPrice} onCheckedChange={(checked) => setShowPrice(checked !== true)} /><EyeOff className="hidden size-3.5 @max-[91rem]:block" /><span className="@max-[91rem]:hidden">Hide </span>price</label>
        <div className="flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium text-muted-foreground" role="group" aria-label="Increase shown and shared prices" title="Adds to the prices shown here and in WhatsApp, Telegram, email and Excel. Saved selling prices do not change."><span className="@max-[91rem]:hidden">Price</span> +<Input aria-label="Price increase" type="number" min="0" step="0.01" inputMode="decimal" disabled={!showPrice} value={priceAdjust.value} onChange={(event) => setPriceAdjust({ ...priceAdjust, value: event.target.value })} placeholder="0" className="h-6 w-12 px-1.5 text-xs" /><select aria-label="Increase as percent or amount" disabled={!showPrice} value={priceAdjust.mode} onChange={(event) => setPriceAdjust({ ...priceAdjust, mode: event.target.value as PriceAdjust["mode"] })} className="h-6 w-12 rounded border border-input bg-card px-1 text-xs text-foreground"><option value="percent" title="Percent">%</option><option value="amount" title={`Amount in ${baseCurrency}`}>{baseCurrency}</option></select></div>
        {/* Price currency: the base currency, or USD / EUR at the company's saved exchange rate. */}
        <select aria-label="Shown and shared price currency" title={shareCurrency ? `Prices converted from ${baseCurrency} to ${shareCurrency} at ${shareRate ?? "—"} ${baseCurrency} per 1 ${shareCurrency} (Currencies). Saved prices do not change.` : `Prices in ${baseCurrency}. Pick USD or EUR to convert with the company's saved exchange rates.`} disabled={!showPrice} value={shareCurrency && shareRate ? shareCurrency : ""} onChange={(event) => pickShareCurrency(event.target.value)} className="h-8 w-16 shrink-0 rounded-md border border-input bg-card px-1.5 text-xs font-medium text-foreground disabled:opacity-50">
          <option value="">{baseCurrency}</option>
          {shareCurrencies.filter((code) => code !== baseCurrency).map((code) => <option key={code} value={code} title={shareCurrencyOption(code)}>{code}{shareCurrencyRate(exchangeRates, baseCurrency, code) ? "" : " · no rate"}</option>)}
        </select>
        {/* Shared price VAT format as a dropdown; No VAT (net) is the default. */}
        <select aria-label="Shared price VAT format" title={vatModes.find(([mode]) => mode === vatMode)?.[2]} disabled={!showPrice} value={vatMode} onChange={(event) => setVatMode(event.target.value as VatMode)} className="h-8 shrink-0 rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground disabled:opacity-50">
          {vatModes.map(([mode, label, title]) => <option key={mode} value={mode} title={title}>{label}</option>)}
        </select>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Button size="sm" disabled={shareDisabled} onClick={() => copyForChannel("whatsapp")} title="Copy WhatsApp format" aria-label="Copy WhatsApp format" className="bg-[#25D366] text-[#052e16] hover:bg-[#1fb558]"><WhatsAppIcon /><span className="@max-[91rem]:hidden">WhatsApp</span></Button>
          {emojiPicker("whatsapp")}
          <Button size="sm" disabled={shareDisabled} onClick={() => copyForChannel("telegram")} title="Copy Telegram format" aria-label="Copy Telegram format" className="bg-[#1a77ad] text-white hover:bg-[#15638f]"><TelegramIcon /><span className="@max-[91rem]:hidden">Telegram</span></Button>
          {emojiPicker("telegram")}
          <Button size="sm" variant="outline" disabled={shareDisabled} onClick={() => copyForChannel("email")} title="Copy email format" aria-label="Copy email format"><Mail /><span className="@max-[91rem]:hidden">Email</span></Button>
          {emailFrom && emailFrom.role !== "viewer" ? <Button size="sm" variant="outline" disabled={loading} onClick={() => setEmailOpen(true)} title="Email your Sales or Purchase list: the selected items, or your own message when none is selected" aria-label="Send by email"><Send /><span className="@max-[91rem]:hidden">Send</span></Button> : null}
          <Button size="sm" variant="outline" disabled={shareDisabled} onClick={() => openEditor("whatsapp")} title="Edit the message before copying" aria-label="Edit the message before copying"><Pencil /><span className="@max-[91rem]:hidden">Edit</span></Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={shareDisabled} title="Export Excel" aria-label="Export Excel"><FileSpreadsheet /><span className="@max-[91rem]:hidden">Excel</span><ChevronDown /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportExcel("exclude")}><Download className="size-4" />Excel — No VAT</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportExcel("include")}><FileSpreadsheet className="size-4" />Excel — + VAT (5%)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportExcel("zero")}><FileSpreadsheet className="size-4" />Excel — 0% VAT</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-hidden">
        <Table className="w-full table-fixed">
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="w-12"><Checkbox disabled={!canBulkSelect || loading || !filtered.length} aria-label="Select all visible items" checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /></TableHead><TableHead className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</TableHead>{showQuantity && <TableHead responsiveColumn="quantity" className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</TableHead>}{showPrice && <TableHead responsiveColumn="price" className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price{adjustLabel}</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={columnCount} className="h-40 text-center text-muted-foreground"><RefreshCw className="mx-auto mb-2 size-5 animate-spin" />Loading all inventories…</TableCell></TableRow> : categories.length === 0 ? <TableRow><TableCell colSpan={columnCount} className="h-40 text-center text-muted-foreground"><PackageX className="mx-auto mb-2 size-6 opacity-60" />No products match this view.</TableCell></TableRow> : visibleCategories.flatMap(([category, items, total]) => [
              <TableRow key={`category-${category}`} className="hover:bg-transparent"><TableCell colSpan={columnCount} className={`border-l-4 py-2 text-xs font-bold uppercase tracking-wide ${categoryColor(category, categoryColors).row} ${categoryColor(category, categoryColors).text}`}><span className="flex items-center gap-2"><span className={`inline-block size-2.5 rounded-full ${categoryColor(category, categoryColors).dot}`} />{category}<span className="font-medium normal-case tracking-normal opacity-75">{total} {total === 1 ? "item" : "items"}</span>{canManageCategories ? <span className="ml-auto normal-case tracking-normal"><CategoryColorPicker compact category={category} saved={categoryColors} onSaved={setCategoryColors} /></span> : null}</span></TableCell></TableRow>,
              ...items.map((record) => {
                const out = Number(record.quantity) <= 0;
                const low = Number(record.quantity) > 0 && Number(record.quantity) <= Number(record.reorderPoint);
                const held = heldOn(record);
                const description = inventoryItemLine(record.name, record.sku, withUpgrades(record, shareSpecificationText(record, true)), record.itemNumber);
                const canUpgrade = upgradeFields(record).length > 0;
                const picked = Object.entries(upgrades[record.id] ?? {}).filter(([, value]) => value) as Array<[CustomizationOptionField, string]>;
                const itemNumber = String(record.itemNumber ?? "").normalize("NFKC").trim().toLocaleUpperCase("en").replace(/^#/, "");
                // The line is plain text (Details opens the product popup); the part number and #Item No. in it copy on hover or click.
                const numberShown = Boolean(itemNumber) && description.endsWith(`#${itemNumber}`);
                const lineText = numberShown ? description.slice(0, -itemNumber.length - 1).trimEnd() : description;
                // Part number: the saved field when it is written in the line, else the code found in the line itself.
                const savedPart = partNumberOf(record);
                const partNumber = savedPart && lineText.includes(savedPart) ? savedPart : partNumberInLine(lineText) || savedPart;
                const partAt = partNumber ? lineText.lastIndexOf(partNumber) : -1;
                return <TableRow key={record.id} data-state={selectedIds.has(record.id) ? "selected" : undefined} className="align-top hover:bg-muted/30 data-[state=selected]:bg-primary/10">
                  <TableCell className="py-4"><Checkbox className="mt-0.5" disabled={!canSelectItems || loading} aria-label={`Select ${record.name}`} checked={selectedIds.has(record.id)} onCheckedChange={(checked) => toggleSelected(record.id, checked === true)} /></TableCell>
                  <TableCell className="min-w-0 overflow-hidden py-4">
                    <p className="w-full max-w-full whitespace-normal break-words text-sm font-semibold leading-snug text-foreground sm:text-[15px] [overflow-wrap:anywhere]">{partAt >= 0 ? <>{lineText.slice(0, partAt)}<CopyOnHover value={partNumber} label="Part No." />{lineText.slice(partAt + partNumber.length)}</> : lineText}{numberShown ? <> <CopyOnHover value={itemNumber} display={`#${itemNumber}`} label="Item No." /></> : null}</p>
                    <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${out ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : low ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}><span className={`size-1.5 rounded-full ${out ? "bg-rose-500" : low ? "bg-amber-500" : "bg-emerald-500"}`} />{out ? "Out of stock" : low ? "Low stock" : "In stock"}</span>
                      {partNumber && partAt < 0 && <span className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-muted-foreground">Part No. <CopyOnHover value={partNumber} label="Part No." /></span>}
                      {record.inventories.map((inventory) => <span key={inventory.locationId} className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200" title={`${inventory.companyName} · Qty ${Number(inventory.quantity).toLocaleString()}`}><Warehouse className="size-3 shrink-0" /><span className="truncate">{inventory.locationName}</span>{record.inventories.length > 1 && <span className="font-semibold tabular-nums text-foreground">{Number(inventory.quantity).toLocaleString()}</span>}</span>)}
                      {!warehouseFilter && record.inventories.flatMap((inventory) => (inventory.warehouses ?? []).filter((share) => share.quantity !== 0).map((share) => <span key={`${inventory.locationId}:${share.warehouseId}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={`${inventory.locationName} · ${share.name}`}>{share.name}<span className="font-semibold tabular-nums text-foreground">{share.quantity.toLocaleString()}</span></span>))}
                      {held > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300"><Lock className="size-3" />{held.toLocaleString()} on hold</span>}
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200"><Clock className="size-3" />{receivedAge(record.latestReceivedAt)}</span>
                      {picked.map(([field, value]) => <span key={field} className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300" title={`${customizationFieldLabels[field]} upgrade (in your copies only)`}><ArrowUpCircle className="size-3 shrink-0" /><span className="truncate">{value}</span></span>)}
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDetailRecord(record)} aria-label={`View product customization details for ${record.name}`}><PackageOpen className="size-3.5" />Details</Button>
                        {canUpgrade && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setUpgradeRecord(record)} aria-label={`Choose upgrades for ${record.name}`}><ArrowUpCircle className="size-3.5" />Upgrade</Button>}
                        {canManageHolds && Number(record.quantity) > 0 && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setHoldTarget(record)} aria-label={`Put ${record.name} on hold`}><Lock className="size-3.5" />Hold</Button>}
                        {onCreateDocument && <span className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-muted/60 p-0.5"><Input type="number" min="1" step="1" inputMode="numeric" aria-label={`Quantity of ${record.name} to add`} className="h-7 w-16 border-0 bg-background text-center text-sm" value={cartQuantities[record.id] ?? "1"} onChange={(event) => setCartQuantities((current) => ({ ...current, [record.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addToCart(record); } }} /><Button type="button" size="sm" className="h-7 gap-1.5 bg-gradient-to-r from-rose-600 to-orange-500 px-2.5 text-xs font-semibold text-white hover:from-rose-700 hover:to-orange-600" onClick={() => addToCart(record)} aria-label={`Add ${record.name} to the cart`}><ShoppingCart className="size-3.5" />Add to Cart</Button></span>}
                      </span>
                    </div>
                  </TableCell>
                  {showQuantity && <TableCell responsiveColumn="quantity" className="py-4 text-right"><span className={`block text-lg font-bold leading-tight tabular-nums ${out ? "text-rose-600 dark:text-rose-400" : low ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{Number(record.quantity).toLocaleString()}</span>{held > 0 ? <span className="mt-0.5 block whitespace-nowrap text-[11px] font-medium text-amber-700 dark:text-amber-300">{Math.max(0, Number(record.quantity) - held).toLocaleString()} free · {held.toLocaleString()} held</span> : <span className="mt-0.5 block text-[11px] text-muted-foreground">units</span>}</TableCell>}
                  {showPrice && <TableCell responsiveColumn="price" className="py-4 text-right"><span className="block text-base font-bold leading-tight tabular-nums text-foreground">{money(priceFor(record), priceCurrency)}</span><span className={`mt-0.5 block whitespace-normal text-[11px] ${vatMode === "include" ? "font-semibold text-emerald-600 dark:text-emerald-400" : vatMode === "zero" ? "font-semibold text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`}>{vatMode === "include" ? "VAT included" : vatMode === "zero" ? "0% VAT" : "excl. VAT"}</span></TableCell>}
                </TableRow>;
              }),
            ])}
            {!loading && hiddenRows > 0 ? <TableRow ref={moreRowsRef} className="hover:bg-transparent"><TableCell colSpan={columnCount} className="py-3 text-center"><Button type="button" variant="outline" size="sm" onClick={showMoreRows}>Show more <span className="text-muted-foreground">({hiddenRows.toLocaleString()} more)</span></Button></TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground"><span>Showing {filtered.length} products</span><span>{totals.healthy} healthy · {totals.low} low stock</span></div>
    </section>

    {emailFrom && emailOpen ? <InventoryEmailDialog open={emailOpen} onOpenChange={setEmailOpen} companyId={emailFrom.companyId} companyName={emailFrom.companyName} role={emailFrom.role} sender={{ name: emailFrom.name, email: emailFrom.email }} itemsText={shareText("email").replace(/\*\*\*/g, "")} itemCount={shareRecords.length} itemLines={shareRecords.map((record) => inventoryLineParts(record.name, record.sku, shareSpecificationText(record), record.itemNumber))} /> : null}
    <StockHoldDialog key={holdTarget?.id ?? "none"} target={holdTarget} holds={holds} onClose={() => setHoldTarget(null)} onSaved={() => { setHoldTarget(null); void load(); }} />
    <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Edit before copying</DialogTitle><DialogDescription>Change any words for this message only, then copy. Your emoji style and selected items fill it in; edits are not saved.</DialogDescription></DialogHeader>
      {editor && <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Message format">{(["whatsapp", "telegram", "email"] as const).map((channel) => <Button key={channel} type="button" size="sm" variant={editor.channel === channel ? "default" : "outline"} aria-pressed={editor.channel === channel} onClick={() => { if (editor.channel !== channel && (editor.text === shareText(editor.channel) || window.confirm("Switch format? Your edits to this message will be replaced."))) setEditor({ channel, text: shareText(channel) }); }}>{channelName(channel)}</Button>)}</div>
        <div role="toolbar" aria-label="Text formatting" className={`flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-full px-2 py-1 ${editor.channel === "telegram" ? "bg-white text-zinc-900 shadow-md ring-1 ring-black/10 dark:bg-zinc-100" : "bg-zinc-900 text-white shadow-sm dark:bg-zinc-800"}`}>
          {inlineFormatsFor(editor.channel).map((format) => { const { label, Icon } = inlineTools[format]; return <button key={format} type="button" title={label} aria-label={label} className={toolButton} onMouseDown={(event) => event.preventDefault()} onClick={() => formatEditor((text, start, end) => applyInlineFormat(text, start, end, format, editor.channel === "telegram" ? "telegram" : "whatsapp"))}><Icon className="size-4" /></button>; })}
          {(editor.channel === "telegram" ? ["quote"] as LineFormat[] : Object.keys(lineTools) as LineFormat[]).map((format) => { const { label, Icon } = lineTools[format]; return <button key={format} type="button" title={label} aria-label={label} className={toolButton} onMouseDown={(event) => event.preventDefault()} onClick={() => formatEditor((text, start, end) => applyLineFormat(text, start, end, format))}><Icon className="size-4" /></button>; })}
          {editor.channel === "telegram" ? <><span aria-hidden="true" className="mx-1 h-5 w-px bg-black/15" /><button type="button" title="Link" aria-label="Link" className={toolButton} onMouseDown={(event) => event.preventDefault()} onClick={insertLink}><LinkIcon className="size-4" /></button></> : null}
        </div>
        <Textarea ref={editorRef} aria-label={`${channelName(editor.channel)} message`} rows={14} className="min-h-64 resize-y font-mono text-sm" value={editor.text} onChange={(event) => setEditor({ ...editor, text: event.target.value })} />
      </div>}
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" disabled={!editor} onClick={() => editor && setEditor({ ...editor, text: shareText(editor.channel) })}>Reset text</Button>
        <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button type="button" disabled={!editor?.text.trim()} onClick={() => { if (!editor) return; void copyForChannel(editor.channel, editor.text); setEditor(null); }}>Copy {editor ? channelName(editor.channel) : ""}</Button></div>
      </DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={Boolean(upgradeRecord)} onOpenChange={(open) => { if (!open) setUpgradeRecord(null); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Upgrade</DialogTitle><DialogDescription>{upgradeRecord ? `${upgradeRecord.name} · SKU ${upgradeRecord.sku}. Changes your line, copies, print and Excel only; nothing is saved.` : ""}</DialogDescription></DialogHeader>{upgradeRecord ? <div className="space-y-3">{upgradeFields(upgradeRecord).map((field) => <label key={field} className="block space-y-1"><span className="text-sm font-semibold">{customizationFieldLabels[field]}</span><span className="block text-xs text-muted-foreground">Now: {customizationBoxValue(upgradeRecord, field) || "Not entered"}</span><select aria-label={`${customizationFieldLabels[field]} upgrade for ${upgradeRecord.name}`} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground" value={upgrades[upgradeRecord.id]?.[field] ?? ""} onChange={(event) => pickUpgrade(upgradeRecord, field, event.target.value)}><option value="">As listed (no upgrade)</option>{upgradeOptions[field].map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>)}{customizationOptionFields.some((field) => !upgradeFields(upgradeRecord).includes(field) && isOnboardValue(customizationBoxValue(upgradeRecord, field))) ? <p className="text-xs text-muted-foreground">Onboard (cannot be upgraded): {customizationOptionFields.filter((field) => isOnboardValue(customizationBoxValue(upgradeRecord, field))).map((field) => customizationFieldLabels[field]).join(", ")}</p> : null}</div> : null}<DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={() => { if (upgradeRecord) setUpgrades((current) => { const next = { ...current }; delete next[upgradeRecord.id]; return next; }); }}>Clear upgrades</Button><Button type="button" onClick={() => setUpgradeRecord(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(detailRecord)} onOpenChange={(open) => { if (!open) setDetailRecord(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Product Customization Details</DialogTitle><DialogDescription>{detailRecord ? `${detailRecord.name} · SKU ${detailRecord.sku} · Item #${detailRecord.itemNumber || "—"}` : "Product details"}</DialogDescription></DialogHeader>{detailRecord ? <div className="space-y-5"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400">{receivedAge(detailRecord.latestReceivedAt)}</Badge>{detailRecord.inventories.map((inventory) => <Badge key={inventory.locationId} variant="outline">{inventory.locationName} · Qty {Number(inventory.quantity).toLocaleString()}</Badge>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["RAM", detailRecord.customizationRam || specificationValue(detailRecord, ["RAM", "Memory"])], ["Storage", detailRecord.customizationStorage || specificationValue(detailRecord, ["Storage", "SSD", "Hard Drive"])], ["Screen Details", detailRecord.customizationScreen || specificationValue(detailRecord, ["Screen", "Display", "Screen Size"])], ["Part Number", detailRecord.partNumber || specificationValue(detailRecord, ["Part Number", "MPN"])], ["Serial", detailRecord.itemSerialNumber], ["UPC No.", detailRecord.upcNumber], ["Quantity on hand", Number(detailRecord.quantity).toLocaleString()]].map(([label, value]) => <div key={label} className="rounded-lg border bg-muted/20 p-3"><span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-1 break-words font-semibold">{value || "Not entered"}</p></div>)}</div><div className="rounded-lg border p-4"><h4 className="font-semibold">Full product specifications</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{specificationText(detailRecord) || "No specifications entered."}</p></div><div className="rounded-lg border p-4"><h4 className="font-semibold">Details for users</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{detailRecord.customizationDetails || "No customization details entered."}</p></div></div> : null}</DialogContent></Dialog>
  </div>;
}
