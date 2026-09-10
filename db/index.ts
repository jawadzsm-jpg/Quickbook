import { AsyncLocalStorage } from "node:async_hooks";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as sessionDrizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { getLocalDb } from "./local";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | null = null;
const transactionContext = new AsyncLocalStorage<NeonDatabase<typeof schema> | PgliteDatabase<typeof schema>>();

export function getDb() {
  const transaction = transactionContext.getStore();
  if (transaction) return transaction;
  if (process.env.COMNET_LOCAL_DB === "1") return getLocalDb();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  if (!database) database = drizzle(neon(connectionString), { schema });
  return database;
}

class RejectedWrite extends Error {
  constructor(readonly response: Response) { super("Write rejected"); }
}

/** Keep dependent writes on one connection; error responses must also roll back. */
export async function withWriteTransaction(work: () => Promise<Response>) {
  if (process.env.COMNET_LOCAL_DB === "1") {
    try {
      return await getLocalDb().transaction(async (transaction) => transactionContext.run(transaction, async () => {
        const response = await work();
        if (!response.ok) throw new RejectedWrite(response);
        return response;
      }));
    } catch (error) {
      if (error instanceof RejectedWrite) return error.response;
      throw error;
    }
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    return await sessionDrizzle(pool, { schema }).transaction(async (transaction) => {
      return transactionContext.run(transaction, async () => {
        const response = await work();
        if (!response.ok) throw new RejectedWrite(response);
        return response;
      });
    }, { isolationLevel: "serializable" });
  } catch (error) {
    if (error instanceof RejectedWrite) return error.response;
    throw error;
  } finally {
    await pool.end();
  }
}
