import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "node:url";

import authRoutes from "./modules/auth/auth.routes.js";
import attendanceRoutes from "./modules/attendance/attendance.routes.js";
import brandRoutes from "./modules/brands/brand.routes.js";
import carRoutes from "./modules/cars/car.routes.js";
import categoryRoutes from "./modules/categories/category.routes.js";
import customerRoutes from "./modules/customers/customer.routes.js";
import employeeRoutes from "./modules/employees/employee.routes.js";
import inventoryCountRoutes from "./modules/inventoryCounts/inventoryCount.routes.js";
import moneyOutRoutes from "./modules/moneyOut/moneyOut.routes.js";
import productRoutes from "./modules/products/product.routes.js";
import purchaseRoutes from "./modules/purchases/purchase.routes.js";
import reportRoutes from "./modules/reports/report.routes.js";
import saleRoutes from "./modules/sales/sale.routes.js";
import serviceJobRoutes from "./modules/serviceJobs/serviceJob.routes.js";
import stockMovementRoutes from "./modules/stockMovements/stockMovement.routes.js";
import supplierRoutes from "./modules/suppliers/supplier.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import { authenticate, authorizePermission } from "./middlewares/auth.middleware.js";
import errorMiddleware from "./middlewares/error.middleware.js";
import notFoundMiddleware from "./middlewares/notFound.middleware.js";
import { serviceJobUploadDir } from "./middlewares/upload.middleware.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const isProduction = process.env.NODE_ENV === "production";
const defaultJwtSecret = "change_this_to_a_long_random_secret";

const app = express();

const parseCorsOrigins = () =>
  String(process.env.CORS_ORIGIN || (isProduction ? "" : "*"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOrigins = parseCorsOrigins();
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
};

if (
  isProduction &&
  (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET === defaultJwtSecret ||
    process.env.JWT_SECRET.length < 32)
) {
  throw new Error("Production JWT_SECRET must be a long random secret.");
}

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: false,
  }),
);
app.use(compression());
app.use(morgan(isProduction ? "combined" : "dev"));
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(
  "/uploads/service-jobs",
  express.static(serviceJobUploadDir, {
    fallthrough: false,
    maxAge: isProduction ? "7d" : 0,
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Car spare parts ERP API is running",
  });
});
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Car spare parts ERP API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      categories: "/api/categories",
      brands: "/api/brands",
      products: "/api/products",
      suppliers: "/api/suppliers",
      customers: "/api/customers",
      cars: "/api/cars",
      employees: "/api/employees",
      attendance: "/api/attendance",
      inventoryCounts: "/api/inventory-counts",
      moneyOut: "/api/money-out",
      purchases: "/api/purchases",
      sales: "/api/sales",
      serviceJobs: "/api/service-jobs",
      stockMovements: "/api/stock-movements",
      reports: "/api/reports",
      users: "/api/users"
    }
  });
});
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/categories", authenticate, authorizePermission("categories.view"), categoryRoutes);
app.use("/api/brands", authenticate, authorizePermission("brands.view"), brandRoutes);
app.use("/api/products", authenticate, authorizePermission("products.view"), productRoutes);
app.use("/api/suppliers", authenticate, authorizePermission("suppliers.view"), supplierRoutes);
app.use("/api/customers", authenticate, authorizePermission("customers.view"), customerRoutes);
app.use("/api/cars", authenticate, authorizePermission("cars.view"), carRoutes);
app.use("/api/employees", authenticate, authorizePermission("employees.view"), employeeRoutes);
app.use("/api/attendance", authenticate, authorizePermission("attendance.view"), attendanceRoutes);
app.use("/api/inventory-counts", authenticate, authorizePermission("inventory_counts.view"), inventoryCountRoutes);
app.use("/api/money-out", authenticate, authorizePermission("money_out.view"), moneyOutRoutes);
app.use("/api/purchases", authenticate, authorizePermission("purchases.view"), purchaseRoutes);
app.use("/api/sales", authenticate, authorizePermission("sales.view"), saleRoutes);
app.use("/api/service-jobs", authenticate, authorizePermission("service_jobs.view"), serviceJobRoutes);
app.use("/api/stock-movements", authenticate, authorizePermission("stock_movements.view"), stockMovementRoutes);
app.use("/api/reports", authenticate, authorizePermission("reports.view"), reportRoutes);
app.use("/api/users", authenticate, authorizePermission("accounts.manage"), userRoutes);

const shouldServeFrontend =
  process.env.SERVE_FRONTEND === "true" || isProduction;

if (shouldServeFrontend && fs.existsSync(frontendDistPath)) {
  app.use(
    express.static(frontendDistPath, {
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-store");
          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  app.get("/assets/*", (_req, res) => {
    res.status(404).send("Asset not found");
  });
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
} else if (shouldServeFrontend) {
  console.warn(`Frontend build not found at ${frontendDistPath}`);
}

app.use(notFoundMiddleware);
app.use(errorMiddleware);

const port = process.env.PORT || 5000;
const host = process.env.HOST || "0.0.0.0";

if (process.env.NODE_ENV !== "test") {
  app.listen(port, host, () => {
    console.log(`ERP backend listening on http://${host}:${port}`);
  });
}

export default app;
