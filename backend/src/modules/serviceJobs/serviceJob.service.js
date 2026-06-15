import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import { compactPlateNumber, normalizePlateNumber, normalizePlateNumberSearch } from '../../utils/plateNumber.js';
import { recordStockMovement } from '../stockMovements/stockMovement.service.js';
import {
  INACTIVE_SERVICE_JOB_STATUSES,
  SERVICE_JOB_STATUS_META,
  SERVICE_JOB_SECTIONS,
  SERVICE_JOB_STATUSES,
  SERVICE_JOB_TRANSITIONS,
  serviceActionsForStatus,
  serviceStageForStatus,
  serviceWorkflowMetadata,
  statusesForServiceStage,
} from './serviceJob.workflow.js';

export { SERVICE_JOB_SECTIONS, SERVICE_JOB_STATUSES, SERVICE_JOB_TRANSITIONS, serviceWorkflowMetadata };

const statusSet = new Set(SERVICE_JOB_STATUSES);
const inactiveStatuses = INACTIVE_SERVICE_JOB_STATUSES;
const invoiceLockedStatuses = new Set([
  'INVOICED',
  'PAYMENT_PENDING',
  'PAID',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'CLOSED',
]);
const advancePaymentStatuses = new Set([
  'APPROVED',
  'PARTIALLY_APPROVED',
  'WAITING_PARTS',
  'WORK_IN_PROGRESS',
  'WORK_DONE',
  'QC_IN_PROGRESS',
  'QC_FAILED',
  'QC_PASSED',
  'READY_FOR_INVOICE',
]);
const supplementalEstimateStatuses = [
  'APPROVED',
  'PARTIALLY_APPROVED',
  'WAITING_PARTS',
  'WORK_IN_PROGRESS',
  'WORK_DONE',
  'QC_FAILED',
];

const statusAliases = {
  open: 'RECEIVED',
  in_service: 'WORK_IN_PROGRESS',
  finished: 'WORK_DONE',
  invoiced: 'INVOICED',
  cancelled: 'CANCELLED',
};

const transitionMap = new Map(
  Object.entries(SERVICE_JOB_TRANSITIONS).map(([status, nextStatuses]) => [status, new Set(nextStatuses)]),
);

const cleanText = (value) => {
  if (typeof value === 'undefined' || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => Math.round(toMoneyNumber(value) * 100) / 100;

const positiveQuantity = (value, label = 'Quantity') => {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw createError(`${label} must be a whole number greater than 0`, 400);
  }

  return quantity;
};

const nonNegativeQuantity = (value, label = 'Quantity') => {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw createError(`${label} must be a whole number 0 or greater`, 400);
  }

  return quantity;
};

const nonNegativeMoney = (value, label) => {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw createError(`${label} must be 0 or greater`, 400);
  }

  return amount;
};

const normalizeDate = (value, label = 'Date') => {
  const text = cleanText(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw createError(`${label} is invalid`, 400);
  }

  return date;
};

const normalizeStatus = (value) => {
  const text = cleanText(value);
  if (!text) throw createError('Service job status is required', 400);

  const alias = statusAliases[text.toLowerCase()];
  const status = alias || text.toUpperCase();

  if (!statusSet.has(status)) {
    throw createError('Invalid service job status', 400);
  }

  return status;
};

const normalizeOptionalStage = (value) => {
  const stage = cleanText(value);
  if (!stage) return null;

  const statuses = statusesForServiceStage(stage);
  if (!statuses.length) {
    throw createError('Invalid service job stage', 400);
  }

  return { key: stage, statuses };
};

const normalizeBooleanFilter = (value) => {
  if (typeof value === 'undefined' || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
};

const normalizePagination = ({ limit = 50, offset = 0 } = {}) => {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);

  return {
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), 200) : 50,
    offset: Number.isFinite(parsedOffset) && parsedOffset > 0 ? Math.floor(parsedOffset) : 0,
  };
};

const validLineTypes = new Set(['product', 'service']);

const normalizeLineType = (payload = {}) => {
  const lineType = cleanText(payload.line_type || payload.lineType || payload.item_type) || (payload.product_id || payload.productId ? 'product' : 'service');

  if (!validLineTypes.has(lineType)) {
    throw createError('Lines must be product or service lines', 400);
  }

  return lineType;
};

const paymentMethodSummary = (payments, fallback = null) => {
  const methods = payments
    .map((payment) => cleanText(payment.paymentMethod ?? payment.payment_method))
    .filter(Boolean);

  if (fallback) methods.push(fallback);

  const uniqueMethods = [...new Set(methods)];
  if (!uniqueMethods.length) return null;
  if (uniqueMethods.length === 1) return uniqueMethods[0];
  return 'mixed';
};

const derivePaymentStatus = (paidAmount, totalAmount) => {
  if (totalAmount <= 0) return 'paid';
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount >= totalAmount) return 'paid';
  return 'partial';
};

const normalizePayments = ({ payments, amount = 0, payment_method = 'cash', payment_date = null, notes = null } = {}) => {
  if (Array.isArray(payments)) {
    return payments
      .map((payment) => {
        const paymentAmount = Number(payment.amount);

        if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
          throw createError('Payment amounts must be 0 or greater', 400);
        }

        return {
          amount: paymentAmount,
          paymentDate: normalizeDate(payment.payment_date, 'Payment date') || new Date(),
          paymentMethod: cleanText(payment.payment_method || payment.method) || 'cash',
          notes: cleanText(payment.notes),
        };
      })
      .filter((payment) => payment.amount > 0);
  }

  const paymentAmount = Number(amount || 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
    throw createError('Payment amount must be 0 or greater', 400);
  }

  if (paymentAmount <= 0) return [];

  return [
    {
      amount: paymentAmount,
      paymentDate: normalizeDate(payment_date, 'Payment date') || new Date(),
      paymentMethod: cleanText(payment_method) || 'cash',
      notes: cleanText(notes),
    },
  ];
};

const getJobOrThrow = async (client, id, include = undefined) => {
  const job = await client.serviceJob.findUnique({
    where: { id: Number(id) },
    ...(include ? { include } : {}),
  });

  if (!job) throw createError('Service job not found', 404);
  return job;
};

const recordServiceJobHistory = async (
  client,
  { jobId, fromStatus = null, toStatus = null, action, performedBy = null, note = null },
) => {
  return client.serviceJobHistory.create({
    data: {
      jobId: Number(jobId),
      fromStatus,
      toStatus,
      action: cleanText(action) || 'service_job_action',
      performedBy: performedBy ? Number(performedBy) : null,
      note: cleanText(note),
    },
  });
};

const statusUpdateData = (toStatus) => {
  const data = {
    status: toStatus,
    currentStage: toStatus,
  };

  if (toStatus === 'WORK_DONE') data.finishedAt = new Date();
  if (toStatus === 'CLOSED') data.closedAt = new Date();

  return data;
};

const changeServiceJobStatusInTransaction = async (
  client,
  { jobId, toStatus, performedBy = null, action = 'status_transition', note = null },
) => {
  const normalizedToStatus = normalizeStatus(toStatus);
  const job = await getJobOrThrow(client, jobId);
  const fromStatus = job.status;

  if (fromStatus === normalizedToStatus) {
    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus,
      toStatus: normalizedToStatus,
      action,
      performedBy,
      note,
    });
    return job;
  }

  if (!transitionMap.get(fromStatus)?.has(normalizedToStatus)) {
    throw createError(`Invalid service job transition from ${fromStatus} to ${normalizedToStatus}`, 400, {
      from_status: fromStatus,
      to_status: normalizedToStatus,
      allowed_statuses: SERVICE_JOB_TRANSITIONS[fromStatus] || [],
    });
  }

  const updated = await client.serviceJob.update({
    where: { id: job.id },
    data: statusUpdateData(normalizedToStatus),
  });

  await recordServiceJobHistory(client, {
    jobId: job.id,
    fromStatus,
    toStatus: normalizedToStatus,
    action,
    performedBy,
    note,
  });

  return updated;
};

export const changeServiceJobStatus = async (payload) => {
  await prisma.$transaction((client) => changeServiceJobStatusInTransaction(client, payload));
  return getServiceJobById(payload.jobId);
};

const ensureStatus = (job, allowedStatuses, message) => {
  const allowed = new Set(allowedStatuses.map(normalizeStatus));

  if (!allowed.has(job.status)) {
    throw createError(message || `Service job must be in one of: ${[...allowed].join(', ')}`, 400, {
      current_status: job.status,
      allowed_statuses: [...allowed],
    });
  }
};

const ensureBeforeInvoice = (job) => {
  if (invoiceLockedStatuses.has(job.status)) {
    throw createError('This service job is already invoiced or closed for operational edits', 400);
  }
};

const ensureSupplementalEstimateAllowed = (job) => {
  ensureBeforeInvoice(job);
  ensureStatus(
    job,
    supplementalEstimateStatuses,
    'Supplemental estimates can only be created after customer approval and before QC is passed',
  );
};

const ensureNoActiveJobForCar = async (client, carId) => {
  const activeJob = await client.serviceJob.findFirst({
    where: {
      carId: Number(carId),
      status: {
        notIn: inactiveStatuses,
      },
    },
    select: {
      id: true,
      jobNumber: true,
      status: true,
    },
  });

  if (activeJob) {
    throw createError('This car already has an active service job', 409, {
      active_job_id: activeJob.id,
      active_job_number: activeJob.jobNumber,
      active_job_status: activeJob.status,
    });
  }
};

const includeProductSummary = {
  id: true,
  sku: true,
  name: true,
  stockQuantity: true,
  purchasePrice: true,
  salePrice: true,
};

const jobListInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  },
  car: {
    select: {
      id: true,
      customerId: true,
      plateNumber: true,
      vin: true,
      make: true,
      model: true,
      year: true,
      color: true,
    },
  },
  sale: {
    select: {
      id: true,
      saleNumber: true,
      saleDate: true,
      totalAmount: true,
      paidAmount: true,
      paymentStatus: true,
    },
  },
  assignedAdvisor: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedTechnician: {
    select: {
      id: true,
      name: true,
    },
  },
  items: {
    select: {
      id: true,
      lineTotal: true,
      approvalStatus: true,
    },
  },
  payments: {
    select: {
      amount: true,
    },
  },
};

