import { Router } from 'express';

import { authorizePermission } from '../../middlewares/auth.middleware.js';
import { serviceJobInspectionMediaUpload } from '../../middlewares/upload.middleware.js';
import {
  addItem,
  addJobEstimateLines,
  addPayment,
  approveJobEstimate,
  approveJobSupplementalEstimate,
  assign,
  cancel,
  checkIn,
  close,
  create,
  createJobEstimate,
  createJobSupplementalEstimate,
  deliver,
  diagnosisQueue,
  failQc,
  finalize,
  finishReception,
  generateInvoice,
  getActiveByVehicle,
  getHistory,
  getSection,
  getServiceJob,
  getServiceJobs,
  issueJobParts,
  markJobPartsUnavailable,
  markJobWorkDone,
  partiallyApproveJobEstimate,
  partiallyApproveJobSupplementalEstimate,
  passQc,
  readyForDelivery,
  rejectJobEstimate,
  rejectJobSupplementalEstimate,
  removeItem,
  requestJobParts,
  reserveJobParts,
  returnJobParts,
  searchCars,
  searchCustomers,
  sendJobEstimate,
  sendJobSupplementalEstimate,
  startDiagnosisWork,
  startJobWork,
  startQc,
  submitDiagnosis,
  syncPayment,
  update,
  workflowMetadata,
} from './serviceJob.controller.js';

const router = Router();

const canReceive = authorizePermission('service.reception.write');
const canDiagnose = authorizePermission('service.diagnosis.write');
const canEstimate = authorizePermission('service.estimate.write');
const canRequestParts = authorizePermission('service.parts.request');
const canIssueParts = authorizePermission('service.parts.issue');
const canWork = authorizePermission('service.work.write');
const canQc = authorizePermission('service.qc.write');
const canInvoice = authorizePermission('service.invoice.write');
const canPay = authorizePermission('service.payment.write');
const canDeliver = authorizePermission('service.delivery.write');
const canCancel = authorizePermission('service.cancel');

router.get('/workflow/meta', workflowMetadata);

router.route('/').get(getServiceJobs).post(canReceive, serviceJobInspectionMediaUpload, create);

router.get('/reception/customers', searchCustomers);
router.get('/reception/cars', searchCars);
router.get('/reception/active-job', getActiveByVehicle);
router.post('/reception/check-in', canReceive, serviceJobInspectionMediaUpload, checkIn);

router.get('/technician/diagnosis-queue', diagnosisQueue);

router.route('/:id').get(getServiceJob).patch(canReceive, update);
router.get('/:id/sections/:section', getSection);
router.get('/:id/history', getHistory);

router.post('/:id/reception/complete', canReceive, finishReception);

router.post('/:id/technician/assign', canEstimate, assign);
router.post('/:id/diagnosis/start', canDiagnose, startDiagnosisWork);
router.post('/:id/diagnosis/submit', canDiagnose, submitDiagnosis);

router.post('/:id/estimates', canEstimate, createJobEstimate);
router.post('/:id/estimates/approve', canEstimate, approveJobEstimate);
router.post('/:id/estimates/partial-approve', canEstimate, partiallyApproveJobEstimate);
router.post('/:id/estimates/reject', canEstimate, rejectJobEstimate);
router.post('/:id/estimates/:estimateId/lines', canEstimate, addJobEstimateLines);
router.post('/:id/estimates/:estimateId/send', canEstimate, sendJobEstimate);
router.post('/:id/estimates/:estimateId/approve', canEstimate, approveJobEstimate);
router.post('/:id/estimates/:estimateId/partial-approve', canEstimate, partiallyApproveJobEstimate);
router.post('/:id/estimates/:estimateId/reject', canEstimate, rejectJobEstimate);

router.post('/:id/supplemental-estimates', canEstimate, createJobSupplementalEstimate);
router.post('/:id/supplemental-estimates/:estimateId/send', canEstimate, sendJobSupplementalEstimate);
router.post('/:id/supplemental-estimates/:estimateId/approve', canEstimate, approveJobSupplementalEstimate);
router.post('/:id/supplemental-estimates/:estimateId/partial-approve', canEstimate, partiallyApproveJobSupplementalEstimate);
router.post('/:id/supplemental-estimates/:estimateId/reject', canEstimate, rejectJobSupplementalEstimate);

router.post('/:id/items', canEstimate, addItem);
router.delete('/:id/items/:itemId', canEstimate, removeItem);

router.post('/:id/parts/request', canRequestParts, requestJobParts);
router.post('/:id/parts/:requestId/reserve', canIssueParts, reserveJobParts);
router.post('/:id/parts/:requestId/issue', canIssueParts, issueJobParts);
router.post('/:id/parts/:requestId/unavailable', canIssueParts, markJobPartsUnavailable);
router.post('/:id/parts/:requestId/return', canIssueParts, returnJobParts);

router.post('/:id/work/start', canWork, startJobWork);
router.post('/:id/work/done', canWork, markJobWorkDone);

router.post('/:id/qc/start', canQc, startQc);
router.post('/:id/qc/pass', canQc, passQc);
router.post('/:id/qc/fail', canQc, failQc);

router.post('/:id/invoice/generate', canInvoice, generateInvoice);
router.post('/:id/finalize', canInvoice, finalize);

router.post('/:id/payments', canPay, addPayment);
router.post('/:id/payment/sync', canPay, syncPayment);

router.post('/:id/delivery/ready', canDeliver, readyForDelivery);
router.post('/:id/delivery/handover', canDeliver, deliver);
router.post('/:id/delivery/deliver', canDeliver, deliver);
router.post('/:id/close', canDeliver, close);

router.post('/:id/cancel', canCancel, cancel);

export default router;
