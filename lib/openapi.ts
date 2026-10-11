import { API_RATE_LIMIT } from "@/lib/public-api";

const error = { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] } } };
const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

/** OpenAPI 3.1 description of the Integration API v1 (served at /api/v1/openapi.json). */
export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "EasyBook Integration API",
      version: "1.0.0",
      description: `Read-only product data for websites and other systems. Create an API key in Admin Controls → API & Integrations (one company per key) and send it as \`Authorization: Bearer <key>\`. Keep keys on your server; never put them in browser code. Rate limit: ${API_RATE_LIMIT} requests per minute per key (429 with Retry-After when exceeded). To sync, store the time you start a sync and next time ask for \`updated_since\` that time; follow \`next_cursor\` until \`has_more\` is false.`,
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/products": {
        get: {
          summary: "List products",
          description: "Products are grouped by SKU across the company's inventories, ordered by SKU. Changes to stock, price, item details or Today Offers count as updates.",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "next_cursor from the previous page." },
            { name: "updated_since", in: "query", schema: { type: "string", format: "date-time" }, description: "Only products changed after this time." },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "inventory", in: "query", schema: { type: "string" }, description: "Inventory code; only that inventory's stock." },
            { name: "status", in: "query", schema: { type: "string", enum: ["active", "all"], default: "active" }, description: "\"all\" also returns inactive products, so a website can unpublish them." },
          ],
          responses: {
            200: { description: "A page of products", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Product" } }, has_more: { type: "boolean" }, next_cursor: { type: ["string", "null"] } } } } } },
            400: errorResponse("Invalid parameter"), 401: errorResponse("Missing, invalid or revoked API key"), 429: errorResponse("Rate limit exceeded"),
          },
        },
      },
      "/products/{sku}": {
        get: {
          summary: "Get one product",
          description: "Returns the product even when it is inactive.",
          parameters: [{ name: "sku", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "The product", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Product" } } } } } }, 401: errorResponse("Missing, invalid or revoked API key"), 404: errorResponse("No product with this SKU"), 429: errorResponse("Rate limit exceeded") },
        },
      },
      "/categories": {
        get: {
          summary: "List categories",
          responses: { 200: { description: "Categories of active products", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Category" } } } } } } }, 401: errorResponse("Missing, invalid or revoked API key"), 429: errorResponse("Rate limit exceeded") },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "An EasyBook API key (ebk_live_…)." } },
      schemas: {
        Error: error,
        Product: {
          type: "object",
          properties: {
            sku: { type: "string" }, item_number: { type: ["string", "null"] }, name: { type: "string" }, category: { type: "string" }, description: { type: "string" },
            specifications: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } } } },
            part_number: { type: ["string", "null"] }, upc: { type: ["string", "null"] }, status: { type: "string", enum: ["active", "inactive"] },
            price: { type: "object", properties: { amount: { type: "number" }, currency: { type: "string" }, includes_vat: { type: "boolean" } } },
            offer: { type: ["object", "null"], description: "A running Today Offer (sale price) with its start and end.", properties: { price: { type: "number" }, starts_at: { type: "string", format: "date-time" }, ends_at: { type: "string", format: "date-time" } } },
            stock: { type: "object", properties: { quantity: { type: "number" }, available: { type: "number", description: "Quantity minus active stock holds." }, inventories: { type: "array", items: { type: "object", properties: { code: { type: "string" }, name: { type: "string" }, quantity: { type: "number" }, available: { type: "number" }, price: { type: "number" }, status: { type: "string" } } } } } },
            weight_kg: { type: ["number", "null"] }, dimensions_cm: { type: ["object", "null"], properties: { length: { type: "number" }, width: { type: "number" }, height: { type: "number" } } },
            created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" },
          },
        },
        Category: { type: "object", properties: { name: { type: "string" }, products: { type: "integer" }, color: { type: "object", properties: { id: { type: "string" }, background: { type: "string" }, text: { type: "string" } } } } },
      },
    },
  };
}