const jobDetailInclude = {
  ...jobListInclude,
  creator: {
    select: {
      id: true,
      name: true,
    },
  },
  items: {
    include: {
      product: { select: includeProductSummary },
      estimateLine: true,
      partRequests: {
        include: {
          product: { select: includeProductSummary },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      workOrderLines: {
        include: {
          assignedTechnician: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ id: 'asc' }],
      },
      creator: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  },
  payments: {
    include: {
      creator: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
  },
  complaints: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  inspections: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  diagnosisReports: {
    include: {
      technician: {
        select: {
          id: true,
          name: true,
        },
      },
      creator: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
  estimates: {
    include: {
      lines: {
        include: {
          product: { select: includeProductSummary },
        },
        orderBy: { id: 'asc' },
      },
      approvals: {
        orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
  approvals: {
    orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
  },
  workOrders: {
    include: {
      lines: {
        include: {
          jobItem: true,
          assignedTechnician: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
  partRequests: {
    include: {
      product: { select: includeProductSummary },
      jobItem: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
  qcReports: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
  deliveryHandovers: {
    orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
  },
  histories: {
    include: {
      performer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
};

const decorateCar = (car) =>
  car
    ? {
        ...car,
        customer_id: car.customerId,
        plate_number: car.plateNumber,
      }
    : car;

const decorateSale = (sale) =>
  sale
    ? {
        ...sale,
        sale_number: sale.saleNumber,
        sale_date: sale.saleDate,
        total_amount: toMoneyNumber(sale.totalAmount),
        paid_amount: toMoneyNumber(sale.paidAmount),
        payment_status: sale.paymentStatus,
      }
    : sale;

const decorateItem = (item) => ({
  ...item,
  job_id: item.jobId,
  product_id: item.productId,
  estimate_line_id: item.estimateLineId,
  line_type: item.lineType,
  approved_quantity: item.approvedQuantity,
  issued_quantity: item.issuedQuantity,
  returned_quantity: item.returnedQuantity,
  approval_status: item.approvalStatus,
  work_status: item.workStatus,
  unit_cost: item.unitCost,
  unit_price: item.unitPrice,
  line_total: item.lineTotal,
  completed_at: item.completedAt,
  created_by: item.createdBy,
  created_at: item.createdAt,
  product_name: item.product?.name || item.description,
  product_sku: item.product?.sku,
  part_requests: Array.isArray(item.partRequests) ? item.partRequests.map(decoratePartRequest) : item.partRequests,
});

const decorateEstimateLine = (line) => ({
  ...line,
  estimate_id: line.estimateId,
  product_id: line.productId,
  line_type: line.lineType,
  approved_quantity: line.approvedQuantity,
  approval_status: line.approvalStatus,
  unit_cost: line.unitCost,
  unit_price: line.unitPrice,
  discount_amount: line.discountAmount,
  tax_amount: line.taxAmount,
  line_total: line.lineTotal,
  created_at: line.createdAt,
  product_name: line.product?.name || line.description,
  product_sku: line.product?.sku,
});

const decorateEstimate = (estimate) => ({
  ...estimate,
  job_id: estimate.jobId,
  diagnosis_report_id: estimate.diagnosisReportId,
  estimate_number: estimate.estimateNumber,
  is_supplemental: estimate.isSupplemental,
  source_status: estimate.sourceStatus,
  discount_amount: estimate.discountAmount,
  tax_amount: estimate.taxAmount,
  total_amount: estimate.totalAmount,
  sent_at: estimate.sentAt,
  created_by: estimate.createdBy,
  created_at: estimate.createdAt,
  updated_at: estimate.updatedAt,
  lines: Array.isArray(estimate.lines) ? estimate.lines.map(decorateEstimateLine) : estimate.lines,
});

function decoratePartRequest(request) {
  return {
    ...request,
    job_id: request.jobId,
    job_item_id: request.jobItemId,
    product_id: request.productId,
    requested_quantity: request.requestedQuantity,
    reserved_quantity: request.reservedQuantity,
    issued_quantity: request.issuedQuantity,
    returned_quantity: request.returnedQuantity,
    created_by: request.createdBy,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
    product_name: request.product?.name,
    product_sku: request.product?.sku,
  };
}

const totalsForJob = (job) => {
  const itemTotal = Array.isArray(job.items)
    ? job.items.reduce((sum, item) => sum + toMoneyNumber(item.lineTotal), 0)
    : 0;
  const advanceAmount = Array.isArray(job.payments)
    ? job.payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0)
    : 0;
  const invoiceTotal = job.sale ? toMoneyNumber(job.sale.totalAmount) : itemTotal;
  const invoicePaid = job.sale ? toMoneyNumber(job.sale.paidAmount) : advanceAmount;
  const remainingAmount = Math.max(invoiceTotal - invoicePaid, 0);

  return {
    itemTotal,
    item_total: itemTotal,
    totalAmount: invoiceTotal,
    total_amount: invoiceTotal,
    advanceAmount,
    advance_amount: advanceAmount,
    paidAmount: invoicePaid,
    paid_amount: invoicePaid,
    remainingAmount,
    remaining_amount: remainingAmount,
    itemCount: Array.isArray(job.items) ? job.items.length : 0,
    item_count: Array.isArray(job.items) ? job.items.length : 0,
    paymentCount: Array.isArray(job.payments) ? job.payments.length : 0,
    payment_count: Array.isArray(job.payments) ? job.payments.length : 0,
  };
};

const workflowSummaryForJob = (job, user = null) => {
  const stage = serviceStageForStatus(job.status);

  return {
    stage,
    stage_key: stage.key,
    stage_label: stage.label,
    status_meta: SERVICE_JOB_STATUS_META[job.status] || null,
    next_actions: serviceActionsForStatus(job.status, user),
  };
};

const decorateJob = (job, user = null) => {
  if (!job) return job;

  return {
    ...job,
    ...totalsForJob(job),
    ...workflowSummaryForJob(job, user),
    job_number: job.jobNumber,
    customer_id: job.customerId,
    car_id: job.carId,
    sale_id: job.saleId,
    current_stage: job.currentStage,
    assigned_advisor_id: job.assignedAdvisorId,
    assigned_technician_id: job.assignedTechnicianId,
    start_date: job.startDate,
    opened_at: job.openedAt,
    expected_finish_date: job.expectedFinishDate,
    finished_at: job.finishedAt,
    closed_at: job.closedAt,
    created_by: job.createdBy,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    customer_name: job.customer?.name || null,
    car: decorateCar(job.car),
    sale: decorateSale(job.sale),
    items: Array.isArray(job.items) ? job.items.map(decorateItem) : job.items,
    payments: Array.isArray(job.payments)
      ? job.payments.map((payment) => ({
          ...payment,
          job_id: payment.jobId,
          payment_date: payment.paymentDate,
          payment_method: payment.paymentMethod,
          created_by: payment.createdBy,
          created_at: payment.createdAt,
        }))
      : job.payments,
    inspections: Array.isArray(job.inspections)
      ? job.inspections.map((inspection) => ({
          ...inspection,
          job_id: inspection.jobId,
          fuel_level: inspection.fuelLevel,
          visual_inspection: inspection.visualInspection,
          created_by: inspection.createdBy,
          created_at: inspection.createdAt,
          updated_at: inspection.updatedAt,
        }))
      : job.inspections,
    diagnosis_reports: Array.isArray(job.diagnosisReports)
      ? job.diagnosisReports.map((report) => ({
          ...report,
          job_id: report.jobId,
          technician_id: report.technicianId,
          diagnosis_notes: report.diagnosisNotes,
          fault_codes: report.faultCodes,
          recommended_work: report.recommendedWork,
          diagnostic_fee: report.diagnosticFee,
          created_by: report.createdBy,
          created_at: report.createdAt,
          updated_at: report.updatedAt,
        }))
      : job.diagnosisReports,
    estimates: Array.isArray(job.estimates) ? job.estimates.map(decorateEstimate) : job.estimates,
    approvals: Array.isArray(job.approvals)
      ? job.approvals.map((approval) => ({
          ...approval,
          job_id: approval.jobId,
          estimate_id: approval.estimateId,
          approved_by: approval.approvedBy,
          approved_at: approval.approvedAt,
          created_by: approval.createdBy,
          created_at: approval.createdAt,
        }))
      : job.approvals,
    work_orders: Array.isArray(job.workOrders)
      ? job.workOrders.map((order) => ({
          ...order,
          job_id: order.jobId,
          started_at: order.startedAt,
          completed_at: order.completedAt,
          created_by: order.createdBy,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
        }))
      : job.workOrders,
    part_requests: Array.isArray(job.partRequests) ? job.partRequests.map(decoratePartRequest) : job.partRequests,
    qc_reports: Array.isArray(job.qcReports)
      ? job.qcReports.map((report) => ({
          ...report,
          job_id: report.jobId,
          complaint_solved: report.complaintSolved,
          road_test_done: report.roadTestDone,
          scanner_check_done: report.scannerCheckDone,
          leaks_checked: report.leaksChecked,
          final_notes: report.finalNotes,
          created_by: report.createdBy,
          created_at: report.createdAt,
          updated_at: report.updatedAt,
        }))
      : job.qcReports,
    delivery_handovers: Array.isArray(job.deliveryHandovers)
      ? job.deliveryHandovers.map((handover) => ({
          ...handover,
          job_id: handover.jobId,
          delivered_by: handover.deliveredBy,
          received_by_name: handover.receivedByName,
          customer_signed: handover.customerSigned,
          delivered_at: handover.deliveredAt,
          created_by: handover.createdBy,
          created_at: handover.createdAt,
        }))
      : job.deliveryHandovers,
    histories: Array.isArray(job.histories)
      ? job.histories.map((history) => ({
          ...history,
          job_id: history.jobId,
          from_status: history.fromStatus,
          to_status: history.toStatus,
          performed_by: history.performedBy,
          created_at: history.createdAt,
        }))
      : job.histories,
  };
};

const leanJobSelect = {
  id: true,
  jobNumber: true,
  customerId: true,
  carId: true,
  saleId: true,
  status: true,
  currentStage: true,
  assignedAdvisorId: true,
  assignedTechnicianId: true,
  startDate: true,
  openedAt: true,
  expectedFinishDate: true,
  finishedAt: true,
  closedAt: true,
  notes: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  },
  car: {
    select: {
      id: true,
      customerId: true,
      plateNumber: true,
      vin: true,
      make: true,
      model: true,
      year: true,
      color: true,
    },
  },
  sale: {
    select: {
      id: true,
      saleNumber: true,
      saleDate: true,
      totalAmount: true,
      paidAmount: true,
      paymentStatus: true,
    },
  },
  assignedAdvisor: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedTechnician: {
    select: {
      id: true,
      name: true,
    },
  },
};

const toTotalsMap = (rows, key) =>
  new Map(
    rows.map((row) => [
      row.jobId,
      {
        total: toMoneyNumber(row._sum?.[key]),
        count: row._count?._all || 0,
      },
    ]),
  );

const decorateLeanJob = (job, { itemTotals, paymentTotals }, user = null) => {
  const itemSummary = itemTotals.get(job.id) || { total: 0, count: 0 };
  const paymentSummary = paymentTotals.get(job.id) || { total: 0, count: 0 };
  const invoiceTotal = job.sale ? toMoneyNumber(job.sale.totalAmount) : itemSummary.total;
  const invoicePaid = job.sale ? toMoneyNumber(job.sale.paidAmount) : paymentSummary.total;
  const remainingAmount = Math.max(invoiceTotal - invoicePaid, 0);
  const workflow = workflowSummaryForJob(job, user);

  return {
    ...job,
    ...workflow,
    job_number: job.jobNumber,
    customer_id: job.customerId,
    car_id: job.carId,
    sale_id: job.saleId,
    current_stage: job.currentStage,
    assigned_advisor_id: job.assignedAdvisorId,
    assigned_technician_id: job.assignedTechnicianId,
    start_date: job.startDate,
    opened_at: job.openedAt,
    expected_finish_date: job.expectedFinishDate,
    finished_at: job.finishedAt,
    closed_at: job.closedAt,
    created_by: job.createdBy,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    customer_name: job.customer?.name || null,
    car: decorateCar(job.car),
    sale: decorateSale(job.sale),
    itemTotal: itemSummary.total,
    item_total: itemSummary.total,
    totalAmount: invoiceTotal,
    total_amount: invoiceTotal,
    advanceAmount: paymentSummary.total,
    advance_amount: paymentSummary.total,
    paidAmount: invoicePaid,
    paid_amount: invoicePaid,
    remainingAmount,
    remaining_amount: remainingAmount,
    itemCount: itemSummary.count,
    item_count: itemSummary.count,
    paymentCount: paymentSummary.count,
    payment_count: paymentSummary.count,
  };
};

export const listServiceJobs = async (
  { status, stage, customer_id, car_id, search, active, assignee_id, limit = 50, offset = 0 } = {},
  user = null,
) => {
  const where = {};
  const andFilters = [];
  const query = cleanText(search);
  const normalizedStage = normalizeOptionalStage(stage);
  const activeFilter = normalizeBooleanFilter(active);
  const pagination = normalizePagination({ limit, offset });

  if (status) {
    andFilters.push({ status: normalizeStatus(status) });
  } else if (normalizedStage) {
    andFilters.push({ status: { in: normalizedStage.statuses } });
  }

  if (activeFilter === true) {
    andFilters.push({ status: { notIn: inactiveStatuses } });
  } else if (activeFilter === false) {
    andFilters.push({ status: { in: inactiveStatuses } });
  }

  if (customer_id) where.customerId = Number(customer_id);
  if (car_id) where.carId = Number(car_id);
  if (assignee_id) {
    const assigneeId = Number(assignee_id);
    if (Number.isInteger(assigneeId)) {
      andFilters.push({
        OR: [{ assignedAdvisorId: assigneeId }, { assignedTechnicianId: assigneeId }],
      });
    }
  }

  if (query) {
    const numericQuery = Number(query);
    const searchConditions = [
      { jobNumber: { contains: query, mode: 'insensitive' } },
      { notes: { contains: query, mode: 'insensitive' } },
      {
        customer: {
          is: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
      },
      {
        car: {
          is: {
            OR: [
              { plateNumber: { contains: query, mode: 'insensitive' } },
              { vin: { contains: query, mode: 'insensitive' } },
              { make: { contains: query, mode: 'insensitive' } },
              { model: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];

    if (Number.isInteger(numericQuery)) searchConditions.unshift({ id: numericQuery });
    where.OR = searchConditions;
  }

  if (andFilters.length) where.AND = andFilters;

  const [jobs, total] = await Promise.all([
    prisma.serviceJob.findMany({
      where,
      select: leanJobSelect,
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit,
      skip: pagination.offset,
    }),
    prisma.serviceJob.count({ where }),
  ]);
  const jobIds = jobs.map((job) => job.id);
  const [itemTotalRows, paymentTotalRows] = jobIds.length
    ? await Promise.all([
        prisma.serviceJobItem.groupBy({
          by: ['jobId'],
          where: { jobId: { in: jobIds } },
          _sum: { lineTotal: true },
          _count: { _all: true },
        }),
        prisma.serviceJobPayment.groupBy({
          by: ['jobId'],
          where: { jobId: { in: jobIds } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const totals = {
    itemTotals: toTotalsMap(itemTotalRows, 'lineTotal'),
    paymentTotals: toTotalsMap(paymentTotalRows, 'amount'),
  };
  const items = jobs.map((job) => decorateLeanJob(job, totals, user));
  const page = Math.floor(pagination.offset / pagination.limit) + 1;
  const pageCount = Math.max(Math.ceil(total / pagination.limit), 1);
  const summary = items.reduce(
    (current, job) => ({
      active_count: current.active_count + (inactiveStatuses.includes(job.status) ? 0 : 1),
      total_amount: roundMoney(current.total_amount + toMoneyNumber(job.total_amount)),
      paid_amount: roundMoney(current.paid_amount + toMoneyNumber(job.paid_amount)),
      remaining_amount: roundMoney(current.remaining_amount + toMoneyNumber(job.remaining_amount)),
    }),
    { active_count: 0, total_amount: 0, paid_amount: 0, remaining_amount: 0 },
  );

  return {
    items,
    service_jobs: items,
    summary,
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      page,
      page_count: pageCount,
      has_previous: pagination.offset > 0,
      has_next: pagination.offset + pagination.limit < total,
    },
    meta: serviceWorkflowMetadata(),
  };
};

export const getServiceJobById = async (id, user = null) => {
  const job = await prisma.serviceJob.findUnique({
    where: { id: Number(id) },
    include: jobDetailInclude,
  });

  if (!job) throw createError('Service job not found', 404);
  return decorateJob(job, user);
};

export const getServiceJobHistory = async (id) => {
  await prisma.serviceJob.findUniqueOrThrow({
    where: { id: Number(id) },
    select: { id: true },
  }).catch(() => {
    throw createError('Service job not found', 404);
  });

  const history = await prisma.serviceJobHistory.findMany({
    where: { jobId: Number(id) },
    include: {
      performer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return history.map((entry) => ({
    ...entry,
    job_id: entry.jobId,
    from_status: entry.fromStatus,
    to_status: entry.toStatus,
    performed_by: entry.performedBy,
    created_at: entry.createdAt,
  }));
};

const getSectionJobOrThrow = async (id, include) => {
  const job = await prisma.serviceJob.findUnique({
    where: { id: Number(id) },
    include,
  });

  if (!job) throw createError('Service job not found', 404);
  return job;
};

export const getServiceJobSection = async (id, section, user = null) => {
  const requestedSection = cleanText(section);
  if (!requestedSection) throw createError('Service job section is required', 400);
  const normalizedSection = requestedSection === 'estimate' ? 'estimates' : requestedSection;

  if (normalizedSection === 'history') {
    return {
      section: normalizedSection,
      history: await getServiceJobHistory(id),
    };
  }

  const basePayload = (job) => ({
    id: job.id,
    job_number: job.jobNumber,
    jobNumber: job.jobNumber,
    status: job.status,
    current_stage: job.currentStage,
    currentStage: job.currentStage,
    sale_id: job.saleId,
    saleId: job.saleId,
    ...workflowSummaryForJob(job, user),
  });

  switch (normalizedSection) {
    case 'reception': {
      const job = await getSectionJobOrThrow(id, {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        car: true,
        complaints: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        inspections: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      });
      return {
        section: normalizedSection,
        job: basePayload(job),
        customer: job.customer,
        car: decorateCar(job.car),
        complaints: job.complaints,
        inspections: job.inspections,
      };
    }
    case 'diagnosis': {
      const job = await getSectionJobOrThrow(id, {
        diagnosisReports: {
          include: {
            technician: { select: { id: true, name: true } },
            creator: { select: { id: true, name: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      });
      return {
        section: normalizedSection,
        job: basePayload(job),
        diagnosis_reports: job.diagnosisReports,
        diagnosisReports: job.diagnosisReports,
      };
    }
    case 'estimates': {
      const job = await getSectionJobOrThrow(id, {
        estimates: jobDetailInclude.estimates,
        approvals: jobDetailInclude.approvals,
      });
      const estimates = job.estimates.map(decorateEstimate);
      return {
        section: normalizedSection,
        job: basePayload(job),
        estimates,
        approvals: job.approvals,
      };
    }
    case 'lines': {
      const job = await getSectionJobOrThrow(id, {
        items: jobDetailInclude.items,
      });
      const items = job.items.map(decorateItem);
      return {
        section: normalizedSection,
        job: basePayload(job),
        items,
      };
    }
    case 'work': {
      const job = await getSectionJobOrThrow(id, {
        items: jobDetailInclude.items,
        workOrders: jobDetailInclude.workOrders,
      });
      return {
        section: normalizedSection,
        job: basePayload(job),
        items: job.items.map(decorateItem),
        work_orders: job.workOrders,
        workOrders: job.workOrders,
      };
    }
    case 'parts': {
      const job = await getSectionJobOrThrow(id, {
        partRequests: jobDetailInclude.partRequests,
      });
      const partRequests = job.partRequests.map(decoratePartRequest);
      return {
        section: normalizedSection,
        job: basePayload(job),
        part_requests: partRequests,
        partRequests,
      };
    }
    case 'qc': {
      const job = await getSectionJobOrThrow(id, {
        qcReports: jobDetailInclude.qcReports,
      });
      return {
        section: normalizedSection,
        job: basePayload(job),
        qc_reports: job.qcReports,
        qcReports: job.qcReports,
      };
    }
    case 'payments': {
      const job = await getSectionJobOrThrow(id, {
        payments: jobDetailInclude.payments,
      });
      const payments = job.payments.map((payment) => ({
        ...payment,
        job_id: payment.jobId,
        payment_date: payment.paymentDate,
        payment_method: payment.paymentMethod,
        created_by: payment.createdBy,
        created_at: payment.createdAt,
      }));
      return {
        section: normalizedSection,
        job: basePayload(job),
        payments,
      };
    }
    case 'invoice': {
      const job = await getSectionJobOrThrow(id, {
        sale: jobListInclude.sale,
        items: jobDetailInclude.items,
        payments: jobDetailInclude.payments,
      });
      return {
        section: normalizedSection,
        job: basePayload(job),
        sale: decorateSale(job.sale),
        items: job.items.map(decorateItem),
        payments: job.payments,
      };
    }
    case 'delivery': {
      const job = await getSectionJobOrThrow(id, {
        deliveryHandovers: jobDetailInclude.deliveryHandovers,
      });
      return {
        section: normalizedSection,
        job: basePayload(job),
        delivery_handovers: job.deliveryHandovers,
        deliveryHandovers: job.deliveryHandovers,
      };
    }
    default:
      throw createError('Invalid service job section', 400, {
        allowed_sections: SERVICE_JOB_SECTIONS
          .map((serviceSection) => serviceSection.api_section || serviceSection.key)
          .filter((sectionKey) => sectionKey !== 'workflow'),
      });
  }
};

const resolveCustomerForCheckIn = async (client, payload) => {
  if (payload.customer_id) {
    const customerId = Number(payload.customer_id);
    const customer = await client.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw createError('Customer not found', 404);
    return customer.id;
  }

  const customerPayload = payload.customer || {};
  const phone = cleanText(customerPayload.phone || payload.customer_phone || payload.phone);
  const name = cleanText(customerPayload.name || payload.customer_name);

  if (phone) {
    const existing = await client.customer.findFirst({ where: { phone } });
    if (existing) return existing.id;
  }

  if (!name) {
    throw createError('Customer name is required when creating a check-in customer', 400);
  }

  const customer = await client.customer.create({
    data: {
      name,
      phone,
      email: cleanText(customerPayload.email || payload.customer_email),
      address: cleanText(customerPayload.address || payload.customer_address),
      taxNumber: cleanText(customerPayload.tax_number || payload.customer_tax_number),
      notes: cleanText(customerPayload.notes || payload.customer_notes),
    },
  });

  return customer.id;
};

const findCarByEquivalentPlate = async (client, plateNumber) => {
  const compactPlate = compactPlateNumber(plateNumber);
  if (!compactPlate) return null;

  const cars = await client.car.findMany({
    where: { plateNumber: { not: null } },
    select: {
      id: true,
      customerId: true,
      plateNumber: true,
    },
  });

  return cars.find((car) => compactPlateNumber(car.plateNumber) === compactPlate) || null;
};

const resolveCarForCheckIn = async (client, payload, customerId) => {
  if (payload.car_id) {
    const carId = Number(payload.car_id);
    const car = await client.car.findUnique({ where: { id: carId } });
    if (!car) throw createError('Car not found', 404);
    if (car.customerId && car.customerId !== customerId) {
      throw createError('Selected car belongs to a different customer', 400);
    }
    if (!car.customerId) {
      await client.car.update({ where: { id: carId }, data: { customerId } });
    }
    return car.id;
  }

  const carPayload = payload.car || {};
  const rawPlateNumber = cleanText(carPayload.plate_number || carPayload.plateNumber || payload.plate_number || payload.plateNumber);
  const plateNumber = normalizePlateNumber(rawPlateNumber);
  const vin = cleanText(carPayload.vin || payload.vin);

  if (plateNumber || vin) {
    const plateMatches = [...new Set([rawPlateNumber, plateNumber].filter(Boolean))];
    let existing = await client.car.findFirst({
      where: {
        OR: [
          ...plateMatches.map((plateMatch) => ({ plateNumber: plateMatch })),
          ...(vin ? [{ vin }] : []),
        ],
      },
    });

    if (!existing && plateNumber) {
      existing = await findCarByEquivalentPlate(client, plateNumber);
    }

    if (existing) {
      if (existing.customerId && existing.customerId !== customerId) {
        throw createError('Matched car belongs to a different customer', 400);
      }
      if (!existing.customerId) {
        await client.car.update({ where: { id: existing.id }, data: { customerId } });
      }
      return existing.id;
    }
  }

  const make = cleanText(carPayload.make || payload.make);
  const model = cleanText(carPayload.model || payload.model);

  if (!make || !model) {
    throw createError('Car make and model are required when creating a check-in car', 400);
  }

  const year = cleanText(carPayload.year || payload.year);
  const parsedYear = year ? Number(year) : null;

  if (parsedYear !== null && !Number.isInteger(parsedYear)) {
    throw createError('Car year must be a whole number', 400);
  }

  const car = await client.car.create({
    data: {
      customerId,
      plateNumber,
      vin,
      make,
      model,
      year: parsedYear,
      color: cleanText(carPayload.color || payload.color),
      notes: cleanText(carPayload.notes || payload.car_notes),
    },
  });

  return car.id;
};

const normalizeInspectionMedia = (payload = {}) => {
  const media = [
    ...(Array.isArray(payload.photos) ? payload.photos : []),
    ...(Array.isArray(payload.inspection_media) ? payload.inspection_media : []),
    ...(Array.isArray(payload.inspectionMedia) ? payload.inspectionMedia : []),
  ];

  return media.length ? media : null;
};

const createInspectionIfPresent = async (client, jobId, payload, createdBy) => {
  const inspectionData = {
    odometer: payload.odometer === undefined || payload.odometer === null || payload.odometer === ''
      ? null
      : nonNegativeQuantity(payload.odometer, 'Odometer'),
    fuelLevel: cleanText(payload.fuel_level || payload.fuelLevel),
    visualInspection: cleanText(payload.visual_inspection || payload.visualInspection),
    photos: normalizeInspectionMedia(payload),
    notes: cleanText(payload.inspection_notes || payload.check_in_notes),
  };

  if (!Object.values(inspectionData).some((value) => value !== null)) return;

  await client.serviceCheckInInspection.create({
    data: {
      jobId,
      ...inspectionData,
      createdBy: createdBy ? Number(createdBy) : null,
    },
  });
};

const createComplaints = async (client, jobId, payload, createdBy) => {
  const complaints = Array.isArray(payload.complaints)
    ? payload.complaints
    : [payload.complaint, payload.customer_complaint, payload.notes];

  for (const complaint of complaints.map(cleanText).filter(Boolean)) {
    await client.serviceJobComplaint.create({
      data: {
        jobId,
        description: complaint,
        createdBy: createdBy ? Number(createdBy) : null,
      },
    });
  }
};

export const createServiceJob = async (payload = {}, createdBy) => createCheckInServiceJob(payload, createdBy);

export const createCheckInServiceJob = async (payload = {}, createdBy) => {
  const jobId = await prisma.$transaction(async (client) => {
    const customerId = await resolveCustomerForCheckIn(client, payload);
    const carId = await resolveCarForCheckIn(client, payload, customerId);

    await ensureNoActiveJobForCar(client, carId);

    const job = await client.serviceJob.create({
      data: {
        customerId,
        carId,
        jobNumber: cleanText(payload.job_number || payload.jobNumber) || `JOB-${Date.now()}`,
        status: 'RECEIVED',
        currentStage: 'RECEIVED',
        assignedAdvisorId: payload.assigned_advisor_id ? Number(payload.assigned_advisor_id) : null,
        startDate: normalizeDate(payload.start_date, 'Start date') || new Date(),
        openedAt: new Date(),
        expectedFinishDate: normalizeDate(payload.expected_finish_date, 'Expected finish date'),
        notes: cleanText(payload.notes),
        createdBy: createdBy ? Number(createdBy) : null,
      },
      select: { id: true },
    });

    await createComplaints(client, job.id, payload, createdBy);
    await createInspectionIfPresent(client, job.id, payload, createdBy);
    await recordServiceJobHistory(client, {
      jobId: job.id,
      toStatus: 'RECEIVED',
      action: 'service_job_created',
      performedBy: createdBy,
      note: cleanText(payload.notes),
    });

    if (payload.send_to_diagnosis || payload.complete_reception) {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'AWAITING_DIAGNOSIS',
        performedBy: createdBy,
        action: 'reception_completed',
        note: 'Reception completed at check-in',
      });
    }

    return job.id;
  });

  return getServiceJobById(jobId);
};

export const completeReception = async (id, payload = {}, performedBy) => {
  await prisma.$transaction((client) =>
    changeServiceJobStatusInTransaction(client, {
      jobId: id,
      toStatus: 'AWAITING_DIAGNOSIS',
      performedBy,
      action: 'reception_completed',
      note: payload.note || payload.notes,
    }),
  );

  return getServiceJobById(id);
};

export const updateServiceJob = async (id, payload = {}, performedBy = null) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    throw createError('Service job status must be changed through the controlled workflow endpoints', 400);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'expected_finish_date')) {
    data.expectedFinishDate = normalizeDate(payload.expected_finish_date, 'Expected finish date');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    data.notes = cleanText(payload.notes);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'assigned_advisor_id')) {
    data.assignedAdvisorId = payload.assigned_advisor_id ? Number(payload.assigned_advisor_id) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'assigned_technician_id')) {
    data.assignedTechnicianId = payload.assigned_technician_id ? Number(payload.assigned_technician_id) : null;
  }

  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    if (data.notes !== undefined || data.expectedFinishDate !== undefined || data.assignedAdvisorId !== undefined || data.assignedTechnicianId !== undefined) {
      await client.serviceJob.update({ where: { id: job.id }, data });
      await recordServiceJobHistory(client, {
        jobId: job.id,
        fromStatus: job.status,
        toStatus: job.status,
        action: 'service_job_updated',
        performedBy,
        note: 'Service job details updated',
      });
    }
  });

  return getServiceJobById(id);
};

export const searchReceptionCustomers = async ({ phone, search } = {}) => {
  const query = cleanText(phone || search);

  return prisma.customer.findMany({
    where: query
      ? {
          OR: [
            { phone: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {},
    take: 20,
    orderBy: query ? { name: 'asc' } : [{ updatedAt: 'desc' }, { name: 'asc' }],
  });
};

export const searchReceptionCars = async ({ plate_number, plateNumber, vin, search, customer_id, customerId } = {}) => {
  const rawPlate = cleanText(plate_number || plateNumber);
  const plate = normalizePlateNumberSearch(rawPlate);
  const vinQuery = cleanText(vin);
  const query = cleanText(search);
  const normalizedQueryPlate = normalizePlateNumberSearch(query);
  const plateQueries = [...new Set([rawPlate, plate, query, normalizedQueryPlate].filter(Boolean))];
  const requestedCustomerId = Number(customer_id || customerId);
  const searchTerms = [
    ...plateQueries.map((plateQuery) => ({ plateNumber: { contains: plateQuery, mode: 'insensitive' } })),
    ...(vinQuery ? [{ vin: { contains: vinQuery, mode: 'insensitive' } }] : []),
    ...(query
      ? [
          { vin: { contains: query, mode: 'insensitive' } },
          { make: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
        ]
      : []),
  ];

  return prisma.car.findMany({
    where: {
      ...(Number.isInteger(requestedCustomerId) ? { customerId: requestedCustomerId } : {}),
      ...(searchTerms.length ? { OR: searchTerms } : {}),
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
    take: 20,
    orderBy: searchTerms.length
      ? [{ make: 'asc' }, { model: 'asc' }, { plateNumber: 'asc' }]
      : [{ updatedAt: 'desc' }, { make: 'asc' }, { model: 'asc' }, { plateNumber: 'asc' }],
  });
};

export const getActiveServiceJobByVehicle = async ({ plate_number, plateNumber, vin } = {}) => {
  const rawPlate = cleanText(plate_number || plateNumber);
  const plate = normalizePlateNumber(rawPlate);
  const vinQuery = cleanText(vin);
  const plateMatches = [...new Set([rawPlate, plate].filter(Boolean))];

  if (!plateMatches.length && !vinQuery) {
    throw createError('Plate number or VIN is required', 400);
  }

  const job = await prisma.serviceJob.findFirst({
    where: {
      status: { notIn: inactiveStatuses },
      car: {
        OR: [
          ...plateMatches.map((plateMatch) => ({ plateNumber: { equals: plateMatch, mode: 'insensitive' } })),
          ...(vinQuery ? [{ vin: { equals: vinQuery, mode: 'insensitive' } }] : []),
        ],
      },
    },
    include: jobDetailInclude,
    orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
  });

  return job ? decorateJob(job) : null;
};

export const listJobsAwaitingDiagnosis = async () => {
  const jobs = await prisma.serviceJob.findMany({
    where: {
      status: {
        in: ['AWAITING_DIAGNOSIS', 'DIAGNOSIS_IN_PROGRESS'],
      },
    },
    include: jobListInclude,
    orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
  });

  return jobs.map(decorateJob);
};

export const assignTechnician = async (id, { technician_id, note = null } = {}, performedBy) => {
  const technicianId = Number(technician_id);
  if (!Number.isInteger(technicianId)) throw createError('Choose a valid technician', 400);

  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['RECEIVED', 'AWAITING_DIAGNOSIS', 'DIAGNOSIS_IN_PROGRESS'], 'Technician can only be assigned before diagnosis is done');

    const technician = await client.user.findUnique({
      where: { id: technicianId },
      select: { id: true },
    });
    if (!technician) throw createError('Technician user not found', 404);

    await client.serviceJob.update({
      where: { id: job.id },
      data: { assignedTechnicianId: technicianId },
    });
    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: job.status,
      action: 'technician_assigned',
      performedBy,
      note,
    });

    if (job.status === 'RECEIVED') {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'AWAITING_DIAGNOSIS',
        performedBy,
        action: 'awaiting_diagnosis',
        note: 'Technician assignment moved job to diagnosis queue',
      });
    }
  });

  return getServiceJobById(id);
};

export const startDiagnosis = async (id, payload = {}, performedBy) => {
  await prisma.$transaction((client) =>
    changeServiceJobStatusInTransaction(client, {
      jobId: id,
      toStatus: 'DIAGNOSIS_IN_PROGRESS',
      performedBy,
      action: 'diagnosis_started',
      note: payload.note || payload.notes,
    }),
  );

  return getServiceJobById(id);
};

export const submitDiagnosisReport = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['DIAGNOSIS_IN_PROGRESS'], 'Diagnosis report can only be submitted while diagnosis is in progress');

    await client.serviceDiagnosisReport.create({
      data: {
        jobId: job.id,
        technicianId: payload.technician_id ? Number(payload.technician_id) : job.assignedTechnicianId,
        diagnosisNotes: cleanText(payload.diagnosis_notes || payload.notes),
        faultCodes: cleanText(Array.isArray(payload.fault_codes) ? payload.fault_codes.join(', ') : payload.fault_codes),
        cause: cleanText(payload.cause),
        recommendedWork: cleanText(payload.recommended_work),
        diagnosticFee: nonNegativeMoney(payload.diagnostic_fee ?? 0, 'Diagnostic fee'),
        createdBy: performedBy ? Number(performedBy) : null,
      },
    });

    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'DIAGNOSIS_DONE',
      performedBy,
      action: 'diagnosis_submitted',
      note: payload.diagnosis_notes || payload.notes,
    });
  });

  return getServiceJobById(id);
};

const buildEstimateLine = async (client, rawLine = {}) => {
  const lineType = normalizeLineType(rawLine);
  const quantity = positiveQuantity(rawLine.quantity ?? 1);
  const productId = rawLine.product_id || rawLine.productId ? Number(rawLine.product_id || rawLine.productId) : null;
  let product = null;
  let description = cleanText(rawLine.description || rawLine.name);

  if (lineType === 'product') {
    if (!Number.isInteger(productId)) throw createError('Product estimate lines require a valid product', 400);

    product = await client.product.findUnique({
      where: { id: productId },
      select: includeProductSummary,
    });
    if (!product) throw createError('Product not found', 404);
    description = description || product.name;
  } else if (!description) {
    throw createError('Service estimate lines require a description', 400);
  }

  const unitPrice =
    rawLine.unit_price === undefined || rawLine.unit_price === null || rawLine.unit_price === ''
      ? toMoneyNumber(product?.salePrice)
      : nonNegativeMoney(rawLine.unit_price, 'Unit price');
  const unitCost =
    rawLine.unit_cost === undefined || rawLine.unit_cost === null || rawLine.unit_cost === ''
      ? toMoneyNumber(product?.purchasePrice)
      : nonNegativeMoney(rawLine.unit_cost, 'Unit cost');
  const discountAmount = nonNegativeMoney(rawLine.discount_amount ?? 0, 'Discount amount');
  const taxAmount = nonNegativeMoney(rawLine.tax_amount ?? 0, 'Tax amount');
  const lineTotal = roundMoney(quantity * unitPrice - discountAmount + taxAmount);

  if (lineTotal < 0) {
    throw createError('Estimate line total cannot be negative', 400);
  }

  return {
    productId,
    lineType,
    description,
    quantity,
    unitCost,
    unitPrice,
    discountAmount,
    taxAmount,
    lineTotal,
    notes: cleanText(rawLine.notes),
  };
};

const recalculateEstimateTotals = async (client, estimateId) => {
  const lines = await client.serviceEstimateLine.findMany({
    where: { estimateId: Number(estimateId) },
  });
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.quantity) * toMoneyNumber(line.unitPrice), 0));
  const discountAmount = roundMoney(lines.reduce((sum, line) => sum + toMoneyNumber(line.discountAmount), 0));
  const taxAmount = roundMoney(lines.reduce((sum, line) => sum + toMoneyNumber(line.taxAmount), 0));
  const totalAmount = roundMoney(lines.reduce((sum, line) => sum + toMoneyNumber(line.lineTotal), 0));

  return client.serviceEstimate.update({
    where: { id: Number(estimateId) },
    data: {
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
    },
  });
};

export const createEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['DIAGNOSIS_DONE'], 'Estimate can only be created after diagnosis is done');

    const diagnosisReportId = payload.diagnosis_report_id ? Number(payload.diagnosis_report_id) : null;
    if (diagnosisReportId) {
      const diagnosisReport = await client.serviceDiagnosisReport.findFirst({
        where: { id: diagnosisReportId, jobId: job.id },
        select: { id: true },
      });
      if (!diagnosisReport) throw createError('Diagnosis report not found for this service job', 404);
    }

    const rawLines = Array.isArray(payload.lines) ? [...payload.lines] : [];
    if (!rawLines.length && payload.diagnostic_fee && Number(payload.diagnostic_fee) > 0) {
      rawLines.push({
        line_type: 'service',
        description: 'Diagnostic fee',
        quantity: 1,
        unit_price: payload.diagnostic_fee,
      });
    }

    const estimate = await client.serviceEstimate.create({
      data: {
        jobId: job.id,
        diagnosisReportId,
        estimateNumber: cleanText(payload.estimate_number) || `EST-${Date.now()}`,
        notes: cleanText(payload.notes),
        createdBy: performedBy ? Number(performedBy) : null,
      },
      select: { id: true },
    });

    for (const rawLine of rawLines) {
      const line = await buildEstimateLine(client, rawLine);
      await client.serviceEstimateLine.create({
        data: {
          estimateId: estimate.id,
          ...line,
        },
      });
    }

    await recalculateEstimateTotals(client, estimate.id);
    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'ESTIMATE_CREATED',
      performedBy,
      action: 'estimate_created',
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const createSupplementalEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureSupplementalEstimateAllowed(job);

    const openSupplementalEstimate = await client.serviceEstimate.findFirst({
      where: {
        jobId: job.id,
        isSupplemental: true,
        status: { in: ['draft', 'sent'] },
      },
      select: { id: true, estimateNumber: true, status: true },
    });
    if (openSupplementalEstimate) {
      throw createError('Finish the open supplemental estimate before creating another one', 400, {
        estimate_id: openSupplementalEstimate.id,
        estimate_number: openSupplementalEstimate.estimateNumber,
        status: openSupplementalEstimate.status,
      });
    }

    const rawLines = Array.isArray(payload.lines) ? [...payload.lines] : [];
    if (!rawLines.length) throw createError('Supplemental estimate must include at least one line', 400);

    const estimate = await client.serviceEstimate.create({
      data: {
        jobId: job.id,
        estimateNumber: cleanText(payload.estimate_number) || `SUP-${job.jobNumber}-${Date.now()}`,
        isSupplemental: true,
        sourceStatus: job.status,
        notes: cleanText(payload.notes),
        createdBy: performedBy ? Number(performedBy) : null,
      },
      select: { id: true },
    });

    for (const rawLine of rawLines) {
      const line = await buildEstimateLine(client, rawLine);
      await client.serviceEstimateLine.create({
        data: {
          estimateId: estimate.id,
          ...line,
        },
      });
    }

    await recalculateEstimateTotals(client, estimate.id);
    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: job.status,
      action: 'supplemental_estimate_created',
      performedBy,
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const addEstimateLines = async (id, estimateId, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);

    const estimate = await client.serviceEstimate.findFirst({
      where: { id: Number(estimateId), jobId: job.id },
    });
    if (!estimate) throw createError('Estimate not found for this service job', 404);
    if (estimate.isSupplemental) {
      ensureSupplementalEstimateAllowed(job);
    } else {
      ensureStatus(job, ['ESTIMATE_CREATED'], 'Estimate lines can only be changed before sending for approval');
    }
    if (estimate.status !== 'draft') throw createError('Only draft estimates can receive new lines', 400);

    const rawLines = Array.isArray(payload.lines) ? payload.lines : [payload];
    for (const rawLine of rawLines) {
      const line = await buildEstimateLine(client, rawLine);
      await client.serviceEstimateLine.create({
        data: {
          estimateId: estimate.id,
          ...line,
        },
      });
    }

    await recalculateEstimateTotals(client, estimate.id);
    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: job.status,
      action: 'estimate_lines_added',
      performedBy,
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const sendEstimateForApproval = async (id, estimateId, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);

    const estimate = await client.serviceEstimate.findFirst({
      where: { id: Number(estimateId), jobId: job.id },
      include: { lines: true },
    });
    if (!estimate) throw createError('Estimate not found for this service job', 404);
    if (estimate.isSupplemental) {
      ensureSupplementalEstimateAllowed(job);
    } else {
      ensureStatus(job, ['ESTIMATE_CREATED'], 'Estimate can only be sent after it has been created');
    }
    if (estimate.status !== 'draft') throw createError('Only draft estimates can be sent for approval', 400);
    if (!estimate.lines.length) throw createError('Estimate must include at least one line before approval', 400);

    await client.serviceEstimate.update({
      where: { id: estimate.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });
    if (estimate.isSupplemental) {
      await recordServiceJobHistory(client, {
        jobId: job.id,
        fromStatus: job.status,
        toStatus: job.status,
        action: 'supplemental_estimate_sent_for_approval',
        performedBy,
        note: payload.note || payload.notes,
      });
    } else {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'AWAITING_APPROVAL',
        performedBy,
        action: 'estimate_sent_for_approval',
        note: payload.note || payload.notes,
      });
    }
  });

  return getServiceJobById(id);
};

const approvedLineTotal = (line, approvedQuantity) => {
  const ratio = Number(line.quantity) > 0 ? approvedQuantity / Number(line.quantity) : 0;
  return roundMoney(
    approvedQuantity * toMoneyNumber(line.unitPrice) -
      toMoneyNumber(line.discountAmount) * ratio +
      toMoneyNumber(line.taxAmount) * ratio,
  );
};

const normalizeApprovalMethod = (value) => {
  const method = cleanText(value) || 'system';
  const valid = new Set(['paper_signature', 'phone', 'whatsapp', 'sms', 'email', 'system']);
  if (!valid.has(method)) throw createError('Invalid approval method', 400);
  return method;
};

const applyEstimateApproval = async (client, job, estimate, approvedQuantities, approvalPayload, performedBy, options = {}) => {
  const isSupplemental = Boolean(options.supplemental ?? estimate.isSupplemental);
  const approvedItems = [];
  const estimateLineIds = new Set(estimate.lines.map((line) => line.id));
  for (const lineId of approvedQuantities.keys()) {
    if (!estimateLineIds.has(lineId)) {
      throw createError('Approved line does not belong to this estimate', 400, { line_id: lineId });
    }
  }

  const allLinesApproved = estimate.lines.every((line) => approvedQuantities.get(line.id) === line.quantity);
  const approvalStatus =
    approvedQuantities.size === 0
      ? 'rejected'
      : allLinesApproved
        ? 'approved'
        : 'partially_approved';
  const targetStatus = isSupplemental
    ? null
    : approvalStatus === 'approved'
      ? 'APPROVED'
      : approvalStatus === 'partially_approved'
        ? 'PARTIALLY_APPROVED'
        : 'REJECTED';

  for (const line of estimate.lines) {
    const approvedQuantity = nonNegativeQuantity(approvedQuantities.get(line.id) || 0, 'Approved quantity');
    if (approvedQuantity > line.quantity) {
      throw createError('Approved quantity cannot be greater than estimate quantity', 400, {
        line_id: line.id,
      });
    }

    await client.serviceEstimateLine.update({
      where: { id: line.id },
      data: {
        approvalStatus: approvedQuantity > 0 ? 'approved' : 'rejected',
        approvedQuantity,
      },
    });

    if (approvedQuantity <= 0) continue;

    const item = await client.serviceJobItem.create({
      data: {
        jobId: job.id,
        productId: line.productId,
        estimateLineId: line.id,
        lineType: line.lineType,
        description: line.description,
        quantity: approvedQuantity,
        approvedQuantity,
        approvalStatus: 'approved',
        workStatus: 'pending',
        unitCost: toMoneyNumber(line.unitCost),
        unitPrice: toMoneyNumber(line.unitPrice),
        lineTotal: approvedLineTotal(line, approvedQuantity),
        notes: line.notes,
        createdBy: performedBy ? Number(performedBy) : null,
      },
    });
    approvedItems.push(item);
  }

  await client.serviceEstimate.update({
    where: { id: estimate.id },
    data: { status: approvalStatus },
  });

  await client.serviceCustomerApproval.create({
    data: {
      jobId: job.id,
      estimateId: estimate.id,
      status: approvalStatus,
      method: normalizeApprovalMethod(approvalPayload.method || approvalPayload.approval_method),
      approvedBy: cleanText(approvalPayload.approved_by || approvalPayload.approvedBy),
      approvedAt: normalizeDate(approvalPayload.approved_at, 'Approval date') || new Date(),
      notes: cleanText(approvalPayload.notes),
      createdBy: performedBy ? Number(performedBy) : null,
    },
  });

  if (approvedItems.length) {
    const workOrder = await client.serviceWorkOrder.create({
      data: {
        jobId: job.id,
        status: 'pending',
        notes: isSupplemental ? 'Created from customer-approved supplemental estimate' : 'Created from customer-approved estimate',
        createdBy: performedBy ? Number(performedBy) : null,
      },
    });

    for (const item of approvedItems) {
      await client.serviceWorkOrderLine.create({
        data: {
          workOrderId: workOrder.id,
          jobItemId: item.id,
          status: 'pending',
          createdBy: performedBy ? Number(performedBy) : null,
        },
      });
    }
  }

  if (isSupplemental) {
    if (approvedItems.length && ['WORK_DONE', 'QC_FAILED'].includes(job.status)) {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'WORK_IN_PROGRESS',
        performedBy,
        action: `supplemental_estimate_${approvalStatus}_work_reopened`,
        note: approvalPayload.notes,
      });
    } else {
      await recordServiceJobHistory(client, {
        jobId: job.id,
        fromStatus: job.status,
        toStatus: job.status,
        action: `supplemental_estimate_${approvalStatus}`,
        performedBy,
        note: approvalPayload.notes,
      });
    }
    return;
  }

  await changeServiceJobStatusInTransaction(client, {
    jobId: job.id,
    toStatus: targetStatus,
    performedBy,
    action: `estimate_${approvalStatus}`,
    note: approvalPayload.notes,
  });
};

const getEstimateForApproval = async (client, jobId, estimateId = null, options = {}) => {
  const estimate = await client.serviceEstimate.findFirst({
    where: {
      jobId: Number(jobId),
      ...(estimateId ? { id: Number(estimateId) } : {}),
      isSupplemental: Boolean(options.supplemental),
      status: 'sent',
    },
    include: {
      lines: {
        orderBy: { id: 'asc' },
      },
    },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
  });

  if (!estimate) throw createError('Sent estimate not found for this service job', 404);
  return estimate;
};

export const approveEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['AWAITING_APPROVAL'], 'Estimate can only be approved while awaiting customer approval');
    const estimate = await getEstimateForApproval(client, job.id, payload.estimate_id);
    const quantities = new Map(estimate.lines.map((line) => [line.id, line.quantity]));

    await applyEstimateApproval(client, job, estimate, quantities, payload, performedBy);
  });

  return getServiceJobById(id);
};

