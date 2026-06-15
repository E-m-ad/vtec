import prisma from "../../config/db.js";
import createError from "../../utils/createError.js";

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const cleanText = (value) => {
  if (typeof value === "undefined" || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const normalizePayments = ({ payments, amount = 0, payment_method = null, notes = null } = {}) => {
  if (Array.isArray(payments)) {
    return payments
      .map((payment) => {
        const paymentAmount = Number(payment.amount);

        if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
          throw createError("Payment amounts must be 0 or greater", 400);
        }

        return {
          amount: paymentAmount,
          payment_method: cleanText(payment.payment_method || payment.method) || "cash",
          notes: cleanText(payment.notes),
        };
      })
      .filter((payment) => payment.amount > 0);
  }

  const paymentAmount = Number(amount ?? 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
    throw createError("Payment amount must be 0 or greater", 400);
  }

  if (paymentAmount <= 0) return [];

  return [
    {
      amount: paymentAmount,
      payment_method: cleanText(payment_method) || "cash",
      notes: cleanText(notes),
    },
  ];
};

const buildSummary = (
  totalSalesValue = 0,
  totalPaidValue = 0,
  invoiceCount = 0,
  openingReceivableValue = 0,
  openingCreditValue = 0,
  accountPaymentValue = 0,
  refundValue = 0,
) => {
  const openingReceivable = toMoneyNumber(openingReceivableValue);
  const openingCredit = toMoneyNumber(openingCreditValue);
  const accountPayments = toMoneyNumber(accountPaymentValue);
  const customerRefunds = toMoneyNumber(refundValue);
  const totalSales = toMoneyNumber(totalSalesValue) + openingReceivable;
  const totalPaid = toMoneyNumber(totalPaidValue) + openingCredit + accountPayments - customerRefunds;
  const remainingAmount = totalSales - totalPaid;
  const openingBalanceRemaining = Math.max(openingReceivable - openingCredit - accountPayments + customerRefunds, 0);

  return {
    invoiceCount,
    invoice_count: invoiceCount,
    totalSales,
    total_sales: totalSales,
    totalPaid,
    total_paid: totalPaid,
    openingReceivable,
    opening_receivable: openingReceivable,
    openingCredit,
    opening_credit: openingCredit,
    accountPayments,
    account_payments: accountPayments,
    customerRefunds,
    customer_refunds: customerRefunds,
    openingBalanceRemaining,
    opening_balance_remaining: openingBalanceRemaining,
    remainingAmount,
    remaining_amount: remainingAmount,
    receivableAmount: Math.max(remainingAmount, 0),
    receivable_amount: Math.max(remainingAmount, 0),
    creditAmount: Math.max(-remainingAmount, 0),
    credit_amount: Math.max(-remainingAmount, 0),
  };
};

const addCustomerAliases = (customer) => ({
  ...customer,
  tax_number: customer.taxNumber,
  created_at: customer.createdAt,
  updated_at: customer.updatedAt,
});

const addOpeningBalanceAliases = (openingBalance) => ({
  ...openingBalance,
  customer_id: openingBalance.customerId,
  balance_date: openingBalance.balanceDate,
  created_by: openingBalance.createdBy,
  created_at: openingBalance.createdAt,
});

const addSaleAliases = (sale) => {
  const totalAmount = toMoneyNumber(sale.totalAmount);
  const paidAmount = toMoneyNumber(sale.paidAmount);
  const returnedAmount = Array.isArray(sale.returns)
    ? sale.returns.reduce((sum, saleReturn) => sum + toMoneyNumber(saleReturn.totalAmount), 0)
    : 0;
  const refundedAmount = Array.isArray(sale.refunds)
    ? sale.refunds.reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0)
    : 0;
  const netTotalAmount = Math.max(totalAmount - returnedAmount, 0);
  const effectivePaidAmount = Math.max(paidAmount - refundedAmount, 0);

  return {
    ...sale,
    customer_id: sale.customerId,
    car_id: sale.carId,
    customer_name: sale.customerName || sale.customer?.name || null,
    sale_number: sale.saleNumber,
    sale_date: sale.saleDate,
    total_amount: totalAmount,
    originalTotalAmount: totalAmount,
    original_total_amount: totalAmount,
    returnedAmount,
    returned_amount: returnedAmount,
    refundedAmount,
    refunded_amount: refundedAmount,
    netTotalAmount,
    net_total_amount: netTotalAmount,
    paid_amount: paidAmount,
    effectivePaidAmount,
    effective_paid_amount: effectivePaidAmount,
    remaining_amount: Math.max(netTotalAmount - effectivePaidAmount, 0),
    creditAmount: Math.max(effectivePaidAmount - netTotalAmount, 0),
    credit_amount: Math.max(effectivePaidAmount - netTotalAmount, 0),
    payment_method: sale.paymentMethod,
    payment_status: sale.paymentStatus,
    created_by: sale.createdBy,
    created_at: sale.createdAt,
    updated_at: sale.updatedAt,
    car: sale.car
      ? {
          ...sale.car,
          customer_id: sale.car.customerId,
          plate_number: sale.car.plateNumber,
        }
      : sale.car,
  };
};

