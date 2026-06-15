import "dotenv/config";

import { createBackup } from "../src/modules/backups/backup.service.js";
import { printJson } from "./backupCliUtils.js";

const main = async () => {
  const backup = await createBackup();

  printJson("Backup created:", backup);
};

main().catch((error) => {
  console.error("Backup failed:", error.message);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