export const partiallyApproveEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['AWAITING_APPROVAL'], 'Estimate can only be approved while awaiting customer approval');
    const estimate = await getEstimateForApproval(client, job.id, payload.estimate_id);
    const approvedLines = Array.isArray(payload.approved_lines) ? payload.approved_lines : [];
    const quantities = new Map();

    for (const approvedLine of approvedLines) {
      const lineId = Number(approvedLine.line_id || approvedLine.id);
      const quantity = nonNegativeQuantity(approvedLine.approved_quantity ?? approvedLine.quantity ?? 0, 'Approved quantity');
      if (!Number.isInteger(lineId)) throw createError('Approved line id is invalid', 400);
      if (quantity > 0) quantities.set(lineId, quantity);
    }

    if (!quantities.size) throw createError('Partial approval requires at least one approved line', 400);
    await applyEstimateApproval(client, job, estimate, quantities, payload, performedBy);
  });

  return getServiceJobById(id);
};

export const rejectEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['AWAITING_APPROVAL'], 'Estimate can only be rejected while awaiting customer approval');
    const estimate = await getEstimateForApproval(client, job.id, payload.estimate_id);

    await applyEstimateApproval(client, job, estimate, new Map(), payload, performedBy);
  });

  return getServiceJobById(id);
};

export const approveSupplementalEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureSupplementalEstimateAllowed(job);
    const estimate = await getEstimateForApproval(client, job.id, payload.estimate_id, { supplemental: true });
    const quantities = new Map(estimate.lines.map((line) => [line.id, line.quantity]));

    await applyEstimateApproval(client, job, estimate, quantities, payload, performedBy, { supplemental: true });
  });

  return getServiceJobById(id);
};

export const partiallyApproveSupplementalEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureSupplementalEstimateAllowed(job);
    const estimate = await getEstimateForApproval(client, job.id, payload.estimate_id, { supplemental: true });
    const approvedLines = Array.isArray(payload.approved_lines) ? payload.approved_lines : [];
    const quantities = new Map();

    for (const approvedLine of approvedLines) {
      const lineId = Number(approvedLine.line_id || approvedLine.id);
      const quantity = nonNegativeQuantity(approvedLine.approved_quantity ?? approvedLine.quantity ?? 0, 'Approved quantity');
      if (!Number.isInteger(lineId)) throw createError('Approved line id is invalid', 400);
      if (quantity > 0) quantities.set(lineId, quantity);
    }

    if (!quantities.size) throw createError('Partial approval requires at least one approved line', 400);
    await applyEstimateApproval(client, job, estimate, quantities, payload, performedBy, { supplemental: true });
  });

  return getServiceJobById(id);
};

export const rejectSupplementalEstimate = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureSupplementalEstimateAllowed(job);
    const estimate = await getEstimateForApproval(client, job.id, payload.estimate_id, { supplemental: true });

    await applyEstimateApproval(client, job, estimate, new Map(), payload, performedBy, { supplemental: true });
  });

  return getServiceJobById(id);
};

