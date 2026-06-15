import asyncHandler from '../../utils/asyncHandler.js';
import { cleanupInspectionMediaFiles } from '../../middlewares/upload.middleware.js';
import {
  addEstimateLines,
  addServiceJobItem,
  approveEstimate,
  approveSupplementalEstimate,
  assignTechnician,
  cancelServiceJob,
  closeServiceJob,
  completeReception,
  createCheckInServiceJob,
  createEstimate,
  createServiceJob,
  createSupplementalEstimate,
  createServiceJobPayment,
  deliverVehicle,
  failQualityControl,
  finalizeServiceJob,
  generateInvoiceFromServiceJob,
  getActiveServiceJobByVehicle,
  getServiceJobById,
  getServiceJobHistory,
  getServiceJobSection,
  issueParts,
  listJobsAwaitingDiagnosis,
  listServiceJobs,
  markPartsUnavailable,
  markReadyForDelivery,
  markWorkDone,
  partiallyApproveEstimate,
  partiallyApproveSupplementalEstimate,
  passQualityControl,
  rejectEstimate,
  rejectSupplementalEstimate,
  removeServiceJobItem,
  requestParts,
  reserveParts,
  returnIssuedParts,
  searchReceptionCars,
  searchReceptionCustomers,
  sendEstimateForApproval,
  startDiagnosis,
  startQualityControl,
  startWork,
  submitDiagnosisReport,
  syncServiceJobPaymentStatus,
  updateServiceJob,
  serviceWorkflowMetadata,
} from './serviceJob.service.js';

const actorId = (req) => req.user?.id;
const requestPayload = (req) => ({
  ...req.body,
  inspection_media: req.inspectionMedia || [],
});

export const getServiceJobs = asyncHandler(async (req, res) => {
  const result = await listServiceJobs(req.query, req.user);

  res.json({
    success: true,
    data: result,
  });
});

export const workflowMetadata = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: serviceWorkflowMetadata(),
  });
});

export const getServiceJob = asyncHandler(async (req, res) => {
  const job = await getServiceJobById(req.params.id, req.user);

  res.json({
    success: true,
    data: job,
  });
});

export const getSection = asyncHandler(async (req, res) => {
  const section = await getServiceJobSection(req.params.id, req.params.section, req.user);

  res.json({
    success: true,
    data: section,
  });
});

export const getHistory = asyncHandler(async (req, res) => {
  const history = await getServiceJobHistory(req.params.id);

  res.json({
    success: true,
    data: history,
  });
});

