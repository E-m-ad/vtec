# Car Spare Parts ERP Backend

Node.js, Express.js, PostgreSQL, and Prisma 7 backend for a car spare parts ERP system.

## Features

- JWT authentication with user roles
- Products, categories, brands, suppliers, and customers
- Purchases that increase stock
- Sales that decrease stock and block overselling
- Manual stock adjustments
- Stock movement audit trail for every stock change
- Inventory, low-stock, sales, and purchase reports

## Stock Rule

Every stock change is recorded in `stock_movements`.

Application code must never update `products.stock_quantity` directly. Stock changes go through:

- `createProduct` with `initial_stock_quantity`
- `createPurchase`
- `createSale`
- `adjustStock`

The Prisma service layer centralizes stock changes in `recordStockMovement`. The PostgreSQL migration also installs a trigger that rejects direct `products.stock_quantity` updates unless they happen inside the stock movement transaction context.

Prisma 7 setup note:

- `prisma.config.js` owns the database connection URL with `datasource.url`.
- `prisma/schema.prisma` keeps the PostgreSQL provider only.
- Runtime database access uses Prisma's official `@prisma/adapter-pg` driver adapter.

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Create a PostgreSQL database, update `DATABASE_URL` in `.env`, then run:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Default seeded users:

- `admin@example.com` / `admin123`
- `inventory@example.com` / `inventory123`

## Scripts

```bash
npm run dev             # start with node --watch
npm start               # start normally
npm run prisma:generate # generate Prisma client
npm run db:migrate      # run Prisma migration in development
npm run db:deploy       # deploy migrations in production
npm run db:seed         # seed sample data
npm run db:test         # verify database connectivity
npm run db:backup       # create a PostgreSQL dump backup
npm run db:backup:verify -- --file <backup.dump>
npm run db:restore -- --file <backup.dump> --confirm "RESTORE <database>"
npm run lan:check       # check center-computer LAN readiness
```

## Network Access

For a local network setup, one center computer runs PostgreSQL, the backend, and the built frontend. Other computers open the app from the browser:

```text
http://<center-computer-ip>:5000
```

See `docs/local-network-deployment.md`.

## Prisma Files

- `prisma/schema.prisma` defines the ORM models.
- `prisma/migrations/20260601000000_init/migration.sql` creates the PostgreSQL schema, constraints, indexes, and stock guard trigger.
- `prisma/seed.js` seeds users, catalog data, products, opening stock, and matching stock movement records.
- `prisma.config.js` configures Prisma schema, datasource URL, migrations, and seed command.

## Main Endpoints

All endpoints except `/health` and `/api/auth/login` require:

```http
Authorization: Bearer <token>
```

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

Catalog:

- `GET|POST /api/categories`
- `GET|PUT|DELETE /api/categories/:id`
- `GET|POST /api/brands`
- `GET|PUT|DELETE /api/brands/:id`
- `GET|POST /api/products`
- `GET /api/products?search=brake&limit=50&offset=0`
- `GET|PUT|DELETE /api/products/:id`

Partners:

- `GET|POST /api/suppliers`
- `GET|PUT|DELETE /api/suppliers/:id`
- `GET|POST /api/customers`
- `GET|PUT|DELETE /api/customers/:id`
- `POST /api/suppliers/:id/product-settlements`

Stock and transactions:

- `GET|POST /api/purchases`
- `GET /api/purchases/:id`
- `GET|POST /api/sales`
- `GET /api/sales/:id`
- `GET /api/stock-movements`
- `GET /api/stock-movements/:id`
- `POST /api/stock-movements/adjustments`

Reports:

- `GET /api/reports/inventory`
- `GET /api/reports/low-stock`
- `GET /api/reports/low-stock?limit=50&offset=0`
- `GET /api/reports/out-of-stock?limit=50&offset=0`
- `GET /api/reports/cash-flow?from=2026-01-01&to=2026-02-01`
- `GET /api/reports/sales-summary?from=2026-01-01&to=2026-12-31`
- `GET /api/reports/purchase-summary?from=2026-01-01&to=2026-12-31`

Backups:

- `GET /api/backups`
- `POST /api/backups`
- `GET /api/backups/excel-export`
- `GET /api/backups/excel-vba`
- `GET /api/backups/:fileName/download`

Production backup and restore procedure:

- See `docs/backup-restore.md`.
- Restore is CLI-only and intentionally not exposed as an API endpoint.

## Example Sale

```bash
curl -X POST http://localhost:5000/api/sales \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "customer_id": 1,
    "payment_method": "cash",
    "items": [
      { "product_id": 1, "quantity": 2, "unit_price": 1150 }
    ]
  }'
```
