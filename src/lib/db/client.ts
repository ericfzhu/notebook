import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@/lib/db/types";

export type Numeric = number | string | null;

interface NotebookCloudflareEnv extends Record<string, unknown> {
  DB: D1Database;
}

export function getDatabase(): D1Database {
  const { env } = getCloudflareContext();
  return (env as unknown as NotebookCloudflareEnv).DB;
}

export function toNumber(value: Numeric): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

export function toBoolean(value: Numeric): boolean {
  return toNumber(value) === 1;
}