export const addServiceJobItem = async (id, payload = {}, createdBy) => {
  throw createError('Executable service job lines must be created from an estimate and customer approval', 400);
};

export const removeServiceJobItem = async (id, itemId, performedBy) => {
  throw createError('Approved service job lines cannot be deleted directly; create a revised estimate or cancel the job workflow', 400);
};

export const requestParts = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['APPROVED', 'PARTIALLY_APPROVED', 'WAITING_PARTS', 'WORK_IN_PROGRESS'], 'Parts can only be requested after approval');
    ensureBeforeInvoice(job);

    const requestedItems = Array.isArray(payload.items) ? payload.items : null;
    const jobItems = await client.serviceJobItem.findMany({
      where: {
        jobId: job.id,
        lineType: 'product',
        approvalStatus: 'approved',
        ...(requestedItems
          ? {
              id: {
                in: requestedItems.map((item) => Number(item.job_item_id || item.item_id || item.id)).filter(Number.isInteger),
              },
            }
          : {}),
      },
    });

    if (!jobItems.length) throw createError('No approved product lines found for parts request', 400);

    for (const item of jobItems) {
      const requestedPayload = requestedItems?.find((entry) => Number(entry.job_item_id || entry.item_id || entry.id) === item.id);
      const requestedQuantity = requestedPayload
        ? positiveQuantity(requestedPayload.quantity ?? requestedPayload.requested_quantity, 'Requested quantity')
        : Math.max(Number(item.quantity) - Number(item.issuedQuantity) + Number(item.returnedQuantity), 0);

      if (requestedQuantity <= 0) continue;

      await client.servicePartRequest.create({
        data: {
          jobId: job.id,
          jobItemId: item.id,
          productId: item.productId,
          requestedQuantity,
          status: 'requested',
          notes: cleanText(payload.notes || requestedPayload?.notes),
          createdBy: performedBy ? Number(performedBy) : null,
        },
      });
    }

    if (['APPROVED', 'PARTIALLY_APPROVED'].includes(job.status)) {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'WAITING_PARTS',
        performedBy,
        action: 'parts_requested',
        note: payload.notes,
      });
    } else {
      await recordServiceJobHistory(client, {
        jobId: job.id,
        fromStatus: job.status,
        toStatus: job.status,
        action: 'parts_requested',
        performedBy,
        note: payload.notes,
      });
    }
  });

  return getServiceJobById(id);
};