const addCarAliases = (car) => ({
  ...car,
  customer_id: car.customerId,
  plate_number: car.plateNumber,
  created_at: car.createdAt,
  updated_at: car.updatedAt,
});

const addPaymentAliases = (payment) => ({
  ...payment,
  sale_id: payment.saleId,
  customer_id: payment.customerId,
  payment_date: payment.paymentDate,
  payment_method: payment.paymentMethod,
  created_by: payment.createdBy,
  created_at: payment.createdAt,
});

const addRefundAliases = (refund) => ({
  ...refund,
  customer_id: refund.customerId,
  sale_id: refund.saleId,
  refund_date: refund.refundDate,
  payment_method: refund.paymentMethod,
  created_by: refund.createdBy,
  created_at: refund.createdAt,
});

const decorateCustomersWithReceivables = async (customers) => {
  if (!Array.isArray(customers) || customers.length === 0) return [];

  const customerIds = customers.map((customer) => customer.id);
  const [saleTotals, saleReturnTotals, customerRefundTotals, openingTotals, accountPaymentTotals] = await Promise.all([
    prisma.sale.groupBy({
      by: ["customerId"],
      where: {
        customerId: {
          in: customerIds,
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
    }),
    prisma.saleReturn.groupBy({
      by: ["customerId"],
      where: {
        customerId: {
          in: customerIds,
        },
      },
      _sum: {
        totalAmount: true,
      },
    }),
    prisma.customerRefund.groupBy({
      by: ["customerId"],
      where: {
        customerId: {
          in: customerIds,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.customerOpeningBalance.groupBy({
      by: ["customerId", "type"],
      where: {
        customerId: {
          in: customerIds,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.customerPayment.groupBy({
      by: ["customerId"],
      where: {
        customerId: {
          in: customerIds,
        },
      },
      _sum: {
        amount: true,
      },
    }),
  ]);
  const openingReceivableMap = new Map();
  const openingCreditMap = new Map();
  const saleReturnMap = new Map(
    saleReturnTotals.map((entry) => [entry.customerId, toMoneyNumber(entry._sum.totalAmount)]),
  );
  const accountPaymentMap = new Map(
    accountPaymentTotals.map((entry) => [entry.customerId, toMoneyNumber(entry._sum.amount)]),
  );
  const customerRefundMap = new Map(
    customerRefundTotals.map((entry) => [entry.customerId, toMoneyNumber(entry._sum.amount)]),
  );

  openingTotals.forEach((entry) => {
    const targetMap = entry.type === "credit" ? openingCreditMap : openingReceivableMap;
    targetMap.set(entry.customerId, toMoneyNumber(entry._sum.amount));
  });
  const summaryMap = new Map(
    saleTotals.map((entry) => [
      entry.customerId,
      buildSummary(
        Math.max(toMoneyNumber(entry._sum.totalAmount) - toMoneyNumber(saleReturnMap.get(entry.customerId)), 0),
        entry._sum.paidAmount,
        Number(entry._count._all || 0),
        openingReceivableMap.get(entry.customerId),
        openingCreditMap.get(entry.customerId),
        accountPaymentMap.get(entry.customerId),
        customerRefundMap.get(entry.customerId),
      ),
    ]),
  );

  return customers.map((customer) => ({
    ...addCustomerAliases(customer),
    ...buildSummary(
      0,
      0,
      0,
      openingReceivableMap.get(customer.id),
      openingCreditMap.get(customer.id),
      accountPaymentMap.get(customer.id),
      customerRefundMap.get(customer.id),
    ),
    ...(summaryMap.get(customer.id) || {}),
  }));
};

export const listCustomers = async ({ search } = {}) => {
  const customers = await prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  });

  return decorateCustomersWithReceivables(customers);
};

export const getCustomerById = async (id) => {
  const customer = await prisma.customer.findUnique({
    where: { id: Number(id) },
  });

  if (!customer) {
    throw createError("Customer not found", 404);
  }

  const [decoratedCustomer] = await decorateCustomersWithReceivables([customer]);

  return decoratedCustomer;
};

export const getCustomerDetails = async (id) => {
  const customerId = Number(id);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) {
    throw createError("Customer not found", 404);
  }

  const [
    summaryCustomer,
    sales,
    cars,
    serviceJobs,
    invoicePayments,
    accountPayments,
    refunds,
    openingBalances,
  ] = await Promise.all([
    getCustomerById(customerId),
    prisma.sale.findMany({
      where: { customerId },
      include: {
        car: {
          select: {
            id: true,
            customerId: true,
            plateNumber: true,
            make: true,
            model: true,
            year: true,
            color: true,
          },
        },
        returns: {
          select: {
            totalAmount: true,
          },
        },
        refunds: {
          select: {
            amount: true,
          },
        },
      },
      orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    }),
    prisma.car.findMany({
      where: { customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.serviceJob.findMany({
      where: { customerId },
      include: {
        car: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            year: true,
          },
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            totalAmount: true,
          },
        },
      },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
    }),
    prisma.salePayment.findMany({
      where: {
        sale: {
          customerId,
        },
      },
      include: {
        sale: {
          select: {
            id: true,
            saleNumber: true,
            saleDate: true,
            totalAmount: true,
          },
        },
        creator: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    }),
    prisma.customerPayment.findMany({
      where: { customerId },
      include: {
        creator: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    }),
    prisma.customerRefund.findMany({
      where: { customerId },
      include: {
        sale: {
          select: {
            id: true,
            saleNumber: true,
            saleDate: true,
            totalAmount: true,
          },
        },
        creator: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ refundDate: "desc" }, { id: "desc" }],
    }),
    prisma.customerOpeningBalance.findMany({
      where: { customerId },
      include: {
        creator: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ balanceDate: "desc" }, { id: "desc" }],
    }),
  ]);

  const decoratedSales = sales.map(addSaleAliases);

  return {
    customer: summaryCustomer,
    summary: {
      ...summaryCustomer,
    },
    sales: decoratedSales,
    unpaid_sales: decoratedSales.filter((sale) => Number(sale.remaining_amount || 0) > 0),
    unpaidSales: decoratedSales.filter((sale) => Number(sale.remaining_amount || 0) > 0),
    cars: cars.map(addCarAliases),
    service_jobs: serviceJobs.map((job) => ({
      ...job,
      job_number: job.jobNumber,
      customer_id: job.customerId,
      car_id: job.carId,
      sale_id: job.saleId,
      start_date: job.startDate,
      expected_finish_date: job.expectedFinishDate,
      finished_at: job.finishedAt,
      created_by: job.createdBy,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      car: job.car
        ? {
            ...job.car,
            plate_number: job.car.plateNumber,
          }
        : job.car,
      sale: job.sale
        ? {
            ...job.sale,
            sale_number: job.sale.saleNumber,
            total_amount: job.sale.totalAmount,
          }
        : job.sale,
    })),
    serviceJobs,
    invoice_payments: invoicePayments.map(addPaymentAliases),
    invoicePayments: invoicePayments.map(addPaymentAliases),
    account_payments: accountPayments.map(addPaymentAliases),
    accountPayments: accountPayments.map(addPaymentAliases),
    refunds: refunds.map(addRefundAliases),
    customer_refunds: refunds.map(addRefundAliases),
    opening_balances: openingBalances.map(addOpeningBalanceAliases),
    openingBalances: openingBalances.map(addOpeningBalanceAliases),
    payments: [
      ...invoicePayments.map((payment) => ({
        ...addPaymentAliases(payment),
        source: "invoice",
      })),
      ...accountPayments.map((payment) => ({
        ...addPaymentAliases(payment),
        source: "account",
      })),
      ...refunds.map((refund) => ({
        ...addRefundAliases(refund),
        source: "refund",
      })),
    ].sort(
      (first, second) =>
        new Date(second.paymentDate || second.payment_date || second.refundDate || second.refund_date).getTime() -
        new Date(first.paymentDate || first.payment_date || first.refundDate || first.refund_date).getTime(),
    ),
  };
};

export const createCustomerOpeningBalance = async (
  id,
  { type = "receivable", amount, balance_date = new Date(), notes = null },
  createdBy,
) => {
  const customerId = Number(id);
  const parsedAmount = Number(amount);
  const balanceDate = new Date(balance_date);
  const balanceType = cleanText(type) || "receivable";

  if (!Number.isInteger(customerId)) {
    throw createError("Invalid customer id", 400);
  }

  if (!["receivable", "credit"].includes(balanceType)) {
    throw createError("Opening balance type must be receivable or credit", 400);
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw createError("Opening balance amount must be greater than 0", 400);
  }

  if (Number.isNaN(balanceDate.getTime())) {
    throw createError("Opening balance date is invalid", 400);
  }

  try {
    await prisma.customerOpeningBalance.create({
      data: {
        customerId,
        type: balanceType,
        amount: parsedAmount,
        balanceDate,
        notes: cleanText(notes),
        createdBy: createdBy ? Number(createdBy) : null,
      },
    });

    return getCustomerDetails(customerId);
  } catch (error) {
    if (error.code === "P2003") {
      throw createError("Invalid customer or user reference", 400);
    }

    throw error;
  }
};

export const createCustomerPayment = async (
  id,
  { amount, payment_date = new Date(), payment_method = null, notes = null, payments = undefined },
  createdBy,
) => {
  const customerId = Number(id);
  const parsedPayments = normalizePayments({ payments, amount, payment_method, notes });
  const paymentAmount = parsedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const paymentDate = new Date(payment_date);

  if (!Number.isInteger(customerId)) {
    throw createError("Invalid customer id", 400);
  }

  if (paymentAmount <= 0) {
    throw createError("Payment amount must be greater than 0", 400);
  }

  if (Number.isNaN(paymentDate.getTime())) {
    throw createError("Payment date is invalid", 400);
  }

  try {
    const customer = await getCustomerById(customerId);
    const maxAccountPayment = Number(customer.openingBalanceRemaining || customer.opening_balance_remaining || 0);

    if (paymentAmount > maxAccountPayment) {
      throw createError("Payment cannot be greater than opening balance remaining amount", 400);
    }

    await prisma.$transaction(
      parsedPayments.map((payment) =>
        prisma.customerPayment.create({
          data: {
            customerId,
            amount: payment.amount,
            paymentDate,
            paymentMethod: payment.payment_method,
            notes: payment.notes || "Opening balance / account payment",
            createdBy: createdBy ? Number(createdBy) : null,
          },
        }),
      ),
    );

    return getCustomerDetails(customerId);
  } catch (error) {
    if (error.code === "P2003") {
      throw createError("Invalid customer or user reference", 400);
    }

    throw error;
  }
};

const saleCreditAmount = (sale) => {
  const returnedAmount = Array.isArray(sale.returns)
    ? sale.returns.reduce((sum, saleReturn) => sum + toMoneyNumber(saleReturn.totalAmount), 0)
    : 0;
  const refundedAmount = Array.isArray(sale.refunds)
    ? sale.refunds.reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0)
    : 0;
  const netTotalAmount = Math.max(toMoneyNumber(sale.totalAmount) - returnedAmount, 0);
  const effectivePaidAmount = Math.max(toMoneyNumber(sale.paidAmount) - refundedAmount, 0);

  return Math.max(effectivePaidAmount - netTotalAmount, 0);
};

const derivePaymentStatus = (paidAmount, totalAmount) => {
  if (totalAmount <= 0) return "paid";
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= totalAmount) return "paid";
  return "partial";
};

export const createCustomerRefund = async (
  id,
  { amount, refund_date = new Date(), payment_method = null, notes = null, sale_id = null },
  createdBy,
) => {
  const customerId = Number(id);
  const parsedAmount = Number(amount);
  const refundDate = new Date(refund_date);
  const selectedSaleId =
    sale_id === undefined || sale_id === null || sale_id === ""
      ? null
      : Number(sale_id);

  if (!Number.isInteger(customerId)) {
    throw createError("Invalid customer id", 400);
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw createError("Refund amount must be greater than 0", 400);
  }

  if (Number.isNaN(refundDate.getTime())) {
    throw createError("Refund date is invalid", 400);
  }

  if (selectedSaleId !== null && !Number.isInteger(selectedSaleId)) {
    throw createError("Invalid sale invoice", 400);
  }

  try {
    const customerSummary = selectedSaleId ? null : await getCustomerById(customerId);

    if (!selectedSaleId && parsedAmount > Number(customerSummary.creditAmount || customerSummary.credit_amount || 0)) {
      throw createError("Refund cannot be greater than customer credit balance", 400);
    }

    await prisma.$transaction(async (client) => {
      const customer = await client.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });

      if (!customer) {
        throw createError("Customer not found", 404);
      }

      if (selectedSaleId) {
        const sale = await client.sale.findFirst({
          where: { id: selectedSaleId, customerId },
          include: {
            returns: {
              select: { totalAmount: true },
            },
            refunds: {
              select: { amount: true },
            },
          },
        });

        if (!sale) {
          throw createError("Sale invoice not found for this customer", 404);
        }

        const creditAmount = saleCreditAmount(sale);
        if (parsedAmount > creditAmount) {
          throw createError("Refund cannot be greater than selected invoice customer credit", 400);
        }
      }

      await client.customerRefund.create({
        data: {
          customerId,
          saleId: selectedSaleId,
          amount: parsedAmount,
          refundDate,
          paymentMethod: cleanText(payment_method) || "cash",
          notes: cleanText(notes),
          createdBy: createdBy ? Number(createdBy) : null,
        },
      });

      if (selectedSaleId) {
        const refreshedSale = await client.sale.findUnique({
          where: { id: selectedSaleId },
          include: {
            returns: { select: { totalAmount: true } },
            refunds: { select: { amount: true } },
          },
        });
        const returnedAmount = refreshedSale.returns.reduce(
          (sum, saleReturn) => sum + toMoneyNumber(saleReturn.totalAmount),
          0,
        );
        const refundedAmount = refreshedSale.refunds.reduce(
          (sum, refund) => sum + toMoneyNumber(refund.amount),
          0,
        );
        const netTotalAmount = Math.max(toMoneyNumber(refreshedSale.totalAmount) - returnedAmount, 0);
        const effectivePaidAmount = Math.max(toMoneyNumber(refreshedSale.paidAmount) - refundedAmount, 0);

        await client.sale.update({
          where: { id: selectedSaleId },
          data: {
            paymentStatus: derivePaymentStatus(effectivePaidAmount, netTotalAmount),
          },
        });
      }
    });

    return getCustomerDetails(customerId);
  } catch (error) {
    if (error.code === "P2003") {
      throw createError("Invalid customer, sale, or user reference", 400);
    }

    throw error;
  }
};

export const createCustomer = async ({
  name,
  phone = null,
  email = null,
  address = null,
  tax_number = null,
  notes = null,
}) => {
  if (!cleanText(name)) {
    throw createError("Customer name is required", 400);
  }

  return prisma.customer.create({
    data: {
      name: cleanText(name),
      phone: cleanText(phone),
      email: cleanText(email),
      address: cleanText(address),
      taxNumber: cleanText(tax_number),
      notes: cleanText(notes),
    },
  });
};

export const updateCustomer = async (
  id,
  { name, phone, email, address, tax_number, notes },
) => {
  const data = {};

  if (typeof name !== "undefined") data.name = cleanText(name);
  if (typeof phone !== "undefined") data.phone = cleanText(phone);
  if (typeof email !== "undefined") data.email = cleanText(email);
  if (typeof address !== "undefined") data.address = cleanText(address);
  if (typeof tax_number !== "undefined") data.taxNumber = cleanText(tax_number);
  if (typeof notes !== "undefined") data.notes = cleanText(notes);

  if (typeof data.name !== "undefined" && !data.name) {
    throw createError("Customer name is required", 400);
  }

  try {
    return await prisma.customer.update({
      where: { id: Number(id) },
      data,
    });
  } catch (error) {
    if (error.code === "P2025") {
      throw createError("Customer not found", 404);
    }

    if (error.code === "P2003") {
      throw createError("Customer cannot be deleted because it has linked history", 409);
    }

    throw error;
  }
};

export const deleteCustomer = async (id) => {
  try {
    return await prisma.customer.delete({
      where: { id: Number(id) },
    });
  } catch (error) {
    if (error.code === "P2025") {
      throw createError("Customer not found", 404);
    }

    throw error;
  }
};
