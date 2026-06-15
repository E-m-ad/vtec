# Backup and Restore Procedure

This procedure is for production and live test environments.

The system stores PostgreSQL custom-format dump files in `backend/backups`:

- `vtec_backup_YYYY-MM-DD_HH-mm-ss.dump`
- `vtec_backup_YYYY-MM-DD_HH-mm-ss.dump.json`

The `.json` file contains the database name, file size, created time, creator, and SHA-256 checksum.

## Requirements

- PostgreSQL command-line tools installed on the server.
- `pg_dump` available in `PATH`, or `PG_DUMP_PATH` set in `.env`.
- `pg_restore` available in `PATH`, or `PG_RESTORE_PATH` set in `.env`.
- Enough free disk space for at least two full database backups.
- A copy of the backup stored outside the application server.

Example Windows `.env` entries:

```env
PG_DUMP_PATH=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
PG_RESTORE_PATH=C:\Program Files\PostgreSQL\18\bin\pg_restore.exe
```

## Create a Backup

Use the admin Backups page, or run this on the server:

```bash
cd backend
npm run db:backup
```

After each production backup, copy both files off the server:

- The `.dump` file.
- The matching `.dump.json` metadata file.

Good storage targets are an external drive, NAS, cloud storage bucket, or another secured machine.

## Verify a Backup

Verification checks:

- The file exists.
- The checksum matches the metadata file, when metadata exists.
- `pg_restore` can read the dump structure.

```bash
cd backend
npm run db:backup:verify -- --file vtec_backup_2026-06-08_12-00-00.dump
```

You can also pass a full path:

```bash
npm run db:backup:verify -- --file "D:\Backups\vtec_backup_2026-06-08_12-00-00.dump"
```

## Restore a Backup

Restore is intentionally CLI-only. Do not expose it through the web app.

Before restoring:

1. Stop the Node.js application.
2. Confirm `DATABASE_URL` points to the database you want to replace.
3. Verify the selected backup.
4. Confirm no users are connected to the app.

Run restore with an explicit confirmation phrase. The database name comes from `DATABASE_URL`.

For example, if `DATABASE_URL` points to database `vtec`:

```bash
cd backend
npm run db:restore -- --file vtec_backup_2026-06-08_12-00-00.dump --confirm "RESTORE vtec"
```

The restore script creates a fresh pre-restore safety backup before changing the database.

Use `--skip-safety-backup` only when the current database is already damaged and `pg_dump` cannot run:

```bash
npm run db:restore -- --file vtec_backup_2026-06-08_12-00-00.dump --confirm "RESTORE vtec" --skip-safety-backup
```

## After Restore

Run:

```bash
npm run db:deploy
npm run db:test
```

Then start the application and smoke-test:

- Login.
- Product search.
- Create a small sale.
- Record a sale return.
- Check stock movement history.
- Check supplier/customer balances.
- Open reports.
- Create a new backup.

## Schedule and Retention

Recommended minimum:

- Daily backup retained for 30 days.
- Weekly backup retained for 3 months.
- Monthly backup retained for 12 months.
- One verified off-server copy at all times.

Test a restore into a separate test database at least once per month. A backup that was never restored is only a hope, not a recovery plan.

## Red Lines

- Never run `npm run db:seed` on production data. The seed script deletes tables.
- Never restore without checking `DATABASE_URL`.
- Never keep the only backup on the same disk as the live database.
- Never upload backup files to a public location.
- Never restore while the app is serving users.