const getPartRequestForUpdate = async (client, jobId, requestId) => {
  const request = await client.servicePartRequest.findFirst({
    where: {
      id: Number(requestId),
      jobId: Number(jobId),
    },
    include: {
      product: { select: includeProductSummary },
      jobItem: true,
    },
  });

  if (!request) throw createError('Part request not found for this service job', 404);
  return request;
};

export const reserveParts = async (id, requestId, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureBeforeInvoice(job);
    const request = await getPartRequestForUpdate(client, job.id, requestId);
    const reservableQuantity = Number(request.requestedQuantity) - Number(request.reservedQuantity);
    const quantity = payload.quantity || payload.reserved_quantity
      ? positiveQuantity(payload.quantity || payload.reserved_quantity, 'Reserved quantity')
      : reservableQuantity;

    if (quantity <= 0 || quantity > reservableQuantity) {
      throw createError('Reserved quantity exceeds remaining requested quantity', 400);
    }

    const product = await client.product.findUnique({
      where: { id: request.productId },
      select: { stockQuantity: true },
    });
    if (Number(product.stockQuantity) < quantity) {
      throw createError('Insufficient stock to reserve these parts', 400, {
        available_quantity: product.stockQuantity,
        requested_quantity: quantity,
      });
    }

    await client.servicePartRequest.update({
      where: { id: request.id },
      data: {
        reservedQuantity: { increment: quantity },
        status: 'reserved',
      },
    });
    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: job.status,
      action: 'parts_reserved',
      performedBy,
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const issueParts = async (id, requestId, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureBeforeInvoice(job);
    const request = await getPartRequestForUpdate(client, job.id, requestId);
    const remainingRequested = Number(request.requestedQuantity) - Number(request.issuedQuantity);
    const remainingReserved = Number(request.reservedQuantity) - Number(request.issuedQuantity);
    const defaultQuantity = remainingReserved > 0 ? remainingReserved : remainingRequested;
    const quantity = payload.quantity || payload.issued_quantity
      ? positiveQuantity(payload.quantity || payload.issued_quantity, 'Issued quantity')
      : defaultQuantity;

    if (quantity <= 0 || quantity > remainingRequested) {
      throw createError('Issued quantity exceeds remaining requested quantity', 400);
    }

    await recordStockMovement(client, {
      productId: request.productId,
      movementType: 'SALE',
      quantityChange: -quantity,
      referenceType: 'service_part_request',
      referenceId: request.id,
      notes: cleanText(payload.notes) || `Issued parts for service job ${job.jobNumber}`,
      createdBy: performedBy,
    });

    const nextIssuedQuantity = Number(request.issuedQuantity) + quantity;
    await client.servicePartRequest.update({
      where: { id: request.id },
      data: {
        issuedQuantity: { increment: quantity },
        status: nextIssuedQuantity >= Number(request.requestedQuantity) ? 'issued' : 'reserved',
      },
    });

    if (request.jobItemId) {
      await client.serviceJobItem.update({
        where: { id: request.jobItemId },
        data: {
          issuedQuantity: { increment: quantity },
        },
      });
    }

    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: job.status,
      action: 'parts_issued',
      performedBy,
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const markPartsUnavailable = async (id, requestId, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureBeforeInvoice(job);
    const request = await getPartRequestForUpdate(client, job.id, requestId);

    await client.servicePartRequest.update({
      where: { id: request.id },
      data: {
        status: 'unavailable',
        notes: cleanText(payload.notes) || request.notes,
      },
    });

    if (['APPROVED', 'PARTIALLY_APPROVED'].includes(job.status)) {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'WAITING_PARTS',
        performedBy,
        action: 'parts_unavailable',
        note: payload.notes,
      });
    } else {
      await recordServiceJobHistory(client, {
        jobId: job.id,
        fromStatus: job.status,
        toStatus: job.status,
        action: 'parts_unavailable',
        performedBy,
        note: payload.notes,
      });
    }
  });

  return getServiceJobById(id);
};

