import crypto from 'node:crypto';

import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';

const employeeStatuses = new Set(['active', 'inactive', 'on_leave', 'terminated']);
const salaryTransactionTypes = new Set([
  'salary_payment',
  'advance',
  'deduction',
  'bonus',
  'allowance',
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generateAttendanceToken = () => `att_${crypto.randomBytes(18).toString('hex')}`;

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const cleanText = (value) => {
  if (typeof value === 'undefined') return undefined;
  if (value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const normalizeEmail = (value) => {
  const email = cleanText(value);

  if (!email) return email;
  if (!emailPattern.test(email)) {
    throw createError('Enter a valid employee email address', 400);
  }

  return email.toLowerCase();
};

const normalizeSalary = (value) => {
  const salary = cleanText(value);

  if (typeof salary === 'undefined' || salary === null) return salary;

  const numericSalary = Number(salary);
  if (!Number.isFinite(numericSalary) || numericSalary < 0) {
    throw createError('Employee salary must be 0 or more', 400);
  }

  return numericSalary;
};

const normalizeHireDate = (value) => {
  const hireDate = cleanText(value);

  if (typeof hireDate === 'undefined' || hireDate === null) return hireDate;

  const parsedDate = new Date(hireDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError('Employee hire date is invalid', 400);
  }

  return parsedDate;
};

const normalizeStatus = (value) => {
  const status = cleanText(value);

  if (typeof status === 'undefined' || status === null) return status;
  if (!employeeStatuses.has(status)) {
    throw createError('Employee status is invalid', 400);
  }

  return status;
};

const normalizeSalaryTransactionType = (value) => {
  const type = cleanText(value);

  if (!type || !salaryTransactionTypes.has(type)) {
    throw createError('Salary transaction type is invalid', 400);
  }

  return type;
};

const normalizePositiveAmount = (value) => {
  const amount = cleanText(value);
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw createError('Salary transaction amount must be greater than 0', 400);
  }

  return numericAmount;
};

const normalizeTransactionDate = (value) => {
  const transactionDate = cleanText(value);

  if (typeof transactionDate === 'undefined' || transactionDate === null) {
    return new Date();
  }

  const parsedDate = new Date(transactionDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError('Salary transaction date is invalid', 400);
  }

  return parsedDate;
};

const normalizeDateOnly = (value = null) => {
  const text = cleanText(value);

  if (text && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00.000Z`);
  }

  const source = text ? new Date(text) : new Date();
  if (Number.isNaN(source.getTime())) {
    throw createError('Employee attendance date is invalid', 400);
  }

  return new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
};

const dateKey = (date) => date.toISOString().slice(0, 10);

const normalizeMonthRange = (value = null) => {
  const text = cleanText(value);

  if (!text || !/^\d{4}-\d{2}$/.test(text)) {
    throw createError('Employee attendance month is invalid', 400);
  }

  const [year, month] = text.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw createError('Employee attendance month is invalid', 400);
  }

  return { startDate, endDate };
};

const employeeAttendanceRange = (query = {}) => {
  const date = cleanText(query.date);
  const month = cleanText(query.month);
  const startValue = cleanText(query.start_date ?? query.startDate ?? query.date_from ?? query.dateFrom);
  const endValue = cleanText(query.end_date ?? query.endDate ?? query.date_to ?? query.dateTo);

  if (date) {
    const attendanceDate = normalizeDateOnly(date);
    return { startDate: attendanceDate, endDate: attendanceDate, filterType: 'day' };
  }

  if (month) {
    return { ...normalizeMonthRange(month), filterType: 'month' };
  }

  if (startValue || endValue) {
    const startDate = normalizeDateOnly(startValue || endValue);
    const endDate = normalizeDateOnly(endValue || startValue);

    if (endDate < startDate) {
      throw createError('Employee attendance end date cannot be before start date', 400);
    }

    return { startDate, endDate, filterType: 'range' };
  }

  return { ...normalizeMonthRange(dateKey(new Date()).slice(0, 7)), filterType: 'month' };
};

const buildEmployeeData = (payload = {}, { partial = false } = {}) => {
  const data = {};
  const name = cleanText(payload.name);

  if (!partial || typeof payload.name !== 'undefined') {
    if (!name) {
      throw createError('Employee name is required', 400);
    }

    data.name = name;
  }

  const fieldMap = {
    employee_code: 'employeeCode',
    phone: 'phone',
    address: 'address',
    position: 'position',
    department: 'department',
    notes: 'notes',
  };

  Object.entries(fieldMap).forEach(([source, target]) => {
    if (!partial || typeof payload[source] !== 'undefined') {
      data[target] = cleanText(payload[source]);
    }
  });

  if (!partial || typeof payload.email !== 'undefined') {
    data.email = normalizeEmail(payload.email);
  }

  if (!partial || typeof payload.salary !== 'undefined') {
    data.salary = normalizeSalary(payload.salary);
  }

  if (!partial || typeof payload.hire_date !== 'undefined') {
    data.hireDate = normalizeHireDate(payload.hire_date);
  }

  if (!partial || typeof payload.status !== 'undefined') {
    const status = normalizeStatus(payload.status);
    if (status) {
      data.status = status;
    }
  }

  return data;
};

const buildSalaryTransactionData = (payload = {}) => ({
  type: normalizeSalaryTransactionType(payload.type),
  amount: normalizePositiveAmount(payload.amount),
  transactionDate: normalizeTransactionDate(payload.transaction_date),
  paymentMethod: cleanText(payload.payment_method),
  notes: cleanText(payload.notes),
});

const buildSalarySummary = (salary, transactions = []) => {
  const baseSalary = toMoneyNumber(salary);
  const totals = {
    salary_payment: 0,
    advance: 0,
    deduction: 0,
    bonus: 0,
    allowance: 0,
  };

  transactions.forEach((transaction) => {
    if (Object.prototype.hasOwnProperty.call(totals, transaction.type)) {
      totals[transaction.type] += toMoneyNumber(transaction.amount);
    }
  });

  const totalAdditions = totals.bonus + totals.allowance;
  const totalDeductions = totals.advance + totals.deduction;
  const totalPaid = totals.salary_payment;
  const grossSalary = baseSalary + totalAdditions;
  const netPayable = Math.max(grossSalary - totalDeductions - totalPaid, 0);

  return {
    baseSalary,
    base_salary: baseSalary,
    totalAdditions,
    total_additions: totalAdditions,
    totalDeductions,
    total_deductions: totalDeductions,
    totalAdvances: totals.advance,
    total_advances: totals.advance,
    totalSalaryDeductions: totals.deduction,
    total_salary_deductions: totals.deduction,
    totalPaid,
    total_paid: totalPaid,
    grossSalary,
    gross_salary: grossSalary,
    netPayable,
    net_payable: netPayable,
  };
};

const addSalaryTransactionAliases = (transaction) => ({
  ...transaction,
  employee_id: transaction.employeeId,
  transaction_date: transaction.transactionDate,
  payment_method: transaction.paymentMethod,
  created_by: transaction.createdBy,
  created_at: transaction.createdAt,
});

const addAttendanceAliases = (record) => ({
  ...record,
  employee_id: record.employeeId,
  attendance_date: record.attendanceDate,
  check_in_at: record.checkInAt,
  deduction_amount: record.deductionAmount,
  deduction_transaction_id: record.deductionTransactionId,
  created_by: record.createdBy,
  created_at: record.createdAt,
  updated_at: record.updatedAt,
});

const handleEmployeeError = (error) => {
  if (error.code === 'P2002') {
    throw createError('Employee code, phone, email, or attendance token already exists', 409);
  }

  if (error.code === 'P2025') {
    throw createError('Employee not found', 404);
  }

  if (error.code === 'P2003') {
    throw createError('Employee cannot be deleted because it has salary history', 409);
  }

  throw error;
};

export const listEmployees = async ({ search, status } = {}) => {
  const where = {};
  const normalizedStatus = cleanText(status);

  if (normalizedStatus) {
    if (!employeeStatuses.has(normalizedStatus)) {
      throw createError('Employee status is invalid', 400);
    }

    where.status = normalizedStatus;
  }

  if (search) {
    const query = search.trim();
    where.OR = [
      { employeeCode: { contains: query, mode: 'insensitive' } },
      { name: { contains: query, mode: 'insensitive' } },
      { phone: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
      { position: { contains: query, mode: 'insensitive' } },
      { department: { contains: query, mode: 'insensitive' } },
    ];
  }

  return prisma.employee.findMany({
    where,
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
};

export const getEmployeeById = async (id) => {
  const employee = await prisma.employee.findUnique({
    where: { id: Number(id) },
  });

  if (!employee) {
    throw createError('Employee not found', 404);
  }

  return employee;
};

export const getEmployeeDetails = async (id) => {
  const employeeId = Number(id);
  const [employee, transactions, attendanceRecords] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
    }),
    prisma.employeeSalaryTransaction.findMany({
      where: { employeeId },
      include: {
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.employeeAttendance.findMany({
      where: { employeeId },
      include: {
        deductionTransaction: {
          select: {
            id: true,
            amount: true,
            transactionDate: true,
            notes: true,
          },
        },
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ attendanceDate: 'desc' }, { id: 'desc' }],
      take: 90,
    }),
  ]);

  if (!employee) {
    throw createError('Employee not found', 404);
  }

  const decoratedTransactions = transactions.map(addSalaryTransactionAliases);
  const summary = buildSalarySummary(employee.salary, decoratedTransactions);

  return {
    employee: {
      ...employee,
      ...summary,
    },
    summary,
    transactions: decoratedTransactions,
    attendanceRecords: attendanceRecords.map(addAttendanceAliases),
    attendance_records: attendanceRecords.map(addAttendanceAliases),
  };
};

export const getEmployeeAttendanceHistory = async (id, query = {}) => {
  const employeeId = Number(id);

  if (!Number.isInteger(employeeId)) {
    throw createError('Invalid employee id', 400);
  }

  const { startDate, endDate, filterType } = employeeAttendanceRange(query);
  const [employee, attendanceRecords] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    }),
    prisma.employeeAttendance.findMany({
      where: {
        employeeId,
        attendanceDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        deductionTransaction: {
          select: {
            id: true,
            amount: true,
            transactionDate: true,
            notes: true,
          },
        },
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ attendanceDate: 'desc' }, { id: 'desc' }],
    }),
  ]);

  if (!employee) {
    throw createError('Employee not found', 404);
  }

  const decoratedRecords = attendanceRecords.map(addAttendanceAliases);
  const summary = decoratedRecords.reduce(
    (totals, record) => {
      totals.total += 1;
      if (record.status === 'present') totals.present += 1;
      if (record.status === 'absent') totals.absent += 1;
      if (record.finalized) totals.finalized += 1;
      totals.deduction_total += toMoneyNumber(record.deductionAmount);
      return totals;
    },
    {
      total: 0,
      present: 0,
      absent: 0,
      finalized: 0,
      deduction_total: 0,
    },
  );

  summary.deduction_total = Math.round((summary.deduction_total + Number.EPSILON) * 100) / 100;

  return {
    filter_type: filterType,
    start_date: dateKey(startDate),
    end_date: dateKey(endDate),
    summary,
    attendanceRecords: decoratedRecords,
    attendance_records: decoratedRecords,
  };
};

export const createEmployee = async (payload) => {
  try {
    return await prisma.employee.create({
      data: {
        ...buildEmployeeData(payload),
        attendanceToken: generateAttendanceToken(),
      },
    });
  } catch (error) {
    handleEmployeeError(error);
  }
};

export const updateEmployee = async (id, payload) => {
  try {
    return await prisma.employee.update({
      where: { id: Number(id) },
      data: buildEmployeeData(payload, { partial: true }),
    });
  } catch (error) {
    handleEmployeeError(error);
  }
};

export const createEmployeeSalaryTransaction = async (id, payload, createdBy) => {
  const employeeId = Number(id);

  if (!Number.isInteger(employeeId)) {
    throw createError('Invalid employee id', 400);
  }

  try {
    await prisma.$transaction(async (client) => {
      const employee = await client.employee.findUnique({
        where: { id: employeeId },
        select: { id: true },
      });

      if (!employee) {
        throw createError('Employee not found', 404);
      }

      await client.employeeSalaryTransaction.create({
        data: {
          employeeId,
          ...buildSalaryTransactionData(payload),
          createdBy: createdBy ? Number(createdBy) : null,
        },
      });
    });

    return getEmployeeDetails(employeeId);
  } catch (error) {
    if (error.code === 'P2003') {
      throw createError('Invalid employee or user reference', 400);
    }

    throw error;
  }
};

export const updateEmployeeSalaryTransaction = async (id, transactionId, payload) => {
  const employeeId = Number(id);
  const salaryTransactionId = Number(transactionId);

  if (!Number.isInteger(employeeId) || !Number.isInteger(salaryTransactionId)) {
    throw createError('Invalid salary transaction reference', 400);
  }

  const existingTransaction = await prisma.employeeSalaryTransaction.findFirst({
    where: {
      id: salaryTransactionId,
      employeeId,
    },
    select: { id: true },
  });

  if (!existingTransaction) {
    throw createError('Salary transaction not found', 404);
  }

  await prisma.employeeSalaryTransaction.update({
    where: { id: salaryTransactionId },
    data: buildSalaryTransactionData(payload),
  });

  return getEmployeeDetails(employeeId);
};

export const deleteEmployeeSalaryTransaction = async (id, transactionId) => {
  const employeeId = Number(id);
  const salaryTransactionId = Number(transactionId);

  if (!Number.isInteger(employeeId) || !Number.isInteger(salaryTransactionId)) {
    throw createError('Invalid salary transaction reference', 400);
  }

  const result = await prisma.employeeSalaryTransaction.deleteMany({
    where: {
      id: salaryTransactionId,
      employeeId,
    },
  });

  if (result.count === 0) {
    throw createError('Salary transaction not found', 404);
  }

  return getEmployeeDetails(employeeId);
};

export const deleteEmployee = async (id) => {
  try {
    return await prisma.employee.delete({
      where: { id: Number(id) },
    });
  } catch (error) {
    handleEmployeeError(error);
  }
};
