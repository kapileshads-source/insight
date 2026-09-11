import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Next.js dev-mode hot reload re-evaluates modules, which would otherwise open
// a new connection pool on every edit until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: pg.Pool;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // An explicit pool rather than letting the adapter build one from a config
  // object. Two reasons: the limits below are ours to set rather than
  // defaults, and handing the adapter a real pool keeps checkout behaviour
  // predictable when several requests are in flight at once, which is what
  // produces node-postgres's "client is already executing a query" warning.
  const pool =
    globalForPrisma.pgPool ??
    new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
