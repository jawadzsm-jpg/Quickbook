import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { resolve } from "node:path";
import * as schema from "./schema";

const localState = globalThis as typeof globalThis & { comnetLocalDatabase?: ReturnType<typeof drizzle<typeof schema>> };

export function getLocalDb() {
  if (process.env.NODE_ENV !== "development" || process.env.COMNET_LOCAL_DB !== "1") throw new Error("Local database mode is restricted to explicit development use.");
  if (!localState.comnetLocalDatabase) {
    const client = new PGlite(resolve(process.env.COMNET_LOCAL_DATA_DIR || ".local-data", "postgres"));
    localState.comnetLocalDatabase = drizzle(client, { schema });
  }
  return localState.comnetLocalDatabase;
}
