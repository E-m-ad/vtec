import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import { compactPlateNumber, normalizePlateNumber, normalizePlateNumberSearch } from '../../utils/plateNumber.js';

const cleanText = (value) => {
  if (typeof value === 'undefined') return undefined;
  if (value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const normalizeYear = (value) => {
  const year = cleanText(value);

  if (typeof year === 'undefined' || year === null) return year;

  const numericYear = Number(year);
  const currentYear = new Date().getFullYear() + 1;

  if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > currentYear) {
    throw createError(`Car year must be between 1900 and ${currentYear}`, 400);
  }

  return numericYear;
};

const normalizeCustomerId = (value) => {
  const customerId = cleanText(value);

  if (typeof customerId === 'undefined' || customerId === null) return customerId;

  const numericCustomerId = Number(customerId);
  if (!Number.isInteger(numericCustomerId)) {
    throw createError('Invalid car owner', 400);
  }

  return numericCustomerId;
};

const buildCarData = (payload = {}, { partial = false } = {}) => {
  const data = {};
  const make = cleanText(payload.make);
  const model = cleanText(payload.model);

  if (!partial || typeof payload.make !== 'undefined') {
    if (!make) {
      throw createError('Car make is required', 400);
    }

    data.make = make;
  }

  if (!partial || typeof payload.model !== 'undefined') {
    if (!model) {
      throw createError('Car model is required', 400);
    }

    data.model = model;
  }

  if (!partial || typeof payload.plate_number !== 'undefined' || typeof payload.plateNumber !== 'undefined') {
    data.plateNumber = normalizePlateNumber(payload.plate_number ?? payload.plateNumber);
  }

  const fieldMap = {
    vin: 'vin',
    color: 'color',
    notes: 'notes',
  };

  Object.entries(fieldMap).forEach(([source, target]) => {
    if (!partial || typeof payload[source] !== 'undefined') {
      data[target] = cleanText(payload[source]);
    }
  });

  if (!partial || typeof payload.year !== 'undefined') {
    data.year = normalizeYear(payload.year);
  }

  if (!partial || typeof payload.customer_id !== 'undefined') {
    data.customerId = normalizeCustomerId(payload.customer_id);
  }

  return data;
};

const handleCarError = (error) => {
  if (error.code === 'P2002') {
    throw createError('Plate number or VIN already exists', 409);
  }

  if (error.code === 'P2025') {
    throw createError('Car not found', 404);
  }

  if (error.code === 'P2003') {
    throw createError('Invalid car owner reference', 400);
  }

  throw error;
};

const ensureEquivalentPlateNumberIsAvailable = async (plateNumber, ignoreId = null) => {
  const compactPlate = compactPlateNumber(plateNumber);
  if (!compactPlate) return;

  const cars = await prisma.car.findMany({
    where: {
      plateNumber: { not: null },
      ...(ignoreId ? { id: { not: Number(ignoreId) } } : {}),
    },
    select: {
      id: true,
      plateNumber: true,
    },
  });
  const duplicate = cars.find((car) => compactPlateNumber(car.plateNumber) === compactPlate);

  if (duplicate) {
    throw createError('Plate number already exists', 409, {
      duplicate_car_id: duplicate.id,
      duplicate_plate_number: duplicate.plateNumber,
    });
  }
};

const decorateCar = (car) => {
  if (!car) return car;

  return {
    ...car,
    customer_id: car.customerId,
    customer_name: car.customer?.name || null,
    plate_number: car.plateNumber,
    created_at: car.createdAt,
    updated_at: car.updatedAt,
  };
};

const decorateSale = (sale) => {
  const totalAmount = toMoneyNumber(sale.totalAmount);
  const paidAmount = toMoneyNumber(sale.paidAmount);
  const returnedAmount = Array.isArray(sale.returns)
    ? sale.returns.reduce((sum, saleReturn) => sum + toMoneyNumber(saleReturn.totalAmount), 0)
    : 0;
  const netTotalAmount = Math.max(totalAmount - returnedAmount, 0);
  const remainingAmount = Math.max(netTotalAmount - paidAmount, 0);

  return {
    ...sale,
    customer_id: sale.customerId,
    customer_name: sale.customerName || sale.customer?.name || null,
    car_id: sale.carId,
    sale_number: sale.saleNumber,
    sale_date: sale.saleDate,
    total_amount: totalAmount,
    originalTotalAmount: totalAmount,
    original_total_amount: totalAmount,
    returnedAmount,
    returned_amount: returnedAmount,
    netTotalAmount,
    net_total_amount: netTotalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    remainingAmount,
    payment_method: sale.paymentMethod,
    payment_status: sale.paymentStatus,
    created_by: sale.createdBy,
    created_at: sale.createdAt,
    updated_at: sale.updatedAt,
  };
};

const decorateServiceJob = (job) => {
  const items = Array.isArray(job.items) ? job.items : [];
  const payments = Array.isArray(job.payments) ? job.payments : [];
  const totalAmount = items.reduce((sum, item) => sum + toMoneyNumber(item.lineTotal), 0);
  const paidAmount = payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0);
  const remainingAmount = Math.max(totalAmount - paidAmount, 0);

  return {
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
    totalAmount,
    total_amount: totalAmount,
    paidAmount,
    paid_amount: paidAmount,
    remainingAmount,
    remaining_amount: remainingAmount,
  };
};

