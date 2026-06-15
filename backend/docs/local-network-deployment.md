# Local Network Deployment

Use this setup when one center computer runs the system and other computers open it from the same local network.

## How It Works

The center computer runs:

- PostgreSQL database.
- Backend server.
- Built frontend files.

The other computers do not install the app. They only open the browser:

```text
http://<center-computer-ip>:5000
```

Example:

```text
http://192.168.1.50:5000
```

## Who Does What

Normal users:

- Do not run commands.
- Do not install Node.js.
- Do not install PostgreSQL.
- Open the app in the browser from a client computer.

The center computer operator:

- Starts the server.
- Checks `npm run lan:check` when network access is not working.
- Creates/downloads backups, or schedules backups.
- Runs restore only in an emergency.

Developer/IT:

- Updates the code.
- Runs migrations.
- Restores backups when needed.
- Changes `.env` configuration.

## Center Computer Setup

Install on the center computer:

- Node.js LTS.
- PostgreSQL.
- PostgreSQL command-line tools, including `pg_dump` and `pg_restore`.

Use a fixed LAN IP for the center computer. You can set it from the router DHCP reservation or from Windows network settings.

## Environment

Use `backend/.env` for the center computer.

Recommended LAN settings:

```env
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
SERVE_FRONTEND=true
DATABASE_URL=postgres://postgres:postgres@localhost:5432/vtec
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=
```

`CORS_ORIGIN` can stay empty because the backend serves the frontend and API from the same address.

## Build and Prepare

Run these commands on the center computer:

```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
npm run prisma:generate
npm run db:deploy
npm run db:test
npm run lan:check
```

Do not run `npm run db:seed` on production/live data.

## Windows Firewall

Run PowerShell as Administrator on the center computer:

```powershell
New-NetFirewallRule -DisplayName "VTEC ERP Server 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

## Starting the Server

Simple method:

```bash
cd backend
npm start
```

Windows double-click method:

```text
backend/start-vtec-server.cmd
```

The command window must stay open while the system is running.

## Access From Client Computers

On each client computer, open:

```text
http://<center-computer-ip>:5000
```

The client computers do not need Node.js, PostgreSQL, or source code.

## Daily Use

- Staff use the app from their browsers.
- Admin users create/download backups from the Backups page.
- Keep backup copies outside the center computer.

## Restore

Restore is not done by normal users. It is done on the center computer by the owner, developer, or IT person.

See:

```text
backend/docs/backup-restore.md
```

## Monthly Check

At least once per month:

```bash
cd backend
npm run db:backup
npm run db:backup:verify -- --file <backup-file-name.dump>
npm run lan:check
```

Also test restore into a separate test database, not the live database.

## Troubleshooting

If the center computer opens the app but client computers cannot:

- Confirm all computers are on the same network.
- Confirm the center computer IP did not change.
- Confirm Windows Firewall allows TCP port `5000`.
- Run `npm run lan:check` on the center computer.
- Try `http://<center-computer-ip>:5000/health` from a client computer.

If the app opens but login/API does not work:

- Run `npm run db:test` on the center computer.
- Confirm PostgreSQL is running.
- Confirm `DATABASE_URL` is correct.
- Restart the backend server.
