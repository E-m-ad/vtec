import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import { createEmployeeSalaryTransaction } from '../employees/employee.service.js';
import { createSupplierPayment } from '../suppliers/supplier.service.js';

const moneyOutSources = new Set(['supplier_payment', 'employee_transaction', 'general_expense']);
const employeeCashOutTypes = new Set(['salary_payment', 'advance', 'bonus', 'allowance']);
const employeeTransactionLabels = {
  salary_payment: 'Salary Payment',
  advance: 'Employee Advance',
  deduction: 'Employee Deduction',
  bonus: 'Employee Bonus',
  allowance: 'Employee Allowance',
};

const cleanText = (value) => {
  if (typeof value === 'undefined' || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const normalizePositiveAmount = (value, label = 'Amount') => {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError(`${label} must be greater than 0`, 400);
  }

  return amount;
};

const normalizeDate = (value, label = 'Date') => {
  const text = cleanText(value);
  if (!text) return new Date();

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw createError(`${label} is invalid`, 400);
  }

  return date;
};

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const addDateRange = (where, field, { from, to } = {}) => {
  if (!from && !to) return;

  where[field] = {};
  if (from) where[field].gte = new Date(from);
  if (to) where[field].lte = new Date(to);
};

const sortByDateDesc = (left, right) => {
  const rightTime = new Date(right.transaction_date).getTime();
  const leftTime = new Date(left.transaction_date).getTime();

  if (rightTime !== leftTime) return rightTime - leftTime;
  return String(right.id).localeCompare(String(left.id));
};

const supplierPaymentEntry = (payment) => {
  const amount = toMoneyNumber(payment.amount);
  const purchaseId = payment.purchaseId ?? payment.purchase_id;

  return {
    id: `supplier-${payment.id}`,
    source_type: 'supplier_payment',
    source_id: payment.id,
    type: 'Supplier Payment',
    subtype: 'supplier_payment',
    transaction_date: payment.paymentDate,
    amount,
    cash_out_amount: amount,
    payment_method: payment.paymentMethod,
    party_id: payment.supplierId,
    party_name: payment.supplier?.name || '-',
    reference_id: purchaseId,
    reference_label: purchaseId
      ? payment.purchase?.invoiceNumber || `Purchase #${purchaseId}`
      : '-',
    notes: payment.notes,
    created_by_name: payment.creator?.name || '-',
  };
};

const employeeTransactionEntry = (transaction) => {
  const amount = toMoneyNumber(transaction.amount);
  const isCashOut = employeeCashOutTypes.has(transaction.type);

  return {
    id: `employee-${transaction.id}`,
    source_type: 'employee_transaction',
    source_id: transaction.id,
    type: employeeTransactionLabels[transaction.type] || 'Employee Transaction',
    subtype: transaction.type,
    transaction_date: transaction.transactionDate,
    amount,
    cash_out_amount: isCashOut ? amount : 0,
    payment_method: transaction.paymentMethod,
    party_id: transaction.employeeId,
    party_name: transaction.employee?.name || '-',
    reference_id: transaction.employeeId,
    reference_label: transaction.employee ? `Employee #${transaction.employeeId}` : '-',
    notes: transaction.notes,
    created_by_name: transaction.creator?.name || '-',
  };
};

const generalExpenseEntry = (expense) => {
  const amount = toMoneyNumber(expense.amount);

  return {
    id: `general-${expense.id}`,
    source_type: 'general_expense',
    source_id: expense.id,
    type: 'General Expense',
    subtype: expense.category,
    transaction_date: expense.expenseDate,
    amount,
    cash_out_amount: amount,
    payment_method: expense.paymentMethod,
    party_id: null,
    party_name: expense.category,
    reference_id: null,
    reference_label: expense.category,
    notes: expense.notes,
    created_by_name: expense.creator?.name || '-',
  };
};

const buildSearchFilter = (search, relationFilters = []) => {
  const query = cleanText(search);
  if (!query) return undefined;

  return {
    OR: relationFilters(query),
  };
};

const summarizeMoneyOut = (entries) => {
  const summary = entries.reduce(
    (totals, entry) => {
      const amount = toMoneyNumber(entry.cash_out_amount);

      totals.total_cash_out += amount;
      totals.entry_count += 1;

      if (entry.source_type === 'supplier_payment') totals.supplier_payments += amount;
      if (entry.source_type === 'general_expense') totals.general_expenses += amount;
      if (entry.source_type === 'employee_transaction') {
        if (entry.subtype === 'deduction') {
          totals.employee_adjustments += toMoneyNumber(entry.amount);
        } else {
          totals.employee_cash_out += amount;
        }
      }

      return totals;
    },
    {
      total_cash_out: 0,
      supplier_payments: 0,
      employee_cash_out: 0,
      employee_adjustments: 0,
      general_expenses: 0,
      entry_count: 0,
    },
  );

  return summary;
};