export const listCars = async ({ search, customer_id } = {}) => {
  const where = {};
  const ownerId = cleanText(customer_id);

  if (ownerId) {
    where.customerId = Number(ownerId);
  }

  if (search) {
    const query = search.trim();
    const normalizedPlateQuery = normalizePlateNumberSearch(query);
    const plateQueries = [...new Set([query, normalizedPlateQuery].filter(Boolean))];
    where.OR = [
      ...plateQueries.map((plateQuery) => ({ plateNumber: { contains: plateQuery, mode: 'insensitive' } })),
      { vin: { contains: query, mode: 'insensitive' } },
      { make: { contains: query, mode: 'insensitive' } },
      { model: { contains: query, mode: 'insensitive' } },
      { color: { contains: query, mode: 'insensitive' } },
      { customer: { name: { contains: query, mode: 'insensitive' } } },
    ];
  }

  const cars = await prisma.car.findMany({
    where,
    include: {
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
    orderBy: [{ make: 'asc' }, { model: 'asc' }, { plateNumber: 'asc' }],
  });

  return cars.map(decorateCar);
};

export const getCarById = async (id) => {
  const car = await prisma.car.findUnique({
    where: { id: Number(id) },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
    },
  });

  if (!car) {
    throw createError('Car not found', 404);
  }

  return decorateCar(car);
};

export const getCarDetails = async (id) => {
  const carId = Number(id);
  const [car, sales, serviceJobs] = await Promise.all([
    prisma.car.findUnique({
      where: { id: carId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    }),
    prisma.sale.findMany({
      where: { carId },
      include: {
        customer: {
          select: {
            name: true,
          },
        },
        creator: {
          select: {
            name: true,
          },
        },
        returns: {
          select: {
            totalAmount: true,
          },
        },
      },
      orderBy: [{ saleDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.serviceJob.findMany({
      where: { carId },
      include: {
        customer: {
          select: {
            name: true,
          },
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
          },
        },
        items: {
          select: {
            lineTotal: true,
          },
        },
        payments: {
          select: {
            amount: true,
          },
        },
      },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    }),
  ]);

  if (!car) {
    throw createError('Car not found', 404);
  }

  const decoratedSales = sales.map(decorateSale);
  const decoratedServiceJobs = serviceJobs.map(decorateServiceJob);
  const summary = decoratedSales.reduce(
    (totals, sale) => ({
      invoiceCount: totals.invoiceCount + 1,
      invoice_count: totals.invoice_count + 1,
      totalSales: totals.totalSales + toMoneyNumber(sale.total_amount),
      total_sales: totals.total_sales + toMoneyNumber(sale.total_amount),
      totalPaid: totals.totalPaid + toMoneyNumber(sale.paid_amount),
      total_paid: totals.total_paid + toMoneyNumber(sale.paid_amount),
      remainingAmount: totals.remainingAmount + toMoneyNumber(sale.remaining_amount),
      remaining_amount: totals.remaining_amount + toMoneyNumber(sale.remaining_amount),
    }),
    {
      invoiceCount: 0,
      invoice_count: 0,
      totalSales: 0,
      total_sales: 0,
      totalPaid: 0,
      total_paid: 0,
      remainingAmount: 0,
      remaining_amount: 0,
    },
  );

  summary.serviceJobCount = decoratedServiceJobs.length;
  summary.service_job_count = decoratedServiceJobs.length;
  summary.activeServiceJobCount = decoratedServiceJobs.filter(
    (job) => !['CLOSED', 'DELIVERED', 'CANCELLED', 'REJECTED'].includes(job.status),
  ).length;
  summary.active_service_job_count = summary.activeServiceJobCount;

  return {
    car: decorateCar(car),
    summary,
    sales: decoratedSales,
    serviceJobs: decoratedServiceJobs,
    service_jobs: decoratedServiceJobs,
  };
};

export const createCar = async (payload) => {
  try {
    const data = buildCarData(payload);
    await ensureEquivalentPlateNumberIsAvailable(data.plateNumber);

    return decorateCar(
      await prisma.car.create({
        data,
        include: {
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      }),
    );
  } catch (error) {
    handleCarError(error);
  }
};

export const updateCar = async (id, payload) => {
  try {
    const data = buildCarData(payload, { partial: true });
    if (Object.prototype.hasOwnProperty.call(data, 'plateNumber')) {
      await ensureEquivalentPlateNumberIsAvailable(data.plateNumber, id);
    }

    return decorateCar(
      await prisma.car.update({
        where: { id: Number(id) },
        data,
        include: {
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      }),
    );
  } catch (error) {
    handleCarError(error);
  }
};

export const deleteCar = async (id) => {
  const carId = Number(id);
  const invoiceCount = await prisma.sale.count({
    where: { carId },
  });

  if (invoiceCount > 0) {
    throw createError('Car cannot be deleted because it has invoice history', 409);
  }

  const serviceJobCount = await prisma.serviceJob.count({
    where: { carId },
  });

  if (serviceJobCount > 0) {
    throw createError('Car cannot be deleted because it has service job history', 409);
  }

  try {
    return await prisma.car.delete({
      where: { id: carId },
    });
  } catch (error) {
    handleCarError(error);
  }
};
