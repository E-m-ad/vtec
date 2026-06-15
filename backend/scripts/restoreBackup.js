import "dotenv/config";

import {
  createBackup,
  getConfiguredDatabaseName,
  restoreBackupFile,
  verifyBackupFile,
} from "../src/modules/backups/backup.service.js";
import { parseCliArgs, printJson, resolveBackupFile } from "./backupCliUtils.js";

const shouldSkipSafetyBackup = (args) =>
  args["skip-safety-backup"] === true ||
  process.env.VTEC_SKIP_SAFETY_BACKUP === "true";

const main = async () => {
  const args = parseCliArgs(process.argv.slice(2));
  const databaseName = getConfiguredDatabaseName();
  const expectedConfirmation = `RESTORE ${databaseName}`;

  if (args.confirm !== expectedConfirmation) {
    throw new Error(
      `Restore blocked. Re-run with --confirm "${expectedConfirmation}" after checking DATABASE_URL.`,
    );
  }

  const filePath = await resolveBackupFile(args.file);

  console.log("Verifying backup before restore...");
  const verification = await verifyBackupFile(filePath);

  let safetyBackup = null;

  if (shouldSkipSafetyBackup(args)) {
    console.warn("Skipping pre-restore safety backup by explicit request.");
  } else {
    console.log("Creating pre-restore safety backup...");
    safetyBackup = await createBackup();
  }

  console.log("Restoring database. Do not stop this process...");
  const restore = await restoreBackupFile(filePath);

  printJson("Restore completed:", {
    restored_database_name: restore.restored_database_name,
    restored_at: restore.restored_at,
    source_backup: {
      file_name: verification.file_name,
      path: verification.path,
      checksum_sha256: verification.checksum_sha256,
    },
    pre_restore_safety_backup: safetyBackup,
  });
};

main().catch((error) => {
  console.error("Restore failed:", error.message);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
