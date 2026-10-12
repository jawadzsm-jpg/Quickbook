# Integration API guide (for website developers)

EasyBook exposes a read-only, versioned REST API so any website or system — Shopify, WordPress/WooCommerce, a custom site, a mobile app or a marketplace feed — can read a company's products, stock, prices and Today Offers. This guide is everything a developer needs; the machine-readable description is at `/api/v1/openapi.json` (OpenAPI 3.1, importable into Postman or code generators). Implementation details for maintainers are in [API.md → Integration API v1](API.md#integration-api-v1-websites).

## 1. Get a key

An EasyBook Administrator opens **Admin Controls → API & Integrations → Create API key**, names it after the website (one key per website), and copies the key. It is shown **once**.

- Keys look like `ebk_live_` followed by 43 characters.
- A key belongs to **one company** and can only **read** product data.
- Keep it on the website's **server** (environment variable, WordPress option, Shopify app secret). Never put it in browser JavaScript or page HTML — there is no CORS by design.
- Lost or leaked? Revoke it in the same screen (immediate) and create a new one.

## 2. Make requests

Base URL: `https://<your-easybook-domain>/api/v1` (shown in the API & Integrations screen).

```bash
curl -H "Authorization: Bearer ebk_live_…" "https://<domain>/api/v1/products?limit=50"
```

`X-API-Key: ebk_live_…` is accepted as an alternative header. All responses are JSON with `Cache-Control: no-store`.

| Endpoint | Description |
| --- | --- |
| `GET /products` | Products, one per SKU, ordered by SKU. Query: `limit` (1–200, default 50), `cursor`, `updated_since` (ISO 8601), `category`, `inventory` (inventory code), `status` (`active` default, `all` adds inactive products). |
| `GET /products/{sku}` | One product (also when inactive). 404 if the SKU does not exist. |
| `GET /categories` | Categories of active products with product counts and colours. |
| `GET /openapi.json` | API description (no key needed). |

### Product object

```json
{
  "sku": "12A304",
  "item_number": "13002",
  "name": "ASUS VIVOBOOK X1407QA",
  "category": "LAPTOP",
  "description": "16GB RAM | 512GB SSD",
  "specifications": [{ "name": "RAM", "value": "16GB" }],
  "part_number": "90NB1603-M002S0",
  "upc": null,
  "status": "active",
  "price": { "amount": 1800, "currency": "AED", "includes_vat": false },
  "offer": { "price": 1650, "starts_at": "2026-10-11T08:00:00.000Z", "ends_at": "2026-10-11T19:59:00.000Z", "quantity": 10, "remaining": 4 },
  "stock": {
    "quantity": 12,
    "available": 10,
    "inventories": [{ "code": "MAIN", "name": "Main Inventory", "quantity": 12, "available": 10, "price": 1800, "status": "active" }]
  },
  "weight_kg": 1.4,
  "dimensions_cm": { "length": 32, "width": 22, "height": 2 },
  "created_at": "2026-10-07T18:34:47.574Z",
  "updated_at": "2026-10-11T12:27:22.052Z"
}
```

- `price.amount` is the selling price in the company's currency; `includes_vat` says whether it already contains VAT (UAE VAT is 5%).
- `offer` is the running **Today Offer** (a sale price with start and end) or `null`. Show it as the sale/compare-at price until `ends_at`. `quantity` is how many are offered (`null` = no limit) and `remaining` how many are left (`null` without a limit); an offer whose quantity is sold returns `offer: null`.
- `stock.available` = quantity minus stock held for sales reps — use it for "in stock" and order limits.
- Cost, purchase prices, suppliers and accounting data are never returned.

### Paging

The list returns `{ "data": [...], "has_more": true, "next_cursor": "MTJBMzA0" }`. Request the next page with `cursor=<next_cursor>` (keep the other parameters) until `has_more` is `false`.

## 3. Keep a website in sync

1. **First import:** page through `GET /products?status=all` and create every product. Create new products as **drafts** if your platform supports it, so staff can review images and copy before publishing.
2. **Every few minutes** (cron / scheduled task): remember the time *before* you start (`syncStart`), then page through `GET /products?updated_since=<previous syncStart>&status=all`, and save `syncStart` for next time.
3. For each product returned: update stock (`stock.available`), price and sale price (`offer`); set `status = inactive` products to draft/hidden; create products you have not seen before (as drafts).

A product appears in `updated_since` results when anything about it changes — stock movements (bills, invoices, returns, transfers, counts), selling price, details, active/inactive status — and when its Today Offer is created, ended early, starts or ends.

### Field mapping hints

| EasyBook | Shopify | WooCommerce |
| --- | --- | --- |
| `sku` | Variant SKU | SKU |
| `name`, `description`, `specifications` | Title, body HTML | Name, description / attributes |
| `price.amount` (or `offer.price` while running) | Price (and Compare-at price = normal price during an offer) | Regular price / Sale price with sale dates `starts_at`–`ends_at` |
| `stock.available` | Inventory quantity | Stock quantity |
| `status: inactive` | Product status Draft | Status Draft |
| `category` | Product type / collection | Category |
| `weight_kg`, `dimensions_cm` | Weight | Weight and dimensions |

## 4. Limits and errors

- **Rate limit:** 120 requests per minute per key. Over the limit you get `429` with a `Retry-After` header (seconds); wait and retry. Prefer `limit=200` pages and `updated_since` syncs over many small requests.
- **Errors** always look like `{ "error": { "code": "…", "message": "…" } }`:

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_parameter` | A query value is not valid (message says which) |
| 401 | `invalid_api_key` | Missing, malformed, unknown or revoked key, or the company is inactive |
| 404 | `not_found` | No product with that SKU |
| 429 | `rate_limited` | Too many requests; see `Retry-After` |
| 500 | `server_error` | Temporary problem; retry with backoff |

## 5. Examples

**PHP (WordPress):**

```php
$response = wp_remote_get(EASYBOOK_URL . '/api/v1/products?limit=200&updated_since=' . rawurlencode($last_sync), [
  'headers' => ['Authorization' => 'Bearer ' . EASYBOOK_API_KEY],
  'timeout' => 30,
]);
$body = json_decode(wp_remote_retrieve_body($response), true);
foreach ($body['data'] as $product) { /* create or update the WooCommerce product by SKU */ }
```

**JavaScript (Node / server):**

```js
async function* allProducts(since) {
  let cursor = "";
  do {
    const url = new URL("/api/v1/products", process.env.EASYBOOK_URL);
    url.searchParams.set("limit", "200");
    url.searchParams.set("status", "all");
    if (since) url.searchParams.set("updated_since", since);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.EASYBOOK_API_KEY}` } });
    if (response.status === 429) { await new Promise((r) => setTimeout(r, Number(response.headers.get("Retry-After") ?? 5) * 1000)); continue; }
    const page = await response.json();
    yield* page.data;
    cursor = page.has_more ? page.next_cursor : "";
  } while (cursor);
}
```

## 6. Roadmap

- **Phase 2 — webhooks:** EasyBook will push signed notifications (product created, stock/price changed, offer started/ended) to a URL on the website, so polling becomes optional.
- **Phase 3 — connectors:** built-in Shopify and WooCommerce connections that create draft products and keep stock and prices in sync without custom code.
