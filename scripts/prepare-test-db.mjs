/**
 * Creates the test database if it does not already exist.
 * Derives the test DB connection from DATABASE_URL by replacing the DB name
 * with "ai_kingdom_test" (or TEST_DATABASE_URL if explicitly set in .env.test).
 *
 * Attempts creation via:
 *   1. Docker exec (local dev with docker-compose)
 *   2. psql on host (local dev with local postgres)
 *   3. Node pg-style connection via psql to postgres admin DB
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(root, ".env") });
dotenv.config({ path: path.resolve(root, ".env.test"), override: true });

// Derive test DB URL from DATABASE_URL if TEST_DATABASE_URL not set
let testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    console.error("Neither TEST_DATABASE_URL nor DATABASE_URL is set.");
    process.exit(1);
  }
  // Replace last path segment (DB name) with ai_kingdom_test
  testDbUrl = devUrl.replace(/\/([^/?]+)(\?|$)/, "/ai_kingdom_test$2");
  console.log(`TEST_DATABASE_URL not set. Derived: ${testDbUrl.replace(/:([^:@]+)@/, ":***@")}`);
}

const withoutQuery = testDbUrl.split("?")[0];
const dbName = withoutQuery.split("/").pop() ?? "ai_kingdom_test";

// Parse host/user/password from URL for admin connection
let adminUrl = "";
try {
  const u = new URL(withoutQuery);
  adminUrl = `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port ?? 5432}/postgres`;
} catch {
  console.error("Could not parse TEST_DATABASE_URL.");
  process.exit(1);
}

console.log(`Preparing test database: ${dbName}`);

// Try docker exec first (if container is running locally)
const dockerOk = (() => {
  try {
    execSync("docker ps --format {{.Names}} 2>/dev/null | grep -q ai-kingdom-postgres", { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
})();

if (dockerOk) {
  try {
    execSync(
      `docker exec ai-kingdom-postgres psql -U kingdom -c "CREATE DATABASE \\"${dbName}\\" OWNER kingdom;" 2>&1 || true`,
      { stdio: "pipe", shell: true }
    );
    console.log(`✓ Database "${dbName}" is ready (via docker exec).`);
    process.exit(0);
  } catch {
    // fall through to psql
  }
}

// Try psql on host (works for local postgres or remote with psql installed)
try {
  const result = execSync(
    `psql "${adminUrl}" -c "SELECT 1 FROM pg_database WHERE datname='${dbName}'" -t 2>&1`,
    { shell: true }
  ).toString().trim();

  if (result.includes("1")) {
    console.log(`✓ Database "${dbName}" already exists.`);
    process.exit(0);
  }

  execSync(`psql "${adminUrl}" -c "CREATE DATABASE \\"${dbName}\\";" 2>&1`, { shell: true });
  console.log(`✓ Database "${dbName}" created.`);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? (err.message + " " + (err.stderr?.toString() ?? "")) : String(err);
  if (msg.includes("already exists")) {
    console.log(`✓ Database "${dbName}" already exists.`);
    process.exit(0);
  }
  console.error(`✗ Could not create database "${dbName}".`);
  console.error("Error:", msg.split("\n")[0]);
  console.error(
    "\nManual steps:\n" +
    `  psql "${adminUrl.replace(/:([^:@]+)@/, ":***@")}" -c "CREATE DATABASE ${dbName};"\n` +
    "Or if using docker:\n" +
    `  docker exec ai-kingdom-postgres psql -U kingdom -c "CREATE DATABASE ${dbName};"`
  );
  process.exit(1);
}
