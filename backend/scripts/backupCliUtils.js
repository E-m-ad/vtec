import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

export const parseCliArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    const nextValue = argv[index + 1];

    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    if (nextValue && !nextValue.startsWith("--")) {
      args[rawKey] = nextValue;
      index += 1;
      continue;
    }

    args[rawKey] = true;
  }

  return args;
};

export const resolveBackupFile = async (fileNameOrPath) => {
  if (!fileNameOrPath) {
    throw new Error("Missing --file <backup.dump>");
  }

  const candidates = path.isAbsolute(fileNameOrPath)
    ? [fileNameOrPath]
    : [
        path.resolve(process.cwd(), fileNameOrPath),
        path.resolve(backendRoot, "backups", fileNameOrPath),
      ];

  for (const candidate of [...new Set(candidates)]) {
    try {
      const stats = await fs.stat(candidate);

      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Backup file not found: ${fileNameOrPath}`);
};

export const printJson = (label, value) => {
  console.log(label);
  console.log(JSON.stringify(value, null, 2));
};
