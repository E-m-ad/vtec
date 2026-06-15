# Railway Deployment

This repo is prepared to deploy as one Railway web service from the repository root. The backend serves both `/api` and the built Vite frontend from `frontend/dist`.

## What Railway Runs

- Build command: `npm run railway:build`
- Pre-deploy command: `npm run railway:predeploy`
- Start command: `npm run railway:start`
- Healthcheck: `/health`

`railway.json` stores those settings in code. The build installs backend and frontend dependencies, generates Prisma Client, then builds the frontend. The pre-deploy command runs `prisma migrate deploy` against the Railway PostgreSQL database.

## Railway Setup

1. Push this repository to GitHub.
2. Create a Railway project from the GitHub repo.
3. Keep the app service root directory as `/` and use `/railway.json` as the config file.
4. Add a Railway PostgreSQL service.
5. Set the app service variables:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<a-long-random-secret-at-least-32-characters>
JWT_EXPIRES_IN=7d
```

Do not set `VITE_API_BASE_URL` for this single-service deployment. The frontend should keep using same-origin `/api`.

Set `CORS_ORIGIN` only if another domain will call the API directly:

```env
CORS_ORIGIN=https://your-custom-domain.com
```

## Persistent Files

Railway container files are not a durable place for uploads or generated backups. If you need service-job media and app-created backup files to survive deploys and restarts, add a Railway volume mounted at `/data`, then set:

```env
UPLOAD_ROOT=/data/uploads
BACKUP_DIR=/data/backups
```

The backup API also requires `pg_dump` in the runtime image. If that is unavailable, use Railway PostgreSQL backups or switch this service to a Dockerfile that installs PostgreSQL client tools.

## First Production Admin

The deploy runs migrations only. It does not seed default users because the seed credentials are intended for local development. A brand-new production database still needs an initial admin because `/api/auth/register` is admin-protected.

Run the seed command once only if you will immediately change the default passwords:

```bash
npm run db:seed --prefix backend
```

For a cleaner production bootstrap, create the first admin with a one-off Prisma script or SQL insert instead of seeding sample data.