export const returnIssuedParts = async (id, requestId, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    if (invoiceLockedStatuses.has(job.status)) {
      throw createError('Issued service parts cannot be returned through the job after invoicing', 400);
    }
    const request = await getPartRequestForUpdate(client, job.id, requestId);
    const returnableQuantity = Number(request.issuedQuantity) - Number(request.returnedQuantity);
    const quantity = payload.quantity || payload.returned_quantity
      ? positiveQuantity(payload.quantity || payload.returned_quantity, 'Returned quantity')
      : returnableQuantity;

    if (quantity <= 0 || quantity > returnableQuantity) {
      throw createError('Returned quantity exceeds issued quantity', 400);
    }

    await recordStockMovement(client, {
      productId: request.productId,
      movementType: 'SALE_RETURN',
      quantityChange: quantity,
      referenceType: 'service_part_request',
      referenceId: request.id,
      notes: cleanText(payload.notes) || `Returned parts from service job ${job.jobNumber}`,
      createdBy: performedBy,
    });

    const nextReturnedQuantity = Number(request.returnedQuantity) + quantity;
    await client.servicePartRequest.update({
      where: { id: request.id },
      data: {
        returnedQuantity: { increment: quantity },
        status: nextReturnedQuantity >= Number(request.issuedQuantity) ? 'returned' : request.status,
      },
    });

    if (request.jobItemId) {
      await client.serviceJobItem.update({
        where: { id: request.jobItemId },
        data: {
          returnedQuantity: { increment: quantity },
        },
      });
    }

    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: job.status,
      action: 'parts_returned',
      performedBy,
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

const ensureAllRequiredPartsIssued = async (client, jobId) => {
  const productItems = await client.serviceJobItem.findMany({
    where: {
      jobId: Number(jobId),
      lineType: 'product',
      approvalStatus: 'approved',
    },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
        },
      },
    },
  });

  const missing = productItems
    .map((item) => ({
      item,
      availableIssued: Number(item.issuedQuantity) - Number(item.returnedQuantity),
    }))
    .filter(({ item, availableIssued }) => availableIssued < Number(item.quantity));

  if (missing.length) {
    throw createError('Cannot start work before approved parts are issued', 400, {
      missing_parts: missing.map(({ item, availableIssued }) => ({
        job_item_id: item.id,
        product_id: item.productId,
        product_name: item.product?.name || item.description,
        required_quantity: item.quantity,
        issued_quantity: availableIssued,
      })),
    });
  }
};

const ensureNoOpenServiceEstimates = async (client, jobId, message = 'Resolve open estimates before continuing') => {
  const openEstimate = await client.serviceEstimate.findFirst({
    where: {
      jobId: Number(jobId),
      status: { in: ['draft', 'sent'] },
    },
    select: {
      id: true,
      estimateNumber: true,
      status: true,
      isSupplemental: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  if (openEstimate) {
    throw createError(message, 400, {
      estimate_id: openEstimate.id,
      estimate_number: openEstimate.estimateNumber,
      status: openEstimate.status,
      is_supplemental: openEstimate.isSupplemental,
    });
  }
};

export const startWork = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['APPROVED', 'PARTIALLY_APPROVED', 'WAITING_PARTS'], 'Work can only start after approval and parts readiness');
    await ensureAllRequiredPartsIssued(client, job.id);

    const now = new Date();
    let workOrder = await client.serviceWorkOrder.findFirst({
      where: {
        jobId: job.id,
        status: { in: ['pending', 'in_progress'] },
      },
      orderBy: { id: 'desc' },
    });

    if (!workOrder) {
      workOrder = await client.serviceWorkOrder.create({
        data: {
          jobId: job.id,
          status: 'pending',
          createdBy: performedBy ? Number(performedBy) : null,
        },
      });
    }

    await client.serviceWorkOrder.update({
      where: { id: workOrder.id },
      data: {
        status: 'in_progress',
        startedAt: workOrder.startedAt || now,
        notes: cleanText(payload.notes) || workOrder.notes,
      },
    });
    await client.serviceWorkOrderLine.updateMany({
      where: { workOrderId: workOrder.id, status: 'pending' },
      data: {
        status: 'in_progress',
        startedAt: now,
      },
    });
    await client.serviceJobItem.updateMany({
      where: { jobId: job.id, approvalStatus: 'approved', workStatus: { in: ['pending', 'rework'] } },
      data: {
        workStatus: 'in_progress',
      },
    });
    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'WORK_IN_PROGRESS',
      performedBy,
      action: 'work_started',
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const markWorkDone = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['WORK_IN_PROGRESS'], 'Only work in progress can be marked done');
    await ensureAllRequiredPartsIssued(client, job.id);
    const now = new Date();

    await client.serviceJobItem.updateMany({
      where: { jobId: job.id, approvalStatus: 'approved' },
      data: {
        workStatus: 'done',
        completedAt: now,
      },
    });
    await client.serviceWorkOrder.updateMany({
      where: { jobId: job.id, status: { in: ['pending', 'in_progress'] } },
      data: {
        status: 'done',
        completedAt: now,
      },
    });
    await client.serviceWorkOrderLine.updateMany({
      where: {
        workOrder: { jobId: job.id },
        status: { in: ['pending', 'in_progress', 'rework'] },
      },
      data: {
        status: 'done',
        completedAt: now,
      },
    });
    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'WORK_DONE',
      performedBy,
      action: 'work_done',
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const startQualityControl = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    await ensureNoOpenServiceEstimates(client, id, 'Resolve open estimates before starting QC');
    await changeServiceJobStatusInTransaction(client, {
      jobId: id,
      toStatus: 'QC_IN_PROGRESS',
      performedBy,
      action: 'qc_started',
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

const createQCReport = async (client, jobId, payload, passed, performedBy) => {
  return client.serviceQCReport.create({
    data: {
      jobId: Number(jobId),
      complaintSolved: Boolean(payload.complaint_solved ?? payload.complaintSolved ?? passed),
      roadTestDone: Boolean(payload.road_test_done ?? payload.roadTestDone ?? false),
      scannerCheckDone: Boolean(payload.scanner_check_done ?? payload.scannerCheckDone ?? false),
      leaksChecked: Boolean(payload.leaks_checked ?? payload.leaksChecked ?? false),
      passed,
      finalNotes: cleanText(payload.final_notes || payload.notes),
      createdBy: performedBy ? Number(performedBy) : null,
    },
  });
};

export const passQualityControl = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['QC_IN_PROGRESS'], 'QC can only be passed while QC is in progress');
    await ensureNoOpenServiceEstimates(client, job.id, 'Resolve open estimates before passing QC');
    await createQCReport(client, job.id, payload, true, performedBy);
    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'QC_PASSED',
      performedBy,
      action: 'qc_passed',
      note: payload.final_notes || payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const failQualityControl = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id);
    ensureStatus(job, ['QC_IN_PROGRESS'], 'QC can only be failed while QC is in progress');
    await createQCReport(client, job.id, payload, false, performedBy);
    await client.serviceJobItem.updateMany({
      where: { jobId: job.id, approvalStatus: 'approved' },
      data: { workStatus: 'rework' },
    });
    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'QC_FAILED',
      performedBy,
      action: 'qc_failed',
      note: payload.final_notes || payload.notes,
    });

    if (payload.return_to_work !== false) {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'WORK_IN_PROGRESS',
        performedBy,
        action: 'qc_rework_started',
        note: 'QC failed and job returned to work',
      });
    }
  });

  return getServiceJobById(id);
};