export const listMoneyOut = async ({ from, to, search } = {}) => {
  const supplierWhere = {};
  const employeeWhere = {};
  const generalWhere = {};

  addDateRange(supplierWhere, 'paymentDate', { from, to });
  addDateRange(employeeWhere, 'transactionDate', { from, to });
  addDateRange(generalWhere, 'expenseDate', { from, to });

  const supplierSearch = buildSearchFilter(search, (query) => [
    { paymentMethod: { contains: query, mode: 'insensitive' } },
    { notes: { contains: query, mode: 'insensitive' } },
    { supplier: { is: { name: { contains: query, mode: 'insensitive' } } } },
    { supplier: { is: { phone: { contains: query, mode: 'insensitive' } } } },
    { purchase: { is: { invoiceNumber: { contains: query, mode: 'insensitive' } } } },
  ]);
  if (supplierSearch) supplierWhere.AND = [supplierSearch];

  const employeeSearch = buildSearchFilter(search, (query) => [
    ...(Object.prototype.hasOwnProperty.call(employeeTransactionLabels, query)
      ? [{ type: { equals: query } }]
      : []),
    { paymentMethod: { contains: query, mode: 'insensitive' } },
    { notes: { contains: query, mode: 'insensitive' } },
    { employee: { is: { name: { contains: query, mode: 'insensitive' } } } },
    { employee: { is: { phone: { contains: query, mode: 'insensitive' } } } },
  ]);
  if (employeeSearch) employeeWhere.AND = [employeeSearch];

  const generalSearch = buildSearchFilter(search, (query) => [
    { category: { contains: query, mode: 'insensitive' } },
    { paymentMethod: { contains: query, mode: 'insensitive' } },
    { notes: { contains: query, mode: 'insensitive' } },
  ]);
  if (generalSearch) generalWhere.AND = [generalSearch];

  const [supplierPayments, employeeTransactions, generalExpenses] = await Promise.all([
    prisma.supplierPayment.findMany({
      where: supplierWhere,
      include: {
        supplier: { select: { name: true } },
        purchase: { select: { invoiceNumber: true } },
        creator: { select: { name: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
      take: 200,
    }),
    prisma.employeeSalaryTransaction.findMany({
      where: employeeWhere,
      include: {
        employee: { select: { name: true, phone: true } },
        creator: { select: { name: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      take: 200,
    }),
    prisma.generalExpense.findMany({
      where: generalWhere,
      include: {
        creator: { select: { name: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
      take: 200,
    }),
  ]);

  const entries = [
    ...supplierPayments.map(supplierPaymentEntry),
    ...employeeTransactions.map(employeeTransactionEntry),
    ...generalExpenses.map(generalExpenseEntry),
  ].sort(sortByDateDesc);

  return {
    summary: summarizeMoneyOut(entries),
    entries,
  };
};

export const createMoneyOut = async (payload = {}, createdBy) => {
  const sourceType = cleanText(payload.source_type || payload.type);

  if (!moneyOutSources.has(sourceType)) {
    throw createError('Choose a valid money out type', 400);
  }

  const amount = normalizePositiveAmount(payload.amount);
  const transactionDate = normalizeDate(
    payload.transaction_date || payload.payment_date || payload.expense_date,
  );
  const paymentMethod = cleanText(payload.payment_method) || 'cash';
  const notes = cleanText(payload.notes);

  if (sourceType === 'supplier_payment') {
    const supplierId = Number(payload.supplier_id);
    const purchaseId = Number(payload.purchase_id);

    if (!Number.isInteger(supplierId)) {
      throw createError('Choose a supplier', 400);
    }

    if (!Number.isInteger(purchaseId)) {
      throw createError('Choose a supplier invoice', 400);
    }

    return {
      source_type: sourceType,
      data: await createSupplierPayment(
        supplierId,
        {
          amount,
          payment_date: transactionDate,
          payment_method: paymentMethod,
          purchase_id: purchaseId,
          notes,
        },
        createdBy,
      ),
    };
  }

  if (sourceType === 'employee_transaction') {
    const employeeId = Number(payload.employee_id);

    if (!Number.isInteger(employeeId)) {
      throw createError('Choose an employee', 400);
    }

    return {
      source_type: sourceType,
      data: await createEmployeeSalaryTransaction(
        employeeId,
        {
          type: payload.employee_transaction_type || payload.transaction_type,
          amount,
          transaction_date: transactionDate,
          payment_method: paymentMethod,
          notes,
        },
        createdBy,
      ),
    };
  }

  const category = cleanText(payload.category);
  if (!category) {
    throw createError('Expense category is required', 400);
  }

  return {
    source_type: sourceType,
    data: await prisma.generalExpense.create({
      data: {
        category,
        amount,
        expenseDate: transactionDate,
        paymentMethod,
        notes,
        createdBy: createdBy ? Number(createdBy) : null,
      },
    }),
  };
};
