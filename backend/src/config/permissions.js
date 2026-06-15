export const PERMISSION_CATALOG = [
  { key: 'dashboard.view', label: 'Dashboard', group: 'Pages' },
  { key: 'products.view', label: 'Products', group: 'Pages' },
  { key: 'categories.view', label: 'Categories', group: 'Pages' },
  { key: 'brands.view', label: 'Brands', group: 'Pages' },
  { key: 'suppliers.view', label: 'Suppliers', group: 'Pages' },
  { key: 'customers.view', label: 'Customers', group: 'Pages' },
  { key: 'cars.view', label: 'Cars', group: 'Pages' },
  { key: 'employees.view', label: 'Employees', group: 'Pages' },
  { key: 'attendance.view', label: 'Attendance', group: 'Pages' },
  { key: 'inventory_counts.view', label: 'Inventory Counts', group: 'Pages' },
  { key: 'purchases.view', label: 'Purchases', group: 'Pages' },
  { key: 'sales.view', label: 'Sales', group: 'Pages' },
  { key: 'service_jobs.view', label: 'Service Jobs', group: 'Pages' },
  { key: 'money_out.view', label: 'Money Out', group: 'Pages' },
  { key: 'stock_movements.view', label: 'Stock Movements', group: 'Pages' },
  { key: 'reports.view', label: 'Reports', group: 'Pages' },
  { key: 'accounts.manage', label: 'Accounts', group: 'Administration' },
  { key: 'backups.manage', label: 'Backups', group: 'Administration' },
  { key: 'service.reception.write', label: 'Reception Intake', group: 'Service Workflow' },
  { key: 'service.diagnosis.write', label: 'Technician Diagnosis', group: 'Service Workflow' },
  { key: 'service.estimate.write', label: 'Estimate and Approval', group: 'Service Workflow' },
  { key: 'service.parts.request', label: 'Request Parts', group: 'Service Workflow' },
  { key: 'service.parts.issue', label: 'Reserve and Issue Parts', group: 'Service Workflow' },
  { key: 'service.work.write', label: 'Work Execution', group: 'Service Workflow' },
  { key: 'service.qc.write', label: 'Quality Control', group: 'Service Workflow' },
  { key: 'service.invoice.write', label: 'Generate Service Invoice', group: 'Service Workflow' },
  { key: 'service.payment.write', label: 'Service Payments', group: 'Service Workflow' },
  { key: 'service.delivery.write', label: 'Delivery Handover', group: 'Service Workflow' },
  { key: 'service.cancel', label: 'Cancel Service Job', group: 'Service Workflow' },
];

export const ROLE_CATALOG = [
  { value: 'admin', label: 'Admin', className: 'badge-danger' },
  { value: 'manager', label: 'Manager', className: 'badge-info' },
  { value: 'cashier', label: 'Cashier', className: 'badge-success' },
  { value: 'inventory', label: 'Inventory', className: 'badge-warning' },
  { value: 'service_receptionist', label: 'Service Receptionist', className: 'badge-info' },
  { value: 'service_advisor', label: 'Service Advisor', className: 'badge-info' },
  { value: 'service_technician', label: 'Service Technician', className: 'badge-warning' },
  { value: 'parts_clerk', label: 'Parts Clerk', className: 'badge-warning' },
  { value: 'qc_inspector', label: 'QC Inspector', className: 'badge-success' },
  { value: 'delivery_coordinator', label: 'Delivery Coordinator', className: 'badge-neutral' },
];

export const ALLOWED_ROLES = ROLE_CATALOG.map((role) => role.value);

const catalogKeys = new Set(PERMISSION_CATALOG.map((permission) => permission.key));

const operationalPagePermissions = [
  'dashboard.view',
  'products.view',
  'categories.view',
  'brands.view',
  'suppliers.view',
  'customers.view',
  'cars.view',
  'employees.view',
  'attendance.view',
  'inventory_counts.view',
  'purchases.view',
  'sales.view',
  'service_jobs.view',
  'money_out.view',
  'stock_movements.view',
  'reports.view',
];

const allServiceWorkflowPermissions = [
  'service.reception.write',
  'service.diagnosis.write',
  'service.estimate.write',
  'service.parts.request',
  'service.parts.issue',
  'service.work.write',
  'service.qc.write',
  'service.invoice.write',
  'service.payment.write',
  'service.delivery.write',
  'service.cancel',
];

export const ROLE_PERMISSION_DEFAULTS = {
  admin: ['*'],
  manager: [...operationalPagePermissions, ...allServiceWorkflowPermissions],
  inventory: [
    'dashboard.view',
    'products.view',
    'inventory_counts.view',
    'purchases.view',
    'sales.view',
    'service_jobs.view',
    'stock_movements.view',
    'service.parts.request',
    'service.parts.issue',
  ],
  cashier: [
    'dashboard.view',
    'customers.view',
    'cars.view',
    'sales.view',
    'service_jobs.view',
    'service.payment.write',
  ],
  service_receptionist: [
    'dashboard.view',
    'customers.view',
    'cars.view',
    'service_jobs.view',
    'service.reception.write',
  ],
  service_advisor: [
    'dashboard.view',
    'customers.view',
    'cars.view',
    'sales.view',
    'service_jobs.view',
    'service.reception.write',
    'service.estimate.write',
    'service.parts.request',
    'service.invoice.write',
    'service.cancel',
  ],
  service_technician: [
    'dashboard.view',
    'service_jobs.view',
    'service.diagnosis.write',
    'service.parts.request',
    'service.work.write',
  ],
  parts_clerk: [
    'dashboard.view',
    'products.view',
    'service_jobs.view',
    'stock_movements.view',
    'service.parts.request',
    'service.parts.issue',
  ],
  qc_inspector: [
    'dashboard.view',
    'service_jobs.view',
    'service.qc.write',
  ],
  delivery_coordinator: [
    'dashboard.view',
    'service_jobs.view',
    'service.delivery.write',
  ],
};

export const roleDefaultPermissions = (role) => [...(ROLE_PERMISSION_DEFAULTS[role] || ROLE_PERMISSION_DEFAULTS.cashier)];

export const normalizePermissionList = (permissions = []) => {
  if (!Array.isArray(permissions)) {
    throw new Error('Permissions must be an array');
  }

  const normalized = [...new Set(permissions.map((permission) => String(permission || '').trim()).filter(Boolean))];
  const invalid = normalized.filter((permission) => permission !== '*' && !catalogKeys.has(permission));

  if (invalid.length) {
    const error = new Error(`Invalid permissions: ${invalid.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  return normalized.includes('*') ? ['*'] : normalized;
};

export const effectivePermissionsForUser = (user) => {
  if (!user) return [];
  if (user.role === 'admin') return ['*'];
  if (user.permissionsCustomized) {
    return normalizePermissionList((user.userPermissions || []).map((permission) => permission.permission));
  }
  return roleDefaultPermissions(user.role);
};

export const hasPermission = (user, permission) => {
  const permissions = user?.permissions || effectivePermissionsForUser(user);
  if (permissions.includes('*') || permissions.includes(permission)) return true;
  if (permission === 'service_jobs.view') {
    return permissions.some((grantedPermission) => grantedPermission.startsWith('service.'));
  }
  return false;
};