const buildSaleItemsFromServiceJob = (job) => {
  const approvedItems = job.items.filter((item) => item.approvalStatus === 'approved');
  if (!approvedItems.length) {
    throw createError('Service job must have approved executable lines before invoicing', 400);
  }

  for (const item of approvedItems) {
    if (item.lineType === 'product' && Number(item.issuedQuantity) - Number(item.returnedQuantity) < Number(item.quantity)) {
      throw createError('Cannot invoice before all approved parts are issued', 400, {
        job_item_id: item.id,
        product_id: item.productId,
      });
    }
  }

  return approvedItems.map((item) => ({
    productId: item.lineType === 'product' ? item.productId : null,
    lineType: item.lineType,
    description: item.description || item.product?.name || 'Service charge',
    quantity: Number(item.quantity),
    unitPrice: toMoneyNumber(item.unitPrice),
    lineTotal: toMoneyNumber(item.lineTotal),
  }));
};

export const generateInvoiceFromServiceJob = async (id, payload = {}, performedBy) => {
  let saleId = null;

  await prisma.$transaction(async (client) => {
    let job = await getJobOrThrow(client, id, {
      customer: { select: { name: true } },
      items: {
        include: {
          product: {
            select: {
              name: true,
            },
          },
        },
      },
      payments: true,
    });
    ensureStatus(job, ['QC_PASSED', 'READY_FOR_INVOICE'], 'Invoice can only be generated after QC has passed');
    if (job.saleId) throw createError('Service job already has an invoice', 400);
    await ensureNoOpenServiceEstimates(client, job.id, 'Resolve open estimates before generating the invoice');

    if (job.status === 'QC_PASSED') {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'READY_FOR_INVOICE',
        performedBy,
        action: 'ready_for_invoice',
        note: 'QC passed and invoice generation started',
      });
      job = { ...job, status: 'READY_FOR_INVOICE' };
    }

    const saleItems = buildSaleItemsFromServiceJob(job);
    const totalAmount = roundMoney(saleItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const paidAmount = roundMoney(job.payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0));

    if (paidAmount > totalAmount) {
      throw createError('Service job advances cannot exceed invoice total', 400);
    }

    const sale = await client.sale.create({
      data: {
        customerId: job.customerId,
        carId: job.carId,
        customerName: job.customer?.name || null,
        saleNumber: cleanText(payload.sale_number || payload.invoice_number) || `SALE-${Date.now()}`,
        saleDate: normalizeDate(payload.sale_date, 'Invoice date') || new Date(),
        totalAmount,
        paidAmount,
        paymentMethod: paymentMethodSummary(job.payments),
        paymentStatus: derivePaymentStatus(paidAmount, totalAmount),
        notes: [`Created from service job ${job.jobNumber}`, cleanText(payload.notes)].filter(Boolean).join('\n'),
        createdBy: performedBy ? Number(performedBy) : null,
      },
      select: { id: true },
    });
    saleId = sale.id;

    for (const item of saleItems) {
      await client.saleItem.create({
        data: {
          saleId: sale.id,
          productId: item.productId,
          lineType: item.lineType,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        },
      });
    }

    for (const payment of job.payments) {
      const amount = toMoneyNumber(payment.amount);
      if (amount <= 0) continue;
      await client.salePayment.create({
        data: {
          saleId: sale.id,
          amount,
          paymentDate: payment.paymentDate || new Date(),
          paymentMethod: payment.paymentMethod,
          notes: payment.notes || `Advance from service job ${job.jobNumber}`,
          createdBy: performedBy ? Number(performedBy) : null,
        },
      });
    }

    await client.serviceJob.update({
      where: { id: job.id },
      data: { saleId: sale.id },
    });
    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'INVOICED',
      performedBy,
      action: 'invoice_generated',
      note: payload.notes,
    });
  });

  return {
    job: await getServiceJobById(id),
    sale_id: saleId,
  };
};

export const finalizeServiceJob = async (id, payload = {}, performedBy) => generateInvoiceFromServiceJob(id, payload, performedBy);

export const createServiceJobPayment = async (id, payload = {}, performedBy) => {
  const parsedPayments = normalizePayments(payload);
  const paymentAmount = roundMoney(parsedPayments.reduce((sum, payment) => sum + payment.amount, 0));

  if (paymentAmount <= 0) throw createError('Payment amount must be greater than 0', 400);

  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id, {
      items: true,
      payments: true,
    });
    if (invoiceLockedStatuses.has(job.status)) {
      throw createError('After invoice generation, record payments on the Sale invoice', 400);
    }
    if (!advancePaymentStatuses.has(job.status)) {
      throw createError('Advance payments can only be recorded after customer approval and before final invoice payment', 400);
    }

    const approvedJobTotal = roundMoney(job.items.reduce((sum, item) => sum + toMoneyNumber(item.lineTotal), 0));
    if (approvedJobTotal <= 0) {
      throw createError('Payments are based on approved service job lines. Approve an estimate before recording an advance.', 400);
    }

    const paidAmount = roundMoney(job.payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0));
    const remainingAdvanceAmount = roundMoney(approvedJobTotal - paidAmount);
    if (remainingAdvanceAmount <= 0) {
      throw createError('Approved service job value is already fully covered by recorded advances', 400);
    }
    if (paymentAmount > remainingAdvanceAmount) {
      throw createError('Payment amount cannot be greater than approved service job remaining amount', 400);
    }

    for (const payment of parsedPayments) {
      await client.serviceJobPayment.create({
        data: {
          jobId: job.id,
          amount: payment.amount,
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod,
          notes: payment.notes,
          createdBy: performedBy ? Number(performedBy) : null,
        },
      });
    }

    await recordServiceJobHistory(client, {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: job.status,
      action: 'advance_payment_recorded',
      performedBy,
      note: payload.notes || `Advance payment recorded against approved job total ${approvedJobTotal}`,
    });
  });

  return getServiceJobById(id);
};

export const syncServiceJobPaymentStatus = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    let job = await getJobOrThrow(client, id, {
      sale: {
        select: {
          id: true,
          paymentStatus: true,
        },
      },
    });

    if (!job.sale) throw createError('Service job invoice has not been generated', 400);
    ensureStatus(job, ['INVOICED', 'PAYMENT_PENDING'], 'Payment can only be synced after invoicing');

    if (job.status === 'INVOICED') {
      job = await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'PAYMENT_PENDING',
        performedBy,
        action: 'payment_pending',
        note: payload.notes,
      });
    }

    const sale = await client.sale.findUnique({
      where: { id: job.saleId },
      select: { paymentStatus: true },
    });
    if (sale.paymentStatus === 'paid') {
      await changeServiceJobStatusInTransaction(client, {
        jobId: job.id,
        toStatus: 'PAID',
        performedBy,
        action: 'invoice_paid',
        note: payload.notes,
      });
    } else {
      await recordServiceJobHistory(client, {
        jobId: job.id,
        fromStatus: job.status,
        toStatus: job.status,
        action: 'payment_status_checked',
        performedBy,
        note: `Sale payment status is ${sale.paymentStatus}`,
      });
    }
  });

  return getServiceJobById(id);
};

export const markReadyForDelivery = async (id, payload = {}, performedBy) => {
  await prisma.$transaction((client) =>
    changeServiceJobStatusInTransaction(client, {
      jobId: id,
      toStatus: 'READY_FOR_DELIVERY',
      performedBy,
      action: 'ready_for_delivery',
      note: payload.notes,
    }),
  );

  return getServiceJobById(id);
};

export const deliverVehicle = async (id, payload = {}, performedBy) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id, {
      sale: {
        select: {
          paymentStatus: true,
        },
      },
    });
    ensureStatus(job, ['READY_FOR_DELIVERY'], 'Vehicle can only be delivered after it is ready for delivery');
    if (!job.sale || job.sale.paymentStatus !== 'paid') {
      throw createError('Vehicle cannot be delivered before invoice payment is complete', 400);
    }

    await client.serviceDeliveryHandover.create({
      data: {
        jobId: job.id,
        deliveredBy: payload.delivered_by ? Number(payload.delivered_by) : performedBy ? Number(performedBy) : null,
        receivedByName: cleanText(payload.received_by_name || payload.receivedByName),
        customerSigned: Boolean(payload.customer_signed ?? payload.customerSigned ?? false),
        deliveredAt: normalizeDate(payload.delivered_at, 'Delivery date') || new Date(),
        notes: cleanText(payload.notes),
        createdBy: performedBy ? Number(performedBy) : null,
      },
    });

    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'DELIVERED',
      performedBy,
      action: 'vehicle_delivered',
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};

export const closeServiceJob = async (id, payload = {}, performedBy) => {
  await prisma.$transaction((client) =>
    changeServiceJobStatusInTransaction(client, {
      jobId: id,
      toStatus: 'CLOSED',
      performedBy,
      action: 'service_job_closed',
      note: payload.notes,
    }),
  );

  return getServiceJobById(id);
};

export const cancelServiceJob = async (id, performedBy, payload = {}) => {
  await prisma.$transaction(async (client) => {
    const job = await getJobOrThrow(client, id, {
      items: true,
    });

    if (job.saleId || invoiceLockedStatuses.has(job.status)) {
      throw createError('Invoiced service jobs cannot be cancelled', 400);
    }
    if (job.status === 'CANCELLED') return;

    for (const item of job.items) {
      if (item.lineType !== 'product' || !item.productId) continue;
      const returnQuantity = Number(item.issuedQuantity) - Number(item.returnedQuantity);
      if (returnQuantity <= 0) continue;

      await recordStockMovement(client, {
        productId: item.productId,
        movementType: 'SALE_RETURN',
        quantityChange: returnQuantity,
        referenceType: 'service_job_cancel',
        referenceId: job.id,
        notes: `Cancelled service job ${job.jobNumber}`,
        createdBy: performedBy,
      });
      await client.serviceJobItem.update({
        where: { id: item.id },
        data: {
          returnedQuantity: { increment: returnQuantity },
        },
      });
    }

    await changeServiceJobStatusInTransaction(client, {
      jobId: job.id,
      toStatus: 'CANCELLED',
      performedBy,
      action: 'service_job_cancelled',
      note: payload.notes,
    });
  });

  return getServiceJobById(id);
};