export const create = asyncHandler(async (req, res) => {
  let job;
  try {
    job = await createServiceJob(requestPayload(req), actorId(req));
  } catch (error) {
    await cleanupInspectionMediaFiles(req.inspectionMedia);
    throw error;
  }

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const checkIn = asyncHandler(async (req, res) => {
  let job;
  try {
    job = await createCheckInServiceJob(requestPayload(req), actorId(req));
  } catch (error) {
    await cleanupInspectionMediaFiles(req.inspectionMedia);
    throw error;
  }

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const update = asyncHandler(async (req, res) => {
  const job = await updateServiceJob(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const searchCustomers = asyncHandler(async (req, res) => {
  const customers = await searchReceptionCustomers(req.query);

  res.json({
    success: true,
    data: customers,
  });
});

export const searchCars = asyncHandler(async (req, res) => {
  const cars = await searchReceptionCars(req.query);

  res.json({
    success: true,
    data: cars,
  });
});

export const getActiveByVehicle = asyncHandler(async (req, res) => {
  const job = await getActiveServiceJobByVehicle(req.query);

  res.json({
    success: true,
    data: job,
  });
});

export const finishReception = asyncHandler(async (req, res) => {
  const job = await completeReception(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const diagnosisQueue = asyncHandler(async (_req, res) => {
  const jobs = await listJobsAwaitingDiagnosis();

  res.json({
    success: true,
    data: jobs,
  });
});

export const assign = asyncHandler(async (req, res) => {
  const job = await assignTechnician(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const startDiagnosisWork = asyncHandler(async (req, res) => {
  const job = await startDiagnosis(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const submitDiagnosis = asyncHandler(async (req, res) => {
  const job = await submitDiagnosisReport(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const createJobEstimate = asyncHandler(async (req, res) => {
  const job = await createEstimate(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const addJobEstimateLines = asyncHandler(async (req, res) => {
  const job = await addEstimateLines(req.params.id, req.params.estimateId, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const sendJobEstimate = asyncHandler(async (req, res) => {
  const job = await sendEstimateForApproval(req.params.id, req.params.estimateId, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const approveJobEstimate = asyncHandler(async (req, res) => {
  const job = await approveEstimate(
    req.params.id,
    { ...req.body, estimate_id: req.params.estimateId || req.body.estimate_id },
    actorId(req),
  );

  res.json({
    success: true,
    data: job,
  });
});

export const partiallyApproveJobEstimate = asyncHandler(async (req, res) => {
  const job = await partiallyApproveEstimate(
    req.params.id,
    { ...req.body, estimate_id: req.params.estimateId || req.body.estimate_id },
    actorId(req),
  );

  res.json({
    success: true,
    data: job,
  });
});

export const rejectJobEstimate = asyncHandler(async (req, res) => {
  const job = await rejectEstimate(
    req.params.id,
    { ...req.body, estimate_id: req.params.estimateId || req.body.estimate_id },
    actorId(req),
  );

  res.json({
    success: true,
    data: job,
  });
});

export const createJobSupplementalEstimate = asyncHandler(async (req, res) => {
  const job = await createSupplementalEstimate(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const sendJobSupplementalEstimate = asyncHandler(async (req, res) => {
  const job = await sendEstimateForApproval(req.params.id, req.params.estimateId, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const approveJobSupplementalEstimate = asyncHandler(async (req, res) => {
  const job = await approveSupplementalEstimate(
    req.params.id,
    { ...req.body, estimate_id: req.params.estimateId || req.body.estimate_id },
    actorId(req),
  );

  res.json({
    success: true,
    data: job,
  });
});

export const partiallyApproveJobSupplementalEstimate = asyncHandler(async (req, res) => {
  const job = await partiallyApproveSupplementalEstimate(
    req.params.id,
    { ...req.body, estimate_id: req.params.estimateId || req.body.estimate_id },
    actorId(req),
  );

  res.json({
    success: true,
    data: job,
  });
});

export const rejectJobSupplementalEstimate = asyncHandler(async (req, res) => {
  const job = await rejectSupplementalEstimate(
    req.params.id,
    { ...req.body, estimate_id: req.params.estimateId || req.body.estimate_id },
    actorId(req),
  );

  res.json({
    success: true,
    data: job,
  });
});

export const addItem = asyncHandler(async (req, res) => {
  const job = await addServiceJobItem(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const removeItem = asyncHandler(async (req, res) => {
  const job = await removeServiceJobItem(req.params.id, req.params.itemId, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const requestJobParts = asyncHandler(async (req, res) => {
  const job = await requestParts(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const reserveJobParts = asyncHandler(async (req, res) => {
  const job = await reserveParts(req.params.id, req.params.requestId, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const issueJobParts = asyncHandler(async (req, res) => {
  const job = await issueParts(req.params.id, req.params.requestId, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const markJobPartsUnavailable = asyncHandler(async (req, res) => {
  const job = await markPartsUnavailable(req.params.id, req.params.requestId, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const returnJobParts = asyncHandler(async (req, res) => {
  const job = await returnIssuedParts(req.params.id, req.params.requestId, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const startJobWork = asyncHandler(async (req, res) => {
  const job = await startWork(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const markJobWorkDone = asyncHandler(async (req, res) => {
  const job = await markWorkDone(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const startQc = asyncHandler(async (req, res) => {
  const job = await startQualityControl(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const passQc = asyncHandler(async (req, res) => {
  const job = await passQualityControl(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const failQc = asyncHandler(async (req, res) => {
  const job = await failQualityControl(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const generateInvoice = asyncHandler(async (req, res) => {
  const result = await generateInvoiceFromServiceJob(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const addPayment = asyncHandler(async (req, res) => {
  const job = await createServiceJobPayment(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const syncPayment = asyncHandler(async (req, res) => {
  const job = await syncServiceJobPaymentStatus(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const readyForDelivery = asyncHandler(async (req, res) => {
  const job = await markReadyForDelivery(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const deliver = asyncHandler(async (req, res) => {
  const job = await deliverVehicle(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: job,
  });
});

export const close = asyncHandler(async (req, res) => {
  const job = await closeServiceJob(req.params.id, req.body, actorId(req));

  res.json({
    success: true,
    data: job,
  });
});

export const finalize = asyncHandler(async (req, res) => {
  const result = await finalizeServiceJob(req.params.id, req.body, actorId(req));

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const job = await cancelServiceJob(req.params.id, actorId(req), req.body);

  res.json({
    success: true,
    data: job,
  });
});
