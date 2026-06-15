import "dotenv/config";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const frontendDistPath = path.resolve(backendRoot, "../frontend/dist");
const defaultJwtSecret = "change_this_to_a_long_random_secret";

const checks = [];

const addCheck = (ok, label, fix = "") => {
  checks.push({ ok, label, fix });
};

const commandExists = (command) => {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });

  return result.status === 0;
};

const fileCommandExists = (filePath) => {
  if (!filePath) return false;

  return fs.existsSync(filePath);
};

const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((address) => address?.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const nodeEnv = process.env.NODE_ENV || "";
const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || "5000";
const jwtSecret = process.env.JWT_SECRET || "";
const shouldServeFrontend =
  process.env.SERVE_FRONTEND === "true" || nodeEnv === "production";

addCheck(nodeEnv === "production", "NODE_ENV is production", "Set NODE_ENV=production in backend/.env.");
addCheck(host === "0.0.0.0", "HOST allows LAN access", "Set HOST=0.0.0.0 in backend/.env.");
addCheck(Boolean(process.env.DATABASE_URL), "DATABASE_URL is configured", "Set DATABASE_URL in backend/.env.");
addCheck(
  jwtSecret.length >= 32 && jwtSecret !== defaultJwtSecret,
  "JWT_SECRET is strong",
  "Replace JWT_SECRET with a long random value.",
);
addCheck(shouldServeFrontend, "Backend will serve the frontend", "Set SERVE_FRONTEND=true.");
addCheck(
  fs.existsSync(path.join(frontendDistPath, "index.html")),
  "Frontend build exists",
  "Run npm run build inside the frontend folder.",
);
addCheck(
  fileCommandExists(process.env.PG_DUMP_PATH) || commandExists(process.env.PG_DUMP_PATH || "pg_dump"),
  "pg_dump is available",
  "Install PostgreSQL tools or set PG_DUMP_PATH.",
);
addCheck(
  fileCommandExists(process.env.PG_RESTORE_PATH) ||
    commandExists(process.env.PG_RESTORE_PATH || "pg_restore"),
  "pg_restore is available",
  "Install PostgreSQL tools or set PG_RESTORE_PATH.",
);
addCheck(
  lanAddresses.length > 0,
  "LAN IPv4 address found",
  "Connect the center computer to the local network.",
);

console.log("VTEC LAN preflight");
console.log("");

for (const check of checks) {
  console.log(`${check.ok ? "OK " : "ERR"} ${check.label}`);
  if (!check.ok && check.fix) {
    console.log(`    Fix: ${check.fix}`);
  }
}

console.log("");
console.log("Open the app on the center computer:");
console.log(`  http://localhost:${port}`);

if (lanAddresses.length) {
  console.log("");
  console.log("Open the app on client computers:");
  for (const address of lanAddresses) {
    console.log(`  http://${address}:${port}`);
  }
}

const failed = checks.filter((check) => !check.ok);

if (failed.length) {
  console.log("");
  console.log(`${failed.length} check(s) need attention before LAN use.`);
  process.exit(1);
}

console.log("");
console.log("LAN preflight passed.");
