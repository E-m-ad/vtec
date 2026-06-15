import "dotenv/config";

import { verifyBackupFile } from "../src/modules/backups/backup.service.js";
import { parseCliArgs, printJson, resolveBackupFile } from "./backupCliUtils.js";

const main = async () => {
  const args = parseCliArgs(process.argv.slice(2));
  const filePath = await resolveBackupFile(args.file);
  const result = await verifyBackupFile(filePath);

  printJson("Backup verified:", {
    file_name: result.file_name,
    path: result.path,
    size_bytes: result.size_bytes,
    created_at: result.created_at,
    database_name: result.database_name,
    checksum_sha256: result.checksum_sha256,
    checksum_matches: result.checksum_matches,
  });
};

main().catch((error) => {
  console.error("Backup verification failed:", error.message);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
