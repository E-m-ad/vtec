const LEGACY_PERMISSION_MAP = {
  dashboard: "dashboard.view",
  products: "products.view",
  categories: "categories.view",
  brands: "brands.view",
  suppliers: "suppliers.view",
  customers: "customers.view",
  cars: "cars.view",
  employees: "employees.view",
  attendance: "attendance.view",
  "inventory-counts": "inventory_counts.view",
  purchases: "purchases.view",
  sales: "sales.view",
  "service-jobs": "service_jobs.view",
  "money-out": "money_out.view",
  "stock-movements": "stock_movements.view",
  reports: "reports.view",
  accounts: "accounts.manage",
  backups: "backups.manage",
};

export const ROLE_PERMISSIONS = {
  admin: ["*"],
  manager: [
    "dashboard.view",
    "products.view",
    "categories.view",
    "brands.view",
    "suppliers.view",
    "customers.view",
    "cars.view",
    "employees.view",
    "attendance.view",
    "inventory_counts.view",
    "purchases.view",
    "sales.view",
    "service_jobs.view",
    "money_out.view",
    "stock_movements.view",
    "reports.view",
    "service.reception.write",
    "service.diagnosis.write",
    "service.estimate.write",
    "service.parts.request",
    "service.parts.issue",
    "service.work.write",
    "service.qc.write",
    "service.invoice.write",
    "service.payment.write",
    "service.delivery.write",
    "service.cancel",
  ],
  inventory: [
    "dashboard.view",
    "products.view",
    "inventory_counts.view",
    "purchases.view",
    "sales.view",
    "service_jobs.view",
    "stock_movements.view",
    "service.parts.request",
    "service.parts.issue",
  ],
  cashier: ["dashboard.view", "customers.view", "cars.view", "sales.view", "service_jobs.view", "service.payment.write"],
  service_receptionist: ["dashboard.view", "customers.view", "cars.view", "service_jobs.view", "service.reception.write"],
  service_advisor: [
    "dashboard.view",
    "customers.view",
    "cars.view",
    "sales.view",
    "service_jobs.view",
    "service.reception.write",
    "service.estimate.write",
    "service.parts.request",
    "service.invoice.write",
    "service.cancel",
  ],
  service_technician: ["dashboard.view", "service_jobs.view", "service.diagnosis.write", "service.parts.request", "service.work.write"],
  parts_clerk: ["dashboard.view", "products.view", "service_jobs.view", "stock_movements.view", "service.parts.request", "service.parts.issue"],
  qc_inspector: ["dashboard.view", "service_jobs.view", "service.qc.write"],
  delivery_coordinator: ["dashboard.view", "service_jobs.view", "service.delivery.write"],
};

const routePermissions = [
  { pattern: /^\/$/, permission: "dashboard.view" },
  { pattern: /^\/products(\/.*)?$/, permission: "products.view" },
  { pattern: /^\/categories$/, permission: "categories.view" },
  { pattern: /^\/brands$/, permission: "brands.view" },
  { pattern: /^\/suppliers(\/.*)?$/, permission: "suppliers.view" },
  { pattern: /^\/customers(\/.*)?$/, permission: "customers.view" },
  { pattern: /^\/cars(\/.*)?$/, permission: "cars.view" },
  { pattern: /^\/employees(\/.*)?$/, permission: "employees.view" },
  { pattern: /^\/attendance$/, permission: "attendance.view" },
  { pattern: /^\/inventory-counts(\/.*)?$/, permission: "inventory_counts.view" },
  { pattern: /^\/purchases(\/.*)?$/, permission: "purchases.view" },
  { pattern: /^\/sales(\/.*)?$/, permission: "sales.view" },
  { pattern: /^\/service-jobs(\/.*)?$/, permission: "service_jobs.view" },
  { pattern: /^\/money-out$/, permission: "money_out.view" },
  { pattern: /^\/stock-movements$/, permission: "stock_movements.view" },
  { pattern: /^\/reports$/, permission: "reports.view" },
  { pattern: /^\/accounts$/, permission: "accounts.manage" },
  { pattern: /^\/backups$/, permission: "backups.manage" },
];

const normalizePermission = (permission) => LEGACY_PERMISSION_MAP[permission] || permission;

const permissionsForSubject = (subject) => {
  if (!subject) return [];
  if (typeof subject === "string") return ROLE_PERMISSIONS[subject] || [];
  if (Array.isArray(subject.permissions)) return subject.permissions;
  return ROLE_PERMISSIONS[subject.role] || [];
};

export const canAccessPermission = (subject, permission) => {
  const normalizedPermission = normalizePermission(permission);
  const permissions = permissionsForSubject(subject);
  if (permissions.includes("*") || permissions.includes(normalizedPermission)) return true;
  if (normalizedPermission === "service_jobs.view") {
    return permissions.some((grantedPermission) => grantedPermission.startsWith("service."));
  }
  return false;
};

export const permissionForPath = (pathname) => routePermissions.find((route) => route.pattern.test(pathname))?.permission;

export const canAccessPath = (subject, pathname) => {
  const permission = permissionForPath(pathname);
  return permission ? canAccessPermission(subject, permission) : true;
};

export const firstAllowedPath = (subject) => {
  if (canAccessPermission(subject, "dashboard.view")) return "/";

  const firstAllowed = routePermissions.find((route) => canAccessPermission(subject, route.permission));

  if (!firstAllowed) return "/login";
  if (firstAllowed.permission === "dashboard.view") return "/";
  return `/${Object.entries(LEGACY_PERMISSION_MAP).find(([, value]) => value === firstAllowed.permission)?.[0] || ""}`;
};
