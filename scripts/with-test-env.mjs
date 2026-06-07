import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load base config, then test overrides
dotenv.config({ path: path.resolve(root, ".env") });
dotenv.config({ path: path.resolve(root, ".env.test"), override: true });

// Resolve TEST_DATABASE_URL — explicit or auto-derived from DATABASE_URL
let testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  const devUrl = process.env.DATABASE_URL;
  if (devUrl) {
    testDbUrl = devUrl.replace(/\/([^/?]+)(\?|$)/, "/ai_kingdom_test$2");
    console.error(`[test-env] TEST_DATABASE_URL not set. Auto-derived: ${testDbUrl.replace(/:([^:@]+)@/, ":***@")}`);
  }
}

if (!testDbUrl) {
  console.error(
    "❌  TEST_DATABASE_URL is not set and DATABASE_URL is not available to derive from.\n" +
    "    Copy .env.test.example → .env.test and set TEST_DATABASE_URL."
  );
  process.exit(1);
}

// Safety: DB name must contain "test" or "ci"
let dbName = "";
try {
  const withoutQuery = testDbUrl.split("?")[0];
  dbName = withoutQuery.split("/").pop() ?? "";
} catch {
  // ignore parse error; guard below will fire
}
if (!dbName.includes("test") && !dbName.includes("ci")) {
  console.error(
    `❌  Safety check failed: TEST_DATABASE_URL points to database "${dbName}".\n` +
    `    Database name must contain "test" or "ci" to prevent dev-DB contamination.`
  );
  process.exit(1);
}

process.env.DATABASE_URL = testDbUrl;
process.env.TEST_DATABASE_URL = testDbUrl;
process.env.NODE_ENV = "test";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-test-env.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
