import { defineConfig } from "vitest/config";
import path from "node:path";
import fs from "node:fs";

// Read .env.local to derive the test DB URL (never hardcode real credentials).
function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(import.meta.dirname, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

function testDatabaseUrl(): string {
  const env = loadEnvLocal();
  const realUrl = env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/songkhla_prices";
  // Swap the database name to the dedicated test database, keep credentials.
  const url = new URL(realUrl);
  url.pathname = "/songkhla_prices_test";
  return url.toString();
}

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});