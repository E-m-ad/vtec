import prisma from "../../config/db.js";

const employeeCashOutTypes = ["salary_payment", "advance", "bonus", "allowance"];

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => Math.round(toMoneyNumber(value) * 100) / 100;

const appendDateConditions = (
  conditions,
  params,
  alias,
  dateColumn,
  { from, to } = {},
) => {
  if (from) {
    params.push(from);
    conditions.push(`${alias}.${dateColumn} >= $${params.length}`);
  }

  if (to) {
    params.push(to);
    conditions.push(`${alias}.${dateColumn} <= $${params.length}`);
  }
};

const buildSalesFilter = (filters = {}) => {
  const conditions = [];
  const params = [];

  appendDateConditions(conditions, params, "s", "sale_date", filters);

  const query = String(filters.search || "").trim();
  if (query) {
    const searchConditions = [];
    const numericQuery = Number(query);

    if (Number.isInteger(numericQuery)) {
      params.push(numericQuery);
      searchConditions.push(`s.id = $${params.length}`);
    }

    params.push(`%${query}%`);
    const searchParam = `$${params.length}`;
    searchConditions.push(
      `s.sale_number ILIKE ${searchParam}`,
      `s.customer_name ILIKE ${searchParam}`,
      `EXISTS (
        SELECT 1
        FROM customers sc
        WHERE sc.id = s.customer_id
          AND (sc.name ILIKE ${searchParam} OR sc.phone ILIKE ${searchParam} OR sc.email ILIKE ${searchParam})
      )`,
      `EXISTS (
        SELECT 1
        FROM cars scar
        WHERE scar.id = s.car_id
          AND (
            scar.plate_number ILIKE ${searchParam}
            OR scar.vin ILIKE ${searchParam}
            OR scar.make ILIKE ${searchParam}
            OR scar.model ILIKE ${searchParam}
          )
      )`,
      `EXISTS (
        SELECT 1
        FROM sale_items ssi
        LEFT JOIN products sp ON sp.id = ssi.product_id
        WHERE ssi.sale_id = s.id
          AND (
            ssi.description ILIKE ${searchParam}
            OR sp.sku ILIKE ${searchParam}
            OR sp.barcode ILIKE ${searchParam}
            OR sp.name ILIKE ${searchParam}
          )
      )`,
    );

    conditions.push(`(${searchConditions.join(" OR ")})`);
  }

  return {
    params,
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
  };
};

const buildPurchaseFilter = (filters = {}) => {
  const conditions = [];
  const params = [];

  appendDateConditions(conditions, params, "p", "purchase_date", filters);

  const query = String(filters.search || "").trim();
  if (query) {
    const searchConditions = [];
    const numericQuery = Number(query);

    if (Number.isInteger(numericQuery)) {
      params.push(numericQuery);
      searchConditions.push(`p.id = $${params.length}`);
    }

    params.push(`%${query}%`);
    const searchParam = `$${params.length}`;
    searchConditions.push(
      `p.invoice_number ILIKE ${searchParam}`,
      `EXISTS (
        SELECT 1
        FROM suppliers ps
        WHERE ps.id = p.supplier_id
          AND (ps.name ILIKE ${searchParam} OR ps.phone ILIKE ${searchParam} OR ps.email ILIKE ${searchParam})
      )`,
      `EXISTS (
        SELECT 1
        FROM purchase_items ppi
        JOIN products pp ON pp.id = ppi.product_id
        WHERE ppi.purchase_id = p.id
          AND (pp.sku ILIKE ${searchParam} OR pp.barcode ILIKE ${searchParam} OR pp.name ILIKE ${searchParam})
      )`,
    );

    conditions.push(`(${searchConditions.join(" OR ")})`);
  }

  return {
    params,
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
  };
};

const buildPaymentDateRange = ({ from, to } = {}) => {
  const dateRange = {};

  if (from) dateRange.gte = new Date(from);
  if (to) dateRange.lt = new Date(to);

  return Object.keys(dateRange).length ? dateRange : undefined;
};

const normalizeReportPagination = ({ limit, offset = 0 } = {}) => {
  if (typeof limit === "undefined") return null;

  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), 500)
      : 50;
  const safeOffset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 0;

  return {
    limit: safeLimit,
    offset: safeOffset,
  };
};

const stockAlertColumns = `
  SELECT p.id,
         p.sku,
         p.name,
         c.name AS category_name,
         b.name AS brand_name,
         p.stock_quantity,
         p.min_stock_level,
         p.location
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
`;

const stockAlertOrderBy = `
  ORDER BY (p.stock_quantity - p.min_stock_level) ASC, p.name ASC
`;

const buildStockAlertReport = async ({ mode = "low-stock", limit, offset } = {}) => {
  const pagination = normalizeReportPagination({ limit, offset });
  const condition =
    mode === "out-of-stock"
      ? "p.is_active = true AND p.stock_quantity = 0"
      : "p.is_active = true AND p.stock_quantity <= p.min_stock_level";

  if (!pagination) {
    return prisma.$queryRawUnsafe(
      `${stockAlertColumns}
       WHERE ${condition}
       ${stockAlertOrderBy}`,
    );
  }

  const [products, totalResult] = await Promise.all([
    prisma.$queryRawUnsafe(
      `${stockAlertColumns}
       WHERE ${condition}
       ${stockAlertOrderBy}
       LIMIT $1 OFFSET $2`,
      pagination.limit,
      pagination.offset,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total
       FROM products p
       WHERE ${condition}`,
    ),
  ]);
  const total = Number(totalResult[0]?.total || 0);
  const page = Math.floor(pagination.offset / pagination.limit) + 1;
  const pageCount = Math.max(Math.ceil(total / pagination.limit), 1);

  return {
    summary: {
      total,
    },
    products,
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      page,
      page_count: pageCount,
      has_previous: pagination.offset > 0,
      has_next: pagination.offset + pagination.limit < total,
    },
  };
};

export const getInventoryReport = async () => {
  const summaryResult = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS product_count,
           COALESCE(SUM(stock_quantity), 0)::int AS total_units,
           COALESCE(SUM(stock_quantity * purchase_price), 0) AS inventory_cost_value,
           COALESCE(SUM(stock_quantity * sale_price), 0) AS inventory_sale_value
    FROM products
    WHERE is_active = true
  `;

  const productsResult = await prisma.$queryRaw`
    SELECT p.id,
           p.sku,
           p.name,
           c.name AS category_name,
           b.name AS brand_name,
           p.stock_quantity,
           p.min_stock_level,
           p.purchase_price,
           p.sale_price,
           p.location,
           (p.stock_quantity * p.purchase_price) AS stock_cost_value,
           (p.stock_quantity * p.sale_price) AS stock_sale_value
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.is_active = true
    ORDER BY p.name ASC
  `;

  return {
    summary: summaryResult[0],
    products: productsResult,
  };
};

export const getLowStockReport = async (filters = {}) =>
  buildStockAlertReport({ ...filters, mode: "low-stock" });

export const getOutOfStockReport = async (filters = {}) =>
  buildStockAlertReport({ ...filters, mode: "out-of-stock" });

export const getCashFlowReport = async (filters = {}) => {
  const paymentDateRange = buildPaymentDateRange(filters);
  const paymentDateWhere = paymentDateRange
    ? { paymentDate: paymentDateRange }
    : {};
  const transactionDateWhere = paymentDateRange
    ? { transactionDate: paymentDateRange }
    : {};
  const expenseDateWhere = paymentDateRange
    ? { expenseDate: paymentDateRange }
    : {};
  const refundDateWhere = paymentDateRange
    ? { refundDate: paymentDateRange }
    : {};

  const [
    salePayments,
    openServiceJobPayments,
    supplierCashRefunds,
    supplierPayments,
    customerRefunds,
    employeeCashOut,
    generalExpenses,
  ] = await Promise.all([
    prisma.salePayment.aggregate({
      where: paymentDateWhere,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.serviceJobPayment.aggregate({
      where: {
        ...paymentDateWhere,
        job: {
          is: {
            saleId: null,
          },
        },
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.supplierRefund.aggregate({
      where: {
        ...refundDateWhere,
        type: "cash_refund",
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.supplierPayment.aggregate({
      where: paymentDateWhere,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.customerRefund.aggregate({
      where: refundDateWhere,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.employeeSalaryTransaction.aggregate({
      where: {
        ...transactionDateWhere,
        type: {
          in: employeeCashOutTypes,
        },
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.generalExpense.aggregate({
      where: expenseDateWhere,
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const salePaymentAmount = toMoneyNumber(salePayments._sum.amount);
  const openServicePaymentAmount = toMoneyNumber(
    openServiceJobPayments._sum.amount,
  );
  const supplierCashRefundAmount = toMoneyNumber(supplierCashRefunds._sum.amount);
  const supplierPaymentAmount = toMoneyNumber(supplierPayments._sum.amount);
  const customerRefundAmount = toMoneyNumber(customerRefunds._sum.amount);
  const employeeCashOutAmount = toMoneyNumber(employeeCashOut._sum.amount);
  const generalExpenseAmount = toMoneyNumber(generalExpenses._sum.amount);
  const totalCashIn = salePaymentAmount + openServicePaymentAmount + supplierCashRefundAmount;
  const totalCashOut =
    supplierPaymentAmount + customerRefundAmount + employeeCashOutAmount + generalExpenseAmount;

  return {
    summary: {
      total_cash_in: roundMoney(totalCashIn),
      sale_payments: roundMoney(salePaymentAmount),
      open_service_job_payments: roundMoney(openServicePaymentAmount),
      supplier_cash_refunds: roundMoney(supplierCashRefundAmount),
      cash_in_count:
        Number(salePayments._count._all || 0) +
        Number(openServiceJobPayments._count._all || 0) +
        Number(supplierCashRefunds._count._all || 0),
      total_cash_out: roundMoney(totalCashOut),
      supplier_payments: roundMoney(supplierPaymentAmount),
      customer_refunds: roundMoney(customerRefundAmount),
      employee_cash_out: roundMoney(employeeCashOutAmount),
      general_expenses: roundMoney(generalExpenseAmount),
      cash_out_count:
        Number(supplierPayments._count._all || 0) +
        Number(customerRefunds._count._all || 0) +
        Number(employeeCashOut._count._all || 0) +
        Number(generalExpenses._count._all || 0),
      net_cash: roundMoney(totalCashIn - totalCashOut),
    },
  };
};

export const getSalesSummaryReport = async (filters = {}) => {
  const { params, whereClause } = buildSalesFilter(filters);

  const summaryResult = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS sale_count,
            COALESCE(SUM(GREATEST(s.total_amount - COALESCE(sr.returned_amount, 0), 0)), 0) AS total_sales_amount,
            COALESCE(SUM(GREATEST(s.paid_amount - COALESCE(cr.refunded_amount, 0), 0)), 0) AS total_paid_amount,
            COALESCE(SUM(COALESCE(sr.returned_amount, 0)), 0) AS total_returned_amount,
            COALESCE(SUM(COALESCE(cr.refunded_amount, 0)), 0) AS total_customer_refunded_amount,
            COALESCE(SUM(GREATEST(s.total_amount - COALESCE(sr.returned_amount, 0) - GREATEST(s.paid_amount - COALESCE(cr.refunded_amount, 0), 0), 0)), 0) AS total_remaining_amount
     FROM sales s
     LEFT JOIN (
       SELECT sale_id, COALESCE(SUM(total_amount), 0) AS returned_amount
       FROM sale_returns
       GROUP BY sale_id
     ) sr ON sr.sale_id = s.id
     LEFT JOIN (
       SELECT sale_id, COALESCE(SUM(amount), 0) AS refunded_amount
       FROM customer_refunds
       WHERE sale_id IS NOT NULL
       GROUP BY sale_id
     ) cr ON cr.sale_id = s.id
     ${whereClause}`,
    ...params,
  );

  const unitsResult = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(GREATEST(si.quantity - COALESCE(sri.returned_quantity, 0), 0)), 0)::int AS total_units_sold
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN (
       SELECT sale_item_id, COALESCE(SUM(quantity), 0)::int AS returned_quantity
       FROM sale_return_items
       GROUP BY sale_item_id
     ) sri ON sri.sale_item_id = si.id
     ${whereClause}
     ${whereClause ? "AND" : "WHERE"} si.line_type = 'product'`,
    ...params,
  );

  const topProductsResult = await prisma.$queryRawUnsafe(
    `SELECT p.id,
            p.sku,
            p.name,
            COALESCE(SUM(GREATEST(si.quantity - COALESCE(sri.returned_quantity, 0), 0)), 0)::int AS units_sold,
            COALESCE(SUM(GREATEST(si.line_total - COALESCE(sri.returned_amount, 0), 0)), 0) AS sales_amount
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     LEFT JOIN (
       SELECT sale_item_id,
              COALESCE(SUM(quantity), 0)::int AS returned_quantity,
              COALESCE(SUM(line_total), 0) AS returned_amount
       FROM sale_return_items
       GROUP BY sale_item_id
     ) sri ON sri.sale_item_id = si.id
     ${whereClause}
     ${whereClause ? "AND" : "WHERE"} si.line_type = 'product'
     GROUP BY p.id, p.sku, p.name
     ORDER BY units_sold DESC, sales_amount DESC
     LIMIT 10`,
    ...params,
  );

  const topCarsResult = await prisma.$queryRawUnsafe(
    `SELECT c.id,
            c.plate_number,
            c.vin,
            c.make,
            c.model,
            c.year,
            c.color,
            cust.id AS customer_id,
            COALESCE(cust.name, MAX(s.customer_name), 'Walk-in customer') AS customer_name,
            cust.phone AS customer_phone,
            cust.email AS customer_email,
            COUNT(s.id)::int AS sale_count,
            COALESCE(SUM(GREATEST(s.total_amount - COALESCE(sr.returned_amount, 0), 0)), 0) AS sales_amount,
            COALESCE(SUM(GREATEST(s.paid_amount - COALESCE(cr.refunded_amount, 0), 0)), 0) AS paid_amount,
            MAX(s.sale_date) AS last_sale_date
     FROM sales s
     JOIN cars c ON c.id = s.car_id
     LEFT JOIN customers cust ON cust.id = COALESCE(s.customer_id, c.customer_id)
     LEFT JOIN (
       SELECT sale_id, COALESCE(SUM(total_amount), 0) AS returned_amount
       FROM sale_returns
       GROUP BY sale_id
     ) sr ON sr.sale_id = s.id
     LEFT JOIN (
       SELECT sale_id, COALESCE(SUM(amount), 0) AS refunded_amount
       FROM customer_refunds
       WHERE sale_id IS NOT NULL
       GROUP BY sale_id
     ) cr ON cr.sale_id = s.id
     ${whereClause}
     GROUP BY c.id, c.plate_number, c.vin, c.make, c.model, c.year, c.color, cust.id, cust.name, cust.phone, cust.email
     ORDER BY sales_amount DESC, sale_count DESC, last_sale_date DESC
     LIMIT 10`,
    ...params,
  );

  return {
    summary: {
      ...summaryResult[0],
      total_units_sold: unitsResult[0].total_units_sold,
    },
    top_products: topProductsResult,
    top_cars: topCarsResult,
  };
};

export const getPurchaseSummaryReport = async (filters = {}) => {
  const { params, whereClause } = buildPurchaseFilter(filters);

  const summaryResult = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS purchase_count,
            COALESCE(SUM(GREATEST(p.total_amount - COALESCE(pr.returned_amount, 0), 0)), 0) AS total_purchase_amount,
            COALESCE(SUM(COALESCE(pr.returned_amount, 0)), 0) AS total_returned_amount,
            COALESCE(SUM(COALESCE(sp.paid_amount, 0) + COALESCE(sps.settled_amount, 0) + COALESCE(pr.returned_amount, 0) + COALESCE(srf.credit_amount, 0)), 0) AS total_paid_amount,
            COALESCE(SUM(GREATEST(p.total_amount - COALESCE(pr.returned_amount, 0) - COALESCE(sp.paid_amount, 0) - COALESCE(sps.settled_amount, 0) - COALESCE(srf.credit_amount, 0), 0)), 0) AS total_remaining_amount
     FROM purchases p
     LEFT JOIN (
       SELECT purchase_id, COALESCE(SUM(amount), 0) AS paid_amount
       FROM supplier_payments
       GROUP BY purchase_id
     ) sp ON sp.purchase_id = p.id
     LEFT JOIN (
       SELECT purchase_id, COALESCE(SUM(amount), 0) AS settled_amount
       FROM supplier_product_settlement_allocations
       GROUP BY purchase_id
     ) sps ON sps.purchase_id = p.id
     LEFT JOIN (
       SELECT purchase_id, COALESCE(SUM(total_amount), 0) AS returned_amount
       FROM purchase_returns
       GROUP BY purchase_id
     ) pr ON pr.purchase_id = p.id
     LEFT JOIN (
       SELECT purchase_id, COALESCE(SUM(amount), 0) AS credit_amount
       FROM supplier_refunds
       WHERE purchase_id IS NOT NULL AND type = 'credit_note'
       GROUP BY purchase_id
     ) srf ON srf.purchase_id = p.id
     ${whereClause}`,
    ...params,
  );

  const unitsResult = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(GREATEST(pi.quantity - COALESCE(pri.returned_quantity, 0), 0)), 0)::int AS total_units_purchased
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchase_id
     LEFT JOIN (
       SELECT purchase_item_id, COALESCE(SUM(quantity), 0)::int AS returned_quantity
       FROM purchase_return_items
       GROUP BY purchase_item_id
     ) pri ON pri.purchase_item_id = pi.id
     ${whereClause}`,
    ...params,
  );

  const bySupplierResult = await prisma.$queryRawUnsafe(
    `SELECT s.id,
            s.name,
            COUNT(DISTINCT p.id)::int AS purchase_count,
            COALESCE(SUM(GREATEST(p.total_amount - COALESCE(pr.returned_amount, 0), 0)), 0) AS purchase_amount
     FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN (
       SELECT purchase_id, COALESCE(SUM(total_amount), 0) AS returned_amount
       FROM purchase_returns
       GROUP BY purchase_id
     ) pr ON pr.purchase_id = p.id
     ${whereClause}
     GROUP BY s.id, s.name
     ORDER BY purchase_amount DESC
     LIMIT 10`,
    ...params,
  );

  return {
    summary: {
      ...summaryResult[0],
      total_units_purchased: unitsResult[0].total_units_purchased,
    },
    by_supplier: bySupplierResult,
  };
};
