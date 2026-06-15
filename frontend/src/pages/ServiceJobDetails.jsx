import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileText,
  Plus,
  ReceiptText,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import LoadingSpinner from "../components/LoadingSpinner";
import PaymentSplitInput, { normalizePaymentsPayload } from "../components/PaymentSplitInput";
import SearchableSelect from "../components/SearchableSelect";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import {
  firstValue,
  getCarLabel,
  getProductBrandName,
  getProductCategoryName,
  getProductPrice,
  getProductSku,
  getProductStock,
} from "../utils/fields";
import { canAccessPermission } from "../utils/permissions";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import { getUser } from "../utils/storage";

const initialItemForm = {
  product_id: "",
  quantity: "1",
  unit_price: "",
  notes: "",
};

const initialServiceForm = {
  description: "",
  quantity: "1",
  unit_price: "",
  notes: "",
};

const initialFinalizeForm = {
  notes: "",
};

const initialDiagnosisForm = {
  diagnosis_notes: "",
  fault_codes: "",
  cause: "",
  recommended_work: "",
  diagnostic_fee: "",
};

const initialEstimateForm = {
  line_type: "service",
  product_id: "",
  description: "",
  quantity: "1",
  unit_price: "",
  notes: "",
};

const initialQcForm = {
  complaint_solved: true,
  road_test_done: false,
  scanner_check_done: false,
  leaks_checked: false,
  final_notes: "",
};

const initialDeliveryForm = {
  received_by_name: "",
  customer_signed: true,
  notes: "",
};

const statusMeta = {
  RECEIVED: { label: "Received", className: "badge-info" },
  AWAITING_DIAGNOSIS: { label: "Awaiting Diagnosis", className: "badge-warning" },
  DIAGNOSIS_IN_PROGRESS: { label: "Diagnosis In Progress", className: "badge-warning" },
  DIAGNOSIS_DONE: { label: "Diagnosis Done", className: "badge-info" },
  ESTIMATE_CREATED: { label: "Estimate Created", className: "badge-info" },
  AWAITING_APPROVAL: { label: "Awaiting Approval", className: "badge-warning" },
  APPROVED: { label: "Approved", className: "badge-success" },
  PARTIALLY_APPROVED: { label: "Partially Approved", className: "badge-warning" },
  REJECTED: { label: "Rejected", className: "badge-danger" },
  WAITING_PARTS: { label: "Waiting Parts", className: "badge-warning" },
  WORK_IN_PROGRESS: { label: "Work In Progress", className: "badge-warning" },
  WORK_DONE: { label: "Work Done", className: "badge-info" },
  QC_IN_PROGRESS: { label: "QC In Progress", className: "badge-warning" },
  QC_FAILED: { label: "QC Failed", className: "badge-danger" },
  QC_PASSED: { label: "QC Passed", className: "badge-success" },
  READY_FOR_INVOICE: { label: "Ready For Invoice", className: "badge-info" },
  INVOICED: { label: "Invoiced", className: "badge-neutral" },
  PAYMENT_PENDING: { label: "Payment Pending", className: "badge-warning" },
  PAID: { label: "Paid", className: "badge-success" },
  READY_FOR_DELIVERY: { label: "Ready For Delivery", className: "badge-info" },
  DELIVERED: { label: "Delivered", className: "badge-success" },
  CLOSED: { label: "Closed", className: "badge-neutral" },
  CANCELLED: { label: "Cancelled", className: "badge-danger" },
};

const workflowSteps = [
  { label: "Reception", statuses: ["RECEIVED"] },
  { label: "Diagnosis", statuses: ["AWAITING_DIAGNOSIS", "DIAGNOSIS_IN_PROGRESS"] },
  { label: "Estimate", statuses: ["DIAGNOSIS_DONE", "ESTIMATE_CREATED"] },
  { label: "Approval", statuses: ["AWAITING_APPROVAL", "REJECTED"] },
  { label: "Parts + Work", statuses: ["APPROVED", "PARTIALLY_APPROVED", "WAITING_PARTS", "WORK_IN_PROGRESS"] },
  { label: "QC", statuses: ["WORK_DONE", "QC_IN_PROGRESS", "QC_FAILED"] },
  { label: "Invoice", statuses: ["QC_PASSED", "READY_FOR_INVOICE", "INVOICED"] },
  { label: "Payment", statuses: ["PAYMENT_PENDING", "PAID"] },
  { label: "Delivery", statuses: ["READY_FOR_DELIVERY", "DELIVERED", "CLOSED"] },
];

const advancePaymentStatuses = [
  "APPROVED",
  "PARTIALLY_APPROVED",
  "WAITING_PARTS",
  "WORK_IN_PROGRESS",
  "WORK_DONE",
  "QC_IN_PROGRESS",
  "QC_FAILED",
  "QC_PASSED",
  "READY_FOR_INVOICE",
];

const supplementalEstimateStatuses = [
  "APPROVED",
  "PARTIALLY_APPROVED",
  "WAITING_PARTS",
  "WORK_IN_PROGRESS",
  "WORK_DONE",
  "QC_FAILED",
];

const yesNo = (value) => (value ? "Yes" : "No");
const isSupplementalEstimate = (estimate) => Boolean(firstValue(estimate?.is_supplemental, estimate?.isSupplemental, false));

const buildEstimateLinePayload = (form) => {
  const lineType = form.line_type;
  return {
    line_type: lineType,
    product_id: lineType === "product" && form.product_id ? Number(form.product_id) : null,
    description: lineType === "service" ? form.description.trim() : null,
    quantity: Number(form.quantity),
    unit_price: form.unit_price === "" ? null : Number(form.unit_price),
    notes: form.notes || null,
  };
};

const defaultTabForUser = (user) => {
  if (["admin", "manager"].includes(user?.role)) return "workflow";
  if (canAccessPermission(user, "service.diagnosis.write")) return "diagnosis";
  if (canAccessPermission(user, "service.reception.write")) return "reception";
  if (canAccessPermission(user, "service.estimate.write")) return "estimate";
  if (canAccessPermission(user, "service.parts.issue")) return "parts";
  if (canAccessPermission(user, "service.parts.request")) return "parts";
  if (canAccessPermission(user, "service.work.write")) return "work";
  if (canAccessPermission(user, "service.qc.write")) return "qc";
  if (canAccessPermission(user, "service.payment.write")) return "payments";
  if (canAccessPermission(user, "service.delivery.write")) return "delivery";
  return "workflow";
};

const fallbackServiceSections = [
  { key: "workflow", label: "Overview", any_permissions: ["service_jobs.view"] },
  { key: "reception", label: "Reception", any_permissions: ["service.reception.write"] },
  { key: "diagnosis", label: "Diagnosis", any_permissions: ["service.diagnosis.write"] },
  { key: "estimate", label: "Estimate", any_permissions: ["service.estimate.write"] },
  {
    key: "lines",
    label: "Lines",
    any_permissions: [
      "service.estimate.write",
      "service.parts.issue",
      "service.work.write",
      "service.invoice.write",
      "service.payment.write",
    ],
  },
  { key: "work", label: "Work", any_permissions: ["service.work.write"] },
  { key: "parts", label: "Parts", any_permissions: ["service.parts.request", "service.parts.issue"] },
  { key: "qc", label: "QC", any_permissions: ["service.qc.write"] },
  { key: "payments", label: "Payments", any_permissions: ["service.payment.write"] },
  { key: "invoice", label: "Invoice", any_permissions: ["service.invoice.write", "service.cancel"] },
  { key: "delivery", label: "Delivery", any_permissions: ["service.delivery.write"] },
  { key: "history", label: "History", any_permissions: ["service_jobs.view"] },
];

const permissionsForSection = (section) => {
  const permissions = firstValue(section?.any_permissions, section?.anyPermissions, section?.permissions, section?.permission);
  if (Array.isArray(permissions)) return permissions;
  return permissions ? [permissions] : [];
};

const canAccessServiceSection = (user, section) => {
  const permissions = permissionsForSection(section);
  if (!permissions.length) return true;
  return permissions.some((permission) => canAccessPermission(user, permission));
};

const serviceSectionLabel = (section, counts) => {
  const label = section?.label || section?.key || "Section";
  const count = counts[section?.key];
  return count === undefined ? label : `${label} (${count})`;
};

const productLabel = (product) => {
  const sku = getProductSku(product);
  return `${product?.name || "Product"}${sku ? ` - ${sku}` : ""}`;
};

const productDescription = (product) =>
  [getProductCategoryName(product), getProductBrandName(product), `Stock: ${getProductStock(product)}`]
    .filter(Boolean)
    .join(" / ");

const productSearchText = (product) =>
  [productLabel(product), getProductCategoryName(product), getProductBrandName(product)].filter(Boolean).join(" ");

const inspectionMediaUrl = (media) => {
  if (typeof media === "string") return media;
  return firstValue(media?.url, media?.href, media?.path, "");
};

const inspectionMediaKind = (media) => {
  if (typeof media === "string") return /\.(mp4|webm|mov|m4v)$/i.test(media) ? "video" : "image";
  return firstValue(media?.kind, media?.type, "").startsWith("video") || firstValue(media?.mime_type, media?.mimeType, "").startsWith("video/")
    ? "video"
    : "image";
};

const inspectionMediaName = (media, index) => {
  if (typeof media === "string") return `Inspection media ${index + 1}`;
  return firstValue(media?.original_name, media?.originalName, media?.name, `Inspection media ${index + 1}`);
};

const ServiceJobDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = getUser();
  const [job, setJob] = useState(null);
  const [products, setProducts] = useState([]);
  const [workflowMeta, setWorkflowMeta] = useState(null);
  const [itemForm, setItemForm] = useState(initialItemForm);
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [paymentRows, setPaymentRows] = useState([{ amount: "", payment_method: "cash", custom_method: "", notes: "" }]);
  const [finalizeForm, setFinalizeForm] = useState(initialFinalizeForm);
  const [diagnosisForm, setDiagnosisForm] = useState(initialDiagnosisForm);
  const [estimateForm, setEstimateForm] = useState(initialEstimateForm);
  const [supplementalEstimateForm, setSupplementalEstimateForm] = useState(initialEstimateForm);
  const [qcForm, setQcForm] = useState(initialQcForm);
  const [deliveryForm, setDeliveryForm] = useState(initialDeliveryForm);
  const [activeTab, setActiveTab] = useState(defaultTabForUser(currentUser));
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [savingItem, setSavingItem] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [itemError, setItemError] = useState("");
  const [serviceError, setServiceError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [finalizeError, setFinalizeError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  const loadJob = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get(`/service-jobs/${id}`);
      setJob(unwrapData(response, null));
    } catch (err) {
      setError(errorMessage(err, "Unable to load service job"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      setOptionsLoading(true);

      try {
        const canLoadProducts = canAccessPermission(currentUser, "products.view");
        const [jobResponse, workflowResponse, productsResponse] = await Promise.all([
          axiosClient.get(`/service-jobs/${id}`),
          axiosClient.get("/service-jobs/workflow/meta"),
          canLoadProducts
            ? axiosClient.get("/products", { params: { limit: 1000 } }).catch(() => null)
            : Promise.resolve(null),
        ]);

        setJob(unwrapData(jobResponse, null));
        setWorkflowMeta(unwrapData(workflowResponse, null));
        setProducts(productsResponse ? listFrom(unwrapData(productsResponse, [])) : []);
      } catch (err) {
        setError(errorMessage(err, "Unable to load service job"));
      } finally {
        setLoading(false);
        setOptionsLoading(false);
      }
    };

    loadInitial();
  }, [id]);

  const items = useMemo(() => listFrom(job?.items ?? []), [job]);
  const payments = useMemo(() => listFrom(job?.payments ?? []), [job]);
  const estimates = useMemo(() => listFrom(job?.estimates ?? []), [job]);
  const baseEstimates = useMemo(() => estimates.filter((estimate) => !isSupplementalEstimate(estimate)), [estimates]);
  const supplementalEstimates = useMemo(() => estimates.filter(isSupplementalEstimate), [estimates]);
  const latestEstimate = baseEstimates[0] || null;
  const latestSupplementalEstimate = supplementalEstimates[0] || null;
  const openSupplementalEstimate = supplementalEstimates.find((estimate) => ["draft", "sent"].includes(estimate.status));
  const partRequests = useMemo(() => listFrom(firstValue(job?.part_requests, job?.partRequests, [])), [job]);
  const histories = useMemo(() => listFrom(job?.histories ?? []), [job]);
  const complaints = useMemo(() => listFrom(job?.complaints ?? []), [job]);
  const inspections = useMemo(() => listFrom(job?.inspections ?? []), [job]);
  const diagnosisReports = useMemo(() => listFrom(firstValue(job?.diagnosis_reports, job?.diagnosisReports, [])), [job]);
  const approvals = useMemo(() => listFrom(job?.approvals ?? []), [job]);
  const workOrders = useMemo(() => listFrom(firstValue(job?.work_orders, job?.workOrders, [])), [job]);
  const qcReports = useMemo(() => listFrom(firstValue(job?.qc_reports, job?.qcReports, [])), [job]);
  const deliveryHandovers = useMemo(() => listFrom(firstValue(job?.delivery_handovers, job?.deliveryHandovers, [])), [job]);
  const latestInspection = inspections[inspections.length - 1] || null;
  const latestInspectionMedia = listFrom(firstValue(latestInspection?.photos, latestInspection?.media, latestInspection?.inspection_media, []));
  const latestDeliveryHandover = deliveryHandovers[0] || null;
  const totalAmount = Number(firstValue(job?.total_amount, job?.totalAmount, 0));
  const paidAmount = Number(firstValue(job?.paid_amount, job?.paidAmount, 0));
  const remainingAmount = Number(firstValue(job?.remaining_amount, job?.remainingAmount, Math.max(totalAmount - paidAmount, 0)));
  const approvedJobTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(firstValue(item.line_total, item.lineTotal, 0)), 0),
    [items],
  );
  const advancePaidAmount = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(firstValue(payment.amount, 0)), 0),
    [payments],
  );
  const advanceRemainingAmount = Math.max(approvedJobTotal - advancePaidAmount, 0);
  const invoiceLockedStatuses = ["INVOICED", "PAYMENT_PENDING", "PAID", "READY_FOR_DELIVERY", "DELIVERED", "CLOSED"];
  const canManageReception = canAccessPermission(currentUser, "service.reception.write");
  const canManageDiagnosis = canAccessPermission(currentUser, "service.diagnosis.write");
  const canManageEstimate = canAccessPermission(currentUser, "service.estimate.write");
  const canManageParts = canAccessPermission(currentUser, "service.parts.issue");
  const canRequestParts = canAccessPermission(currentUser, "service.parts.request");
  const canManageWork = canAccessPermission(currentUser, "service.work.write");
  const canManageQc = canAccessPermission(currentUser, "service.qc.write");
  const canManageInvoice = canAccessPermission(currentUser, "service.invoice.write");
  const canManagePayment = canAccessPermission(currentUser, "service.payment.write");
  const canManageDelivery = canAccessPermission(currentUser, "service.delivery.write");
  const canCancelJob = canAccessPermission(currentUser, "service.cancel");
  const canEdit = false;
  const canCreateSupplementalEstimate = Boolean(
    canManageEstimate && job?.status && supplementalEstimateStatuses.includes(job.status) && !openSupplementalEstimate,
  );
  const canRecordAdvance = Boolean(
    canManagePayment && job?.status && advancePaymentStatuses.includes(job.status) && approvedJobTotal > 0 && advanceRemainingAmount > 0,
  );
  const canFinalize = canManageInvoice && ["QC_PASSED", "READY_FOR_INVOICE"].includes(job?.status) && items.length > 0;
  const effectiveStatusMeta = workflowMeta?.status_meta || statusMeta;
  const workflowStepsSource = workflowMeta?.stages?.length
    ? workflowMeta.stages.map((step) => ({ label: step.label, statuses: step.statuses || [] }))
    : workflowSteps;
  const roleRelevantNextActions = listFrom(firstValue(job?.next_actions, job?.nextActions, [])).filter((action) =>
    canAccessPermission(currentUser, action.permission),
  );
  const meta = effectiveStatusMeta[job?.status] || statusMeta.RECEIVED;
  const jobNumber = firstValue(job?.job_number, job?.jobNumber, `Job #${id}`);
  const activeWorkflowStepIndex = workflowStepsSource.findIndex((step) => step.statuses.includes(job?.status));
  const currentWorkflowStep = firstValue(job?.stage_label, job?.stage?.label, activeWorkflowStepIndex >= 0 ? workflowStepsSource[activeWorkflowStepIndex].label : "Stopped");
  const paymentGuidance = invoiceLockedStatuses.includes(job?.status)
    ? "After invoice generation, collect final payments on the linked Sale invoice, then sync payment status here."
    : approvedJobTotal > 0 && advanceRemainingAmount <= 0
      ? "The approved job value is already covered by recorded advances."
      : "Advance payments open after customer approval and are capped by approved service job lines.";

  const summaryCards = [
    { title: "Job Total", value: formatCurrency(totalAmount), icon: ReceiptText, tone: "success" },
    { title: "Paid", value: formatCurrency(paidAmount), icon: CreditCard, tone: "info" },
    { title: "Remaining", value: formatCurrency(remainingAmount), icon: FileText, tone: "warning" },
    { title: "Lines", value: items.length, icon: Wrench, tone: "neutral" },
  ];

  const sectionCounts = {
    diagnosis: diagnosisReports.length,
    estimate: estimates.length,
    lines: items.length,
    work: workOrders.length,
    parts: partRequests.length,
    qc: qcReports.length,
    payments: payments.length,
    delivery: deliveryHandovers.length,
    history: histories.length,
  };
  const serviceSections = workflowMeta?.sections?.length ? workflowMeta.sections : fallbackServiceSections;
  const tabs = serviceSections
    .filter((section) => canAccessServiceSection(currentUser, section))
    .map((section) => ({
      id: section.key,
      label: serviceSectionLabel(section, sectionCounts),
    }));
  const activeTabIsVisible = tabs.some((tab) => tab.id === activeTab);
  const selectedTab = activeTabIsVisible ? activeTab : tabs[0]?.id || "workflow";

  useEffect(() => {
    if (!activeTabIsVisible) {
      setActiveTab(selectedTab);
    }
  }, [activeTabIsVisible, selectedTab]);

  const estimateLineColumns = [
    { header: "Type", render: (row) => firstValue(row.line_type, row.lineType, "-") },
    { header: "Item", render: (row) => firstValue(row.product_name, row.product?.name, row.description, "-") },
    { header: "Qty", render: (row) => row.quantity },
    { header: "Approved Qty", render: (row) => firstValue(row.approved_quantity, row.approvedQuantity, 0) },
    { header: "Status", render: (row) => firstValue(row.approval_status, row.approvalStatus, "-") },
    { header: "Unit Price", render: (row) => formatCurrency(firstValue(row.unit_price, row.unitPrice, 0)) },
    { header: "Total", render: (row) => formatCurrency(firstValue(row.line_total, row.lineTotal, 0)) },
  ];

  const updateItemForm = (name, value) => {
    setItemForm((current) => ({ ...current, [name]: value }));
  };

  const updateServiceForm = (name, value) => {
    setServiceForm((current) => ({ ...current, [name]: value }));
  };

  const changeProduct = (value, product) => {
    setItemForm((current) => ({
      ...current,
      product_id: value,
      unit_price: product ? String(getProductPrice(product)) : "",
    }));
  };

  const updateFinalizeForm = (name, value) => {
    setFinalizeForm((current) => ({ ...current, [name]: value }));
  };

  const updateDiagnosisForm = (name, value) => {
    setDiagnosisForm((current) => ({ ...current, [name]: value }));
  };

  const updateEstimateForm = (name, value) => {
    setEstimateForm((current) => ({ ...current, [name]: value }));
  };

  const changeEstimateProduct = (value, product) => {
    setEstimateForm((current) => ({
      ...current,
      product_id: value,
      line_type: value ? "product" : current.line_type,
      description: value ? "" : current.description,
      unit_price: product ? String(getProductPrice(product)) : current.unit_price,
    }));
  };

  const updateSupplementalEstimateForm = (name, value) => {
    setSupplementalEstimateForm((current) => ({ ...current, [name]: value }));
  };

  const changeSupplementalEstimateProduct = (value, product) => {
    setSupplementalEstimateForm((current) => ({
      ...current,
      product_id: value,
      line_type: value ? "product" : current.line_type,
      description: value ? "" : current.description,
      unit_price: product ? String(getProductPrice(product)) : current.unit_price,
    }));
  };

  const updateQcForm = (name, value) => {
    setQcForm((current) => ({ ...current, [name]: value }));
  };

  const updateDeliveryForm = (name, value) => {
    setDeliveryForm((current) => ({ ...current, [name]: value }));
  };

  const postWorkflowAction = async (path, body = {}, { navigateToSale = false } = {}) => {
    setWorkflowSaving(true);
    setWorkflowError("");

    try {
      const response = await axiosClient.post(`/service-jobs/${id}${path}`, body);
      const data = unwrapData(response, null);

      if (navigateToSale && data?.sale_id) {
        navigate(`/sales/${data.sale_id}`);
        return;
      }

      setJob(data?.job || data);
    } catch (err) {
      setWorkflowError(errorMessage(err, "Unable to update workflow"));
    } finally {
      setWorkflowSaving(false);
    }
  };

  const submitDiagnosisReportForm = async (event) => {
    event.preventDefault();
    await postWorkflowAction("/diagnosis/submit", {
      ...diagnosisForm,
      diagnostic_fee: diagnosisForm.diagnostic_fee === "" ? 0 : Number(diagnosisForm.diagnostic_fee),
    });
    setDiagnosisForm(initialDiagnosisForm);
  };

  const submitEstimateForm = async (event) => {
    event.preventDefault();
    const line = buildEstimateLinePayload(estimateForm);

    await postWorkflowAction("/estimates", {
      lines: [line],
      notes: estimateForm.notes || null,
    });
    setEstimateForm(initialEstimateForm);
  };

  const submitSupplementalEstimateForm = async (event) => {
    event.preventDefault();
    const line = buildEstimateLinePayload(supplementalEstimateForm);

    await postWorkflowAction("/supplemental-estimates", {
      lines: [line],
      notes: supplementalEstimateForm.notes || null,
    });
    setSupplementalEstimateForm(initialEstimateForm);
  };

  const submitDeliveryForm = async (event) => {
    event.preventDefault();
    await postWorkflowAction("/delivery/handover", deliveryForm);
    setDeliveryForm(initialDeliveryForm);
  };

  const submitItem = async (event) => {
    event.preventDefault();

    if (!itemForm.product_id) {
      setItemError("Choose a product");
      return;
    }

    setSavingItem(true);
    setItemError("");

    try {
      const response = await axiosClient.post(`/service-jobs/${id}/items`, {
        product_id: Number(itemForm.product_id),
        quantity: Number(itemForm.quantity),
        unit_price: itemForm.unit_price === "" ? null : Number(itemForm.unit_price),
        notes: itemForm.notes || null,
      });

      setJob(unwrapData(response, null));
      setItemForm(initialItemForm);
    } catch (err) {
      setItemError(errorMessage(err, "Unable to add service job part"));
    } finally {
      setSavingItem(false);
    }
  };

  const submitService = async (event) => {
    event.preventDefault();

    if (!serviceForm.description.trim()) {
      setServiceError("Service description is required");
      return;
    }

    setSavingService(true);
    setServiceError("");

    try {
      const response = await axiosClient.post(`/service-jobs/${id}/items`, {
        line_type: "service",
        description: serviceForm.description.trim(),
        quantity: Number(serviceForm.quantity),
        unit_price: serviceForm.unit_price === "" ? 0 : Number(serviceForm.unit_price),
        notes: serviceForm.notes || null,
      });

      setJob(unwrapData(response, null));
      setServiceForm(initialServiceForm);
    } catch (err) {
      setServiceError(errorMessage(err, "Unable to add service charge"));
    } finally {
      setSavingService(false);
    }
  };

  const removeItem = async (itemId) => {
    setItemError("");

    try {
      const response = await axiosClient.delete(`/service-jobs/${id}/items/${itemId}`);
      setJob(unwrapData(response, null));
    } catch (err) {
      setItemError(errorMessage(err, "Unable to remove service job part"));
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();

    setSavingPayment(true);
    setPaymentError("");

    try {
      const response = await axiosClient.post(`/service-jobs/${id}/payments`, {
        payments: normalizePaymentsPayload(paymentRows),
      });

      setJob(unwrapData(response, null));
      setPaymentRows([{ amount: "", payment_method: "cash", custom_method: "", notes: "" }]);
    } catch (err) {
      setPaymentError(errorMessage(err, "Unable to record payment"));
    } finally {
      setSavingPayment(false);
    }
  };

  const submitFinalize = async (event) => {
    event.preventDefault();
    setFinalizing(true);
    setFinalizeError("");

    try {
      const response = await axiosClient.post(`/service-jobs/${id}/invoice/generate`, {
        notes: finalizeForm.notes || null,
      });
      const result = unwrapData(response, {});
      navigate(`/sales/${result.sale_id}`);
    } catch (err) {
      setFinalizeError(errorMessage(err, "Unable to create final invoice"));
    } finally {
      setFinalizing(false);
    }
  };

  const cancelJob = async () => {
    setSavingStatus(true);
    setError("");

    try {
      const response = await axiosClient.post(`/service-jobs/${id}/cancel`);
      setJob(unwrapData(response, null));
      setCancelOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Unable to cancel service job"));
      setCancelOpen(false);
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <section className="card table-state">
          <LoadingSpinner />
        </section>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="page">
        <section className="card error-text">{error}</section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{jobNumber}</h1>
          <p className="page-subtitle">Current stage, role actions, and service job records.</p>
        </div>
        <div className="page-actions">
          {job?.sale_id || job?.saleId ? (
            <Link className="btn btn-primary" to={`/sales/${firstValue(job.sale_id, job.saleId)}`}>
              <ReceiptText size={17} aria-hidden="true" />
              <span>Open Invoice</span>
            </Link>
          ) : null}
          <Link className="btn btn-secondary" to="/service-jobs">
            <ArrowLeft size={17} aria-hidden="true" />
            <span>Back to Service Jobs</span>
          </Link>
        </div>
      </div>

      {error ? <section className="card error-text">{error}</section> : null}

      <section className="card invoice-header-card">
        <div className="invoice-title">
          <div className="brand-mark">
            <Wrench size={22} aria-hidden="true" />
          </div>
          <div>
            <strong>{jobNumber}</strong>
            <span className={`badge ${meta.className}`}>{meta.label}</span>
          </div>
        </div>
        <div className="invoice-meta-grid">
          <div>
            <span>Customer</span>
            <strong>{job?.customer?.name || job?.customer_name || "-"}</strong>
          </div>
          <div>
            <span>Car</span>
            <strong>
              {job?.car ? (
                <Link className="text-link" to={`/cars/${job.car.id}`}>
                  {getCarLabel(job.car)}
                </Link>
              ) : (
                "-"
              )}
            </strong>
          </div>
          <div>
            <span>Started</span>
            <strong>{formatDate(firstValue(job?.start_date, job?.startDate))}</strong>
          </div>
          <div>
            <span>Expected Finish</span>
            <strong>{formatDate(firstValue(job?.expected_finish_date, job?.expectedFinishDate))}</strong>
          </div>
          <div>
            <span>Finished</span>
            <strong>{formatDate(firstValue(job?.finished_at, job?.finishedAt))}</strong>
          </div>
        </div>
      </section>

      <section className="grid grid-4">
        {summaryCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <nav className="page-tabs" aria-label="Service job details sections">
        {tabs.map((tab) => (
          <button
            className={`page-tab ${selectedTab === tab.id ? "page-tab-active" : ""}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {selectedTab === "workflow" ? (
        <section className="card">
        <div className="section-header">
          <div className="section-title-with-icon">
            <h2>Overview</h2>
            <Wrench size={18} aria-hidden="true" />
          </div>
          {latestEstimate ? (
            <span className="badge badge-neutral">
              {firstValue(latestEstimate.estimate_number, latestEstimate.estimateNumber, `Estimate #${latestEstimate.id}`)}
            </span>
          ) : null}
          <span className="badge badge-info">{currentWorkflowStep}</span>
        </div>

        {workflowError ? <p className="error-text table-error">{workflowError}</p> : null}

        <div className="workflow-next-actions">
          <div>
            <span className="muted-text">Current stage</span>
            <strong>{currentWorkflowStep}</strong>
          </div>
          <div>
            <span className="muted-text">Next for your role</span>
            {roleRelevantNextActions.length ? (
              <div className="workflow-action-list">
                {roleRelevantNextActions.slice(0, 3).map((action) => (
                  <span className={`badge ${action.variant === "danger" ? "badge-danger" : "badge-info"}`} key={action.key}>
                    {action.label}
                  </span>
                ))}
              </div>
            ) : (
              <strong>No action available</strong>
            )}
          </div>
        </div>

        <div className="service-stepper" aria-label="Service job workflow progress">
          {workflowStepsSource.map((step, index) => {
            const stepState =
              activeWorkflowStepIndex === -1
                ? "pending"
                : index < activeWorkflowStepIndex
                  ? "done"
                  : index === activeWorkflowStepIndex
                    ? "active"
                    : "pending";

            return (
              <div
                aria-current={stepState === "active" ? "step" : undefined}
                className={`service-step service-step-${stepState}`}
                key={step.label}
              >
                <span className="service-step-index">{index + 1}</span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>

        <div className="page-actions">
          {canManageReception && job?.status === "RECEIVED" ? (
            <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/reception/complete")} disabled={workflowSaving}>
              Send To Diagnosis
            </Button>
          ) : null}
          {canManageDiagnosis && job?.status === "AWAITING_DIAGNOSIS" ? (
            <Button icon={Wrench} onClick={() => postWorkflowAction("/diagnosis/start")} disabled={workflowSaving}>
              Start Diagnosis
            </Button>
          ) : null}
          {canManageEstimate && job?.status === "ESTIMATE_CREATED" && latestEstimate ? (
            <Button icon={FileText} onClick={() => postWorkflowAction(`/estimates/${latestEstimate.id}/send`)} disabled={workflowSaving}>
              Send For Approval
            </Button>
          ) : null}
          {canManageEstimate && job?.status === "AWAITING_APPROVAL" && latestEstimate ? (
            <>
              <Button icon={CheckCircle2} onClick={() => postWorkflowAction(`/estimates/${latestEstimate.id}/approve`, { method: "system" })} disabled={workflowSaving}>
                Approve All
              </Button>
              <Button variant="danger" icon={XCircle} onClick={() => postWorkflowAction(`/estimates/${latestEstimate.id}/reject`, { method: "system" })} disabled={workflowSaving}>
                Reject
              </Button>
            </>
          ) : null}
          {["APPROVED", "PARTIALLY_APPROVED"].includes(job?.status) ? (
            <>
              {canRequestParts ? (
                <Button variant="secondary" icon={Plus} onClick={() => postWorkflowAction("/parts/request")} disabled={workflowSaving}>
                  Request Parts
                </Button>
              ) : null}
              {canManageWork ? (
                <Button icon={Wrench} onClick={() => postWorkflowAction("/work/start")} disabled={workflowSaving}>
                  Start Work
                </Button>
              ) : null}
            </>
          ) : null}
          {canManageWork && job?.status === "WAITING_PARTS" ? (
            <Button icon={Wrench} onClick={() => postWorkflowAction("/work/start")} disabled={workflowSaving}>
              Start Work
            </Button>
          ) : null}
          {canManageWork && job?.status === "WORK_IN_PROGRESS" ? (
            <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/work/done")} disabled={workflowSaving}>
              Mark Work Done
            </Button>
          ) : null}
          {canManageQc && job?.status === "WORK_DONE" ? (
            <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/qc/start")} disabled={workflowSaving}>
              Start QC
            </Button>
          ) : null}
          {canManageInvoice && job?.status === "QC_PASSED" ? (
            <Button icon={ReceiptText} onClick={() => postWorkflowAction("/invoice/generate", {}, { navigateToSale: true })} disabled={workflowSaving}>
              Generate Invoice
            </Button>
          ) : null}
          {canManagePayment && ["INVOICED", "PAYMENT_PENDING"].includes(job?.status) ? (
            <Button icon={CreditCard} onClick={() => postWorkflowAction("/payment/sync")} disabled={workflowSaving}>
              Sync Payment
            </Button>
          ) : null}
          {canManageDelivery && job?.status === "PAID" ? (
            <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/delivery/ready")} disabled={workflowSaving}>
              Ready For Delivery
            </Button>
          ) : null}
          {canManageDelivery && job?.status === "DELIVERED" ? (
            <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/close")} disabled={workflowSaving}>
              Close Job
            </Button>
          ) : null}
        </div>

        {canManageDiagnosis && job?.status === "DIAGNOSIS_IN_PROGRESS" ? (
          <form className="form" onSubmit={submitDiagnosisReportForm}>
            <div className="form-row">
              <label className="form-field">
                <span>Diagnosis Notes</span>
                <input
                  className="input"
                  value={diagnosisForm.diagnosis_notes}
                  onChange={(event) => updateDiagnosisForm("diagnosis_notes", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Fault Codes</span>
                <input
                  className="input"
                  value={diagnosisForm.fault_codes}
                  onChange={(event) => updateDiagnosisForm("fault_codes", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-field">
                <span>Cause</span>
                <input
                  className="input"
                  value={diagnosisForm.cause}
                  onChange={(event) => updateDiagnosisForm("cause", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Recommended Work</span>
                <input
                  className="input"
                  value={diagnosisForm.recommended_work}
                  onChange={(event) => updateDiagnosisForm("recommended_work", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Diagnostic Fee</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={diagnosisForm.diagnostic_fee}
                  onChange={(event) => updateDiagnosisForm("diagnostic_fee", event.target.value)}
                />
              </label>
            </div>
            <div className="form-actions">
              <Button type="submit" icon={CheckCircle2} disabled={workflowSaving}>
                Submit Diagnosis
              </Button>
            </div>
          </form>
        ) : null}

        {canManageEstimate && job?.status === "DIAGNOSIS_DONE" ? (
          <form className="form" onSubmit={submitEstimateForm}>
            <div className="form-row">
              <label className="form-field">
                <span>Line Type</span>
                <select className="select" value={estimateForm.line_type} onChange={(event) => updateEstimateForm("line_type", event.target.value)}>
                  <option value="service">Service / Labor</option>
                  <option value="product">Part</option>
                </select>
              </label>
              {estimateForm.line_type === "product" ? (
                <SearchableSelect
                  disabled={optionsLoading}
                  emptyLabel="Select product"
                  getOptionDescription={productDescription}
                  getOptionLabel={productLabel}
                  getOptionSearchText={productSearchText}
                  label="Product"
                  onChange={changeEstimateProduct}
                  options={products}
                  placeholder="Search product, part no, category"
                  value={estimateForm.product_id}
                />
              ) : (
                <label className="form-field">
                  <span>Description</span>
                  <input
                    className="input"
                    value={estimateForm.description}
                    onChange={(event) => updateEstimateForm("description", event.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="form-row">
              <label className="form-field">
                <span>Quantity</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={estimateForm.quantity}
                  onChange={(event) => updateEstimateForm("quantity", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Unit Price</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={estimateForm.unit_price}
                  onChange={(event) => updateEstimateForm("unit_price", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Notes</span>
                <input
                  className="input"
                  value={estimateForm.notes}
                  onChange={(event) => updateEstimateForm("notes", event.target.value)}
                />
              </label>
            </div>
            <div className="form-actions">
              <Button type="submit" icon={FileText} disabled={workflowSaving || optionsLoading}>
                Create Estimate
              </Button>
            </div>
          </form>
        ) : null}

        {canManageQc && job?.status === "QC_IN_PROGRESS" ? (
          <div className="form">
            <div className="form-row">
              {[
                ["complaint_solved", "Complaint Solved"],
                ["road_test_done", "Road Test Done"],
                ["scanner_check_done", "Scanner Check Done"],
                ["leaks_checked", "Leaks Checked"],
              ].map(([name, label]) => (
                <label className="checkbox-field" key={name}>
                  <input
                    type="checkbox"
                    checked={Boolean(qcForm[name])}
                    onChange={(event) => updateQcForm(name, event.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label className="form-field">
              <span>Final Notes</span>
              <input
                className="input"
                value={qcForm.final_notes}
                onChange={(event) => updateQcForm("final_notes", event.target.value)}
              />
            </label>
            <div className="form-actions">
              <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/qc/pass", qcForm)} disabled={workflowSaving}>
                Pass QC
              </Button>
              <Button variant="danger" icon={XCircle} onClick={() => postWorkflowAction("/qc/fail", qcForm)} disabled={workflowSaving}>
                Fail QC
              </Button>
            </div>
          </div>
        ) : null}

        {canManageDelivery && job?.status === "READY_FOR_DELIVERY" ? (
          <form className="form" onSubmit={submitDeliveryForm}>
            <div className="form-row">
              <label className="form-field">
                <span>Received By</span>
                <input
                  className="input"
                  value={deliveryForm.received_by_name}
                  onChange={(event) => updateDeliveryForm("received_by_name", event.target.value)}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={deliveryForm.customer_signed}
                  onChange={(event) => updateDeliveryForm("customer_signed", event.target.checked)}
                />
                <span>Customer Signed</span>
              </label>
            </div>
            <label className="form-field">
              <span>Delivery Notes</span>
              <input
                className="input"
                value={deliveryForm.notes}
                onChange={(event) => updateDeliveryForm("notes", event.target.value)}
              />
            </label>
            <div className="form-actions">
              <Button type="submit" icon={CheckCircle2} disabled={workflowSaving}>
                Mark Delivered
              </Button>
            </div>
          </form>
        ) : null}
      </section>
      ) : null}

      {selectedTab === "reception" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <h2>Reception / Intake</h2>
              <p className="muted-text">Customer complaint and check-in inspection captured before diagnosis.</p>
            </div>
            {!canManageReception ? <span className="badge badge-neutral">Read only</span> : null}
          </div>
          {canManageReception && job?.status === "RECEIVED" ? (
            <div className="page-actions">
              <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/reception/complete")} disabled={workflowSaving}>
                Send To Diagnosis
              </Button>
            </div>
          ) : null}
          <div className="invoice-meta-grid">
            <div>
              <span>Odometer</span>
              <strong>{firstValue(latestInspection?.odometer, "-")}</strong>
            </div>
            <div>
              <span>Fuel Level</span>
              <strong>{firstValue(latestInspection?.fuel_level, latestInspection?.fuelLevel, "-")}</strong>
            </div>
            <div>
              <span>Visual Inspection</span>
              <strong>{firstValue(latestInspection?.visual_inspection, latestInspection?.visualInspection, "-")}</strong>
            </div>
            <div>
              <span>Reception Notes</span>
              <strong>{firstValue(latestInspection?.notes, job?.notes, "-")}</strong>
            </div>
          </div>
          {latestInspectionMedia.length ? (
            <div className="inspection-media-grid">
              {latestInspectionMedia.map((media, index) => {
                const url = inspectionMediaUrl(media);
                const name = inspectionMediaName(media, index);
                if (!url) return null;

                if (inspectionMediaKind(media) === "video") {
                  return (
                    <div className="inspection-media-preview" key={`${url}-${index}`}>
                      <video controls preload="metadata" src={url} />
                      <span>{name}</span>
                    </div>
                  );
                }

                return (
                  <a className="inspection-media-preview" href={url} key={`${url}-${index}`} rel="noreferrer" target="_blank">
                      <img alt={name} src={url} />
                    <span>{name}</span>
                  </a>
                );
              })}
            </div>
          ) : null}
          <div className="nested-table-block">
            <DataTable
              columns={[
                { header: "Complaint", render: (row) => firstValue(row.description, row.complaint, row.notes, "-") },
                { header: "Notes", render: (row) => row.notes || "-" },
                { header: "Created", render: (row) => formatDate(firstValue(row.created_at, row.createdAt)) },
              ]}
              data={complaints}
              emptyMessage="No complaints recorded"
            />
          </div>
        </section>
      ) : null}

      {selectedTab === "diagnosis" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <h2>Technician Diagnosis</h2>
              <p className="muted-text">Diagnosis notes, fault codes, cause, recommendation, and diagnostic fee.</p>
            </div>
            {!canManageDiagnosis ? <span className="badge badge-neutral">Read only</span> : null}
          </div>
          {canManageDiagnosis && job?.status === "RECEIVED" ? (
            <p className="muted-text">Waiting for reception to complete intake before diagnosis can start.</p>
          ) : null}
          {canManageDiagnosis && job?.status === "AWAITING_DIAGNOSIS" ? (
            <div className="page-actions">
              <Button icon={Wrench} onClick={() => postWorkflowAction("/diagnosis/start")} disabled={workflowSaving}>
                Start Diagnosis
              </Button>
            </div>
          ) : null}
          {canManageDiagnosis && job?.status === "DIAGNOSIS_IN_PROGRESS" ? (
            <form className="form" onSubmit={submitDiagnosisReportForm}>
              <div className="form-row">
                <label className="form-field">
                  <span>Diagnosis Notes</span>
                  <input className="input" value={diagnosisForm.diagnosis_notes} onChange={(event) => updateDiagnosisForm("diagnosis_notes", event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Fault Codes</span>
                  <input className="input" value={diagnosisForm.fault_codes} onChange={(event) => updateDiagnosisForm("fault_codes", event.target.value)} />
                </label>
              </div>
              <div className="form-row">
                <label className="form-field">
                  <span>Cause</span>
                  <input className="input" value={diagnosisForm.cause} onChange={(event) => updateDiagnosisForm("cause", event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Recommended Work</span>
                  <input className="input" value={diagnosisForm.recommended_work} onChange={(event) => updateDiagnosisForm("recommended_work", event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Diagnostic Fee</span>
                  <input className="input" type="number" min="0" step="0.01" value={diagnosisForm.diagnostic_fee} onChange={(event) => updateDiagnosisForm("diagnostic_fee", event.target.value)} />
                </label>
              </div>
              <div className="form-actions">
                <Button type="submit" icon={CheckCircle2} disabled={workflowSaving}>
                  Submit Diagnosis
                </Button>
              </div>
            </form>
          ) : null}
          <DataTable
            columns={[
              { header: "Date", render: (row) => formatDate(firstValue(row.created_at, row.createdAt)) },
              { header: "Technician", render: (row) => firstValue(row.technician?.name, row.creator?.name, "-") },
              { header: "Notes", render: (row) => firstValue(row.diagnosis_notes, row.diagnosisNotes, "-") },
              { header: "Fault Codes", render: (row) => firstValue(row.fault_codes, row.faultCodes, "-") },
              { header: "Cause", render: (row) => row.cause || "-" },
              { header: "Recommended Work", render: (row) => firstValue(row.recommended_work, row.recommendedWork, "-") },
              { header: "Fee", render: (row) => formatCurrency(firstValue(row.diagnostic_fee, row.diagnosticFee, 0)) },
            ]}
            data={diagnosisReports}
            emptyMessage="No diagnosis report yet"
          />
        </section>
      ) : null}

      {selectedTab === "estimate" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <h2>Estimate / Approval</h2>
              <p className="muted-text">Original quotation, supplemental extra work, and customer approval decisions.</p>
            </div>
            {!canManageEstimate ? <span className="badge badge-neutral">Read only</span> : null}
          </div>

          <div className="nested-table-block">
            <div className="section-header">
              <div>
                <h3>Base Estimate</h3>
                <p className="muted-text">Created after diagnosis and required before work can begin.</p>
              </div>
              {latestEstimate ? <span className="badge badge-neutral">{latestEstimate.status || "-"}</span> : null}
            </div>

            {latestEstimate ? (
              <div className="invoice-meta-grid">
                <div>
                  <span>Estimate</span>
                  <strong>{firstValue(latestEstimate.estimate_number, latestEstimate.estimateNumber, `Estimate #${latestEstimate.id}`)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatCurrency(firstValue(latestEstimate.total_amount, latestEstimate.totalAmount, 0))}</strong>
                </div>
                <div>
                  <span>Sent At</span>
                  <strong>{formatDate(firstValue(latestEstimate.sent_at, latestEstimate.sentAt))}</strong>
                </div>
                <div>
                  <span>Lines</span>
                  <strong>{listFrom(latestEstimate.lines ?? []).length}</strong>
                </div>
              </div>
            ) : (
              <p className="muted-text">No base estimate has been created yet.</p>
            )}

            {canManageEstimate && job?.status === "DIAGNOSIS_DONE" ? (
              <form className="form" onSubmit={submitEstimateForm}>
                <div className="form-row">
                  <label className="form-field">
                    <span>Line Type</span>
                    <select className="select" value={estimateForm.line_type} onChange={(event) => updateEstimateForm("line_type", event.target.value)}>
                      <option value="service">Service / Labor</option>
                      <option value="product">Part</option>
                    </select>
                  </label>
                  {estimateForm.line_type === "product" ? (
                    <SearchableSelect
                      disabled={optionsLoading}
                      emptyLabel="Select product"
                      getOptionDescription={productDescription}
                      getOptionLabel={productLabel}
                      getOptionSearchText={productSearchText}
                      label="Product"
                      onChange={changeEstimateProduct}
                      options={products}
                      placeholder="Search product, part no, category"
                      value={estimateForm.product_id}
                    />
                  ) : (
                    <label className="form-field">
                      <span>Description</span>
                      <input className="input" value={estimateForm.description} onChange={(event) => updateEstimateForm("description", event.target.value)} />
                    </label>
                  )}
                </div>
                <div className="form-row">
                  <label className="form-field">
                    <span>Quantity</span>
                    <input className="input" type="number" min="1" value={estimateForm.quantity} onChange={(event) => updateEstimateForm("quantity", event.target.value)} />
                  </label>
                  <label className="form-field">
                    <span>Unit Price</span>
                    <input className="input" type="number" min="0" step="0.01" value={estimateForm.unit_price} onChange={(event) => updateEstimateForm("unit_price", event.target.value)} />
                  </label>
                  <label className="form-field">
                    <span>Notes</span>
                    <input className="input" value={estimateForm.notes} onChange={(event) => updateEstimateForm("notes", event.target.value)} />
                  </label>
                </div>
                <div className="form-actions">
                  <Button type="submit" icon={FileText} disabled={workflowSaving || optionsLoading}>
                    Create Estimate
                  </Button>
                </div>
              </form>
            ) : null}

            {canManageEstimate && job?.status === "ESTIMATE_CREATED" && latestEstimate ? (
              <div className="page-actions">
                <Button icon={FileText} onClick={() => postWorkflowAction(`/estimates/${latestEstimate.id}/send`)} disabled={workflowSaving}>
                  Send For Approval
                </Button>
              </div>
            ) : null}
            {canManageEstimate && job?.status === "AWAITING_APPROVAL" && latestEstimate ? (
              <div className="page-actions">
                <Button icon={CheckCircle2} onClick={() => postWorkflowAction(`/estimates/${latestEstimate.id}/approve`, { method: "system" })} disabled={workflowSaving}>
                  Approve All
                </Button>
                <Button variant="danger" icon={XCircle} onClick={() => postWorkflowAction(`/estimates/${latestEstimate.id}/reject`, { method: "system" })} disabled={workflowSaving}>
                  Reject
                </Button>
              </div>
            ) : null}

            <DataTable columns={estimateLineColumns} data={listFrom(latestEstimate?.lines ?? [])} emptyMessage="No base estimate lines" />
          </div>

          <div className="nested-table-block">
            <div className="section-header">
              <div>
                <h3>Supplemental Estimates</h3>
                <p className="muted-text">Extra work discovered after approval. Approved supplement lines become executable work.</p>
              </div>
              {openSupplementalEstimate ? <span className="badge badge-warning">Open supplement</span> : null}
            </div>

            <DataTable
              columns={[
                { header: "Estimate", render: (row) => firstValue(row.estimate_number, row.estimateNumber, `Supplement #${row.id}`) },
                { header: "Status", render: (row) => row.status || "-" },
                { header: "Source", render: (row) => firstValue(row.source_status, row.sourceStatus, "-") },
                { header: "Total", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount, 0)) },
                { header: "Sent At", render: (row) => formatDate(firstValue(row.sent_at, row.sentAt)) },
                {
                  header: "Actions",
                  render: (row) => {
                    if (!canManageEstimate) return "-";
                    if (row.status === "draft") {
                      return (
                        <div className="table-actions">
                          <Button variant="secondary" icon={FileText} onClick={() => postWorkflowAction(`/supplemental-estimates/${row.id}/send`)} disabled={workflowSaving}>
                            Send
                          </Button>
                        </div>
                      );
                    }
                    if (row.status === "sent") {
                      return (
                        <div className="table-actions">
                          <Button icon={CheckCircle2} onClick={() => postWorkflowAction(`/supplemental-estimates/${row.id}/approve`, { method: "system" })} disabled={workflowSaving}>
                            Approve
                          </Button>
                          <Button variant="danger" icon={XCircle} onClick={() => postWorkflowAction(`/supplemental-estimates/${row.id}/reject`, { method: "system" })} disabled={workflowSaving}>
                            Reject
                          </Button>
                        </div>
                      );
                    }
                    return "-";
                  },
                },
              ]}
              data={supplementalEstimates}
              emptyMessage="No supplemental estimates"
            />

            {canCreateSupplementalEstimate ? (
              <form className="form" onSubmit={submitSupplementalEstimateForm}>
                <div className="form-row">
                  <label className="form-field">
                    <span>Line Type</span>
                    <select
                      className="select"
                      value={supplementalEstimateForm.line_type}
                      onChange={(event) => updateSupplementalEstimateForm("line_type", event.target.value)}
                    >
                      <option value="service">Service / Labor</option>
                      <option value="product">Part</option>
                    </select>
                  </label>
                  {supplementalEstimateForm.line_type === "product" ? (
                    <SearchableSelect
                      disabled={optionsLoading}
                      emptyLabel="Select product"
                      getOptionDescription={productDescription}
                      getOptionLabel={productLabel}
                      getOptionSearchText={productSearchText}
                      label="Product"
                      onChange={changeSupplementalEstimateProduct}
                      options={products}
                      placeholder="Search product, part no, category"
                      value={supplementalEstimateForm.product_id}
                    />
                  ) : (
                    <label className="form-field">
                      <span>Description</span>
                      <input
                        className="input"
                        value={supplementalEstimateForm.description}
                        onChange={(event) => updateSupplementalEstimateForm("description", event.target.value)}
                      />
                    </label>
                  )}
                </div>
                <div className="form-row">
                  <label className="form-field">
                    <span>Quantity</span>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={supplementalEstimateForm.quantity}
                      onChange={(event) => updateSupplementalEstimateForm("quantity", event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Unit Price</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={supplementalEstimateForm.unit_price}
                      onChange={(event) => updateSupplementalEstimateForm("unit_price", event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Notes</span>
                    <input
                      className="input"
                      value={supplementalEstimateForm.notes}
                      onChange={(event) => updateSupplementalEstimateForm("notes", event.target.value)}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <Button type="submit" icon={FileText} disabled={workflowSaving || optionsLoading}>
                    Create Supplemental Estimate
                  </Button>
                </div>
              </form>
            ) : null}

            {canManageEstimate && openSupplementalEstimate ? (
              <p className="muted-text">Finish the open supplemental estimate before creating another one.</p>
            ) : null}
          </div>

          {latestSupplementalEstimate ? (
            <div className="nested-table-block">
              <div className="section-header">
                <div>
                  <h3>Latest Supplemental Lines</h3>
                  <p className="muted-text">
                    {firstValue(latestSupplementalEstimate.estimate_number, latestSupplementalEstimate.estimateNumber, `Supplement #${latestSupplementalEstimate.id}`)}
                  </p>
                </div>
                <span className="badge badge-neutral">{latestSupplementalEstimate.status || "-"}</span>
              </div>
              <DataTable columns={estimateLineColumns} data={listFrom(latestSupplementalEstimate.lines ?? [])} emptyMessage="No supplemental lines" />
            </div>
          ) : null}

          <div className="nested-table-block">
            <div className="section-header">
              <div>
                <h3>Approval History</h3>
                <p className="muted-text">Base and supplemental customer decisions.</p>
              </div>
            </div>
            <DataTable
              columns={[
                { header: "Status", render: (row) => row.status || "-" },
                { header: "Method", render: (row) => row.method || "-" },
                { header: "Approved By", render: (row) => firstValue(row.approved_by, row.approvedBy, "-") },
                { header: "Approved At", render: (row) => formatDate(firstValue(row.approved_at, row.approvedAt)) },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={approvals}
              emptyMessage="No approval decision yet"
            />
          </div>
        </section>
      ) : null}

      {selectedTab === "lines" && canEdit ? (
        <section className="card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <h2>Add Part</h2>
              <Plus size={18} aria-hidden="true" />
            </div>
          </div>
          <form className="form" onSubmit={submitItem}>
            {itemError ? <p className="error-text">{itemError}</p> : null}
            <div className="item-row service-job-entry-row">
              <SearchableSelect
                disabled={optionsLoading}
                emptyLabel="Select product"
                getOptionDescription={productDescription}
                getOptionLabel={productLabel}
                getOptionSearchText={productSearchText}
                label="Product"
                onChange={changeProduct}
                options={products}
                placeholder="Search product, part no, category"
                value={itemForm.product_id}
              />
              <label className="form-field">
                <span>Quantity</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={itemForm.quantity}
                  onChange={(event) => updateItemForm("quantity", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Selling Price</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.unit_price}
                  onChange={(event) => updateItemForm("unit_price", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Notes</span>
                <input
                  className="input"
                  value={itemForm.notes}
                  onChange={(event) => updateItemForm("notes", event.target.value)}
                />
              </label>
              <Button type="submit" icon={Plus} disabled={savingItem || optionsLoading}>
                Add
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedTab === "lines" && canEdit ? (
        <section className="card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <h2>Add Service / Labor</h2>
              <Wrench size={18} aria-hidden="true" />
            </div>
          </div>
          <form className="form" onSubmit={submitService}>
            {serviceError ? <p className="error-text">{serviceError}</p> : null}
            <div className="item-row service-job-entry-row">
              <label className="form-field">
                <span>Service</span>
                <input
                  className="input"
                  value={serviceForm.description}
                  onChange={(event) => updateServiceForm("description", event.target.value)}
                  placeholder="Oil change labor, inspection, diagnosis"
                />
              </label>
              <label className="form-field">
                <span>Quantity</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={serviceForm.quantity}
                  onChange={(event) => updateServiceForm("quantity", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Price</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.unit_price}
                  onChange={(event) => updateServiceForm("unit_price", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Notes</span>
                <input
                  className="input"
                  value={serviceForm.notes}
                  onChange={(event) => updateServiceForm("notes", event.target.value)}
                />
              </label>
              <Button type="submit" icon={Plus} disabled={savingService}>
                Add
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedTab === "lines" ? (
        <section className="card">
        <div className="section-header">
          <h2>Used Parts</h2>
          <span className="badge badge-neutral">{items.length} entries</span>
        </div>
        {!canEdit && itemError ? <p className="error-text table-error">{itemError}</p> : null}
        <DataTable
          columns={[
            {
              header: "Type",
              render: (row) =>
                firstValue(row.line_type, row.lineType, "product") === "service" ? "Service" : "Product",
            },
            { header: "Item", render: (row) => firstValue(row.product_name, row.product?.name, row.description, "-") },
            { header: "Part Number", render: (row) => firstValue(row.product_sku, row.product?.sku, "-") },
            { header: "Quantity", render: (row) => row.quantity },
            { header: "Price", render: (row) => formatCurrency(firstValue(row.unit_price, row.unitPrice, 0)) },
            { header: "Subtotal", render: (row) => formatCurrency(firstValue(row.line_total, row.lineTotal, 0)) },
            { header: "Notes", render: (row) => row.notes || "-" },
            {
              header: "Actions",
              render: (row) =>
                canEdit ? (
                  <button className="icon-button" type="button" onClick={() => removeItem(row.id)} aria-label="Remove part">
                    <Trash2 size={16} />
                  </button>
                ) : (
                  "-"
                ),
            },
          ]}
          data={items}
          emptyMessage="No parts added yet"
        />
      </section>
      ) : null}

      {selectedTab === "work" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <h2>Work Execution</h2>
              <p className="muted-text">Approved executable lines and technician work orders.</p>
            </div>
            {!canManageWork ? <span className="badge badge-neutral">Read only</span> : null}
          </div>
          <div className="page-actions">
            {canManageWork && ["APPROVED", "PARTIALLY_APPROVED", "WAITING_PARTS"].includes(job?.status) ? (
              <Button icon={Wrench} onClick={() => postWorkflowAction("/work/start")} disabled={workflowSaving}>
                Start Work
              </Button>
            ) : null}
            {canManageWork && job?.status === "WORK_IN_PROGRESS" ? (
              <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/work/done")} disabled={workflowSaving}>
                Mark Work Done
              </Button>
            ) : null}
          </div>
          <DataTable
            columns={[
              { header: "Type", render: (row) => firstValue(row.line_type, row.lineType, "product") },
              { header: "Item", render: (row) => firstValue(row.product_name, row.product?.name, row.description, "-") },
              { header: "Approved Qty", render: (row) => firstValue(row.approved_quantity, row.approvedQuantity, row.quantity, 0) },
              { header: "Issued Qty", render: (row) => firstValue(row.issued_quantity, row.issuedQuantity, 0) },
              { header: "Work Status", render: (row) => firstValue(row.work_status, row.workStatus, "-") },
              { header: "Completed", render: (row) => formatDate(firstValue(row.completed_at, row.completedAt)) },
            ]}
            data={items}
            emptyMessage="No approved work lines yet"
          />
          <div className="nested-table-block">
            <DataTable
              columns={[
                { header: "Status", render: (row) => row.status || "-" },
                { header: "Started", render: (row) => formatDate(firstValue(row.started_at, row.startedAt)) },
                { header: "Completed", render: (row) => formatDate(firstValue(row.completed_at, row.completedAt)) },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={workOrders}
              emptyMessage="No work orders yet"
            />
          </div>
        </section>
      ) : null}

      {selectedTab === "parts" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <h2>Part Requests</h2>
              <p className="muted-text">Requested, reserved, issued, unavailable, and returned parts.</p>
            </div>
            {!canManageParts && !canRequestParts ? <span className="badge badge-neutral">Read only</span> : <span className="badge badge-neutral">{partRequests.length} requests</span>}
          </div>
          {canRequestParts && ["APPROVED", "PARTIALLY_APPROVED"].includes(job?.status) ? (
            <div className="page-actions">
              <Button variant="secondary" icon={Plus} onClick={() => postWorkflowAction("/parts/request")} disabled={workflowSaving}>
                Request Parts
              </Button>
            </div>
          ) : null}
          <DataTable
            columns={[
              { header: "Part", render: (row) => firstValue(row.product_name, row.product?.name, "-") },
              { header: "Requested", render: (row) => firstValue(row.requested_quantity, row.requestedQuantity, 0) },
              { header: "Reserved", render: (row) => firstValue(row.reserved_quantity, row.reservedQuantity, 0) },
              { header: "Issued", render: (row) => firstValue(row.issued_quantity, row.issuedQuantity, 0) },
              { header: "Returned", render: (row) => firstValue(row.returned_quantity, row.returnedQuantity, 0) },
              { header: "Status", render: (row) => row.status },
              {
                header: "Actions",
                render: (row) =>
                  canManageParts ? (
                  <div className="table-actions">
                    <button className="btn btn-secondary btn-small" type="button" onClick={() => postWorkflowAction(`/parts/${row.id}/reserve`)} disabled={workflowSaving}>
                      Reserve
                    </button>
                    <button className="btn btn-primary btn-small" type="button" onClick={() => postWorkflowAction(`/parts/${row.id}/issue`)} disabled={workflowSaving}>
                      Issue
                    </button>
                    <button className="btn btn-secondary btn-small" type="button" onClick={() => postWorkflowAction(`/parts/${row.id}/return`)} disabled={workflowSaving}>
                      Return
                    </button>
                  </div>
                  ) : (
                    "-"
                  ),
              },
            ]}
            data={partRequests}
            emptyMessage="No part requests"
          />
        </section>
      ) : null}

      {selectedTab === "qc" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <h2>Quality Control</h2>
              <p className="muted-text">QC checklist, pass/fail outcome, and rework notes.</p>
            </div>
            {!canManageQc ? <span className="badge badge-neutral">Read only</span> : null}
          </div>
          {canManageQc && job?.status === "WORK_DONE" ? (
            <div className="page-actions">
              <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/qc/start")} disabled={workflowSaving}>
                Start QC
              </Button>
            </div>
          ) : null}
          {canManageQc && job?.status === "QC_IN_PROGRESS" ? (
            <div className="form">
              <div className="form-row">
                {[
                  ["complaint_solved", "Complaint Solved"],
                  ["road_test_done", "Road Test Done"],
                  ["scanner_check_done", "Scanner Check Done"],
                  ["leaks_checked", "Leaks Checked"],
                ].map(([name, label]) => (
                  <label className="checkbox-field" key={name}>
                    <input type="checkbox" checked={Boolean(qcForm[name])} onChange={(event) => updateQcForm(name, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <label className="form-field">
                <span>Final Notes</span>
                <input className="input" value={qcForm.final_notes} onChange={(event) => updateQcForm("final_notes", event.target.value)} />
              </label>
              <div className="form-actions">
                <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/qc/pass", qcForm)} disabled={workflowSaving}>
                  Pass QC
                </Button>
                <Button variant="danger" icon={XCircle} onClick={() => postWorkflowAction("/qc/fail", qcForm)} disabled={workflowSaving}>
                  Fail QC
                </Button>
              </div>
            </div>
          ) : null}
          <DataTable
            columns={[
              { header: "Date", render: (row) => formatDate(firstValue(row.created_at, row.createdAt)) },
              { header: "Complaint Solved", render: (row) => yesNo(firstValue(row.complaint_solved, row.complaintSolved, false)) },
              { header: "Road Test", render: (row) => yesNo(firstValue(row.road_test_done, row.roadTestDone, false)) },
              { header: "Scanner", render: (row) => yesNo(firstValue(row.scanner_check_done, row.scannerCheckDone, false)) },
              { header: "Leaks", render: (row) => yesNo(firstValue(row.leaks_checked, row.leaksChecked, false)) },
              { header: "Notes", render: (row) => firstValue(row.final_notes, row.finalNotes, "-") },
            ]}
            data={qcReports}
            emptyMessage="No QC report yet"
          />
        </section>
      ) : null}

      {selectedTab === "payments" ? (
        <section className="card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <h2>Payment Basis</h2>
              <CreditCard size={18} aria-hidden="true" />
            </div>
          </div>
          <div className="payment-basis-grid">
            <div>
              <span>Approved Job Value</span>
              <strong>{formatCurrency(approvedJobTotal)}</strong>
            </div>
            <div>
              <span>Advances Recorded</span>
              <strong>{formatCurrency(advancePaidAmount)}</strong>
            </div>
            <div>
              <span>Advance Cap Remaining</span>
              <strong>{formatCurrency(advanceRemainingAmount)}</strong>
            </div>
          </div>
          <p className="muted-text">{paymentGuidance}</p>
          {canManagePayment && ["INVOICED", "PAYMENT_PENDING"].includes(job?.status) ? (
            <div className="page-actions">
              <Button icon={CreditCard} onClick={() => postWorkflowAction("/payment/sync")} disabled={workflowSaving}>
                Sync Payment
              </Button>
            </div>
          ) : null}
          {paymentError ? <p className="error-text">{paymentError}</p> : null}
          {canRecordAdvance ? (
            <form className="form" onSubmit={submitPayment}>
              <PaymentSplitInput
                payments={paymentRows}
                onChange={setPaymentRows}
                maxAmount={advanceRemainingAmount}
                title="Advance Split"
                showNotes
              />
              <div className="form-actions">
                <Button type="submit" icon={CreditCard} disabled={savingPayment}>
                  {savingPayment ? "Saving" : "Record Advance"}
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {selectedTab === "payments" ? (
        <section className="card">
        <div className="section-header">
          <h2>Payment History</h2>
          <span className="badge badge-neutral">{payments.length} entries</span>
        </div>
        <DataTable
          columns={[
            { header: "Date", render: (row) => formatDate(firstValue(row.payment_date, row.paymentDate)) },
            { header: "Amount", render: (row) => formatCurrency(row.amount) },
            { header: "Method", render: (row) => firstValue(row.payment_method, row.paymentMethod, "-") },
            { header: "Notes", render: (row) => row.notes || "-" },
          ]}
          data={payments}
          emptyMessage="No payments recorded yet"
        />
      </section>
      ) : null}

      {selectedTab === "history" ? (
      <section className="card">
        <div className="section-header">
          <h2>Service Job History</h2>
          <span className="badge badge-neutral">{histories.length} events</span>
        </div>
        <DataTable
          columns={[
            { header: "Time", render: (row) => formatDate(firstValue(row.created_at, row.createdAt)) },
            { header: "Action", render: (row) => row.action },
            {
              header: "Status",
              render: (row) =>
                [firstValue(row.from_status, row.fromStatus, "-"), firstValue(row.to_status, row.toStatus, "-")].join(" -> "),
            },
            { header: "By", render: (row) => firstValue(row.performer?.name, row.performed_by, row.performedBy, "-") },
            { header: "Note", render: (row) => row.note || "-" },
          ]}
          data={histories}
          emptyMessage="No history events yet"
        />
      </section>
      ) : null}

      {selectedTab === "invoice" ? (
        <section className="card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <h2>Invoice</h2>
              <CheckCircle2 size={18} aria-hidden="true" />
            </div>
          </div>
          {finalizeError ? <p className="error-text table-error">{finalizeError}</p> : null}
          {!canFinalize ? (
            <p className="muted-text">
              Invoice generation becomes available after QC passes and the job has approved executable lines.
            </p>
          ) : null}
          {canCancelJob ? (
            <div className="page-actions">
              <Button variant="danger" icon={XCircle} onClick={() => setCancelOpen(true)} disabled={savingStatus}>
                Cancel Job
              </Button>
            </div>
          ) : null}
          {canFinalize ? (
          <form className="form" onSubmit={submitFinalize}>
            <label className="form-field">
              <span>Invoice Notes</span>
              <input
                className="input"
                value={finalizeForm.notes}
                onChange={(event) => updateFinalizeForm("notes", event.target.value)}
              />
            </label>
            <div className="form-actions">
              <Button type="submit" icon={ReceiptText} disabled={!canFinalize || finalizing}>
                {finalizing ? "Creating Invoice" : "Create Final Sale Invoice"}
              </Button>
            </div>
          </form>
          ) : null}
        </section>
      ) : null}

      {selectedTab === "delivery" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <h2>Delivery Handover</h2>
              <p className="muted-text">Vehicle handover and final close after payment rules are satisfied.</p>
            </div>
            {!canManageDelivery ? <span className="badge badge-neutral">Read only</span> : null}
          </div>
          <div className="invoice-meta-grid">
            <div>
              <span>Delivered By</span>
              <strong>{firstValue(latestDeliveryHandover?.delivered_by, latestDeliveryHandover?.deliveredBy, "-")}</strong>
            </div>
            <div>
              <span>Received By</span>
              <strong>{firstValue(latestDeliveryHandover?.received_by_name, latestDeliveryHandover?.receivedByName, "-")}</strong>
            </div>
            <div>
              <span>Customer Signed</span>
              <strong>{latestDeliveryHandover ? yesNo(firstValue(latestDeliveryHandover.customer_signed, latestDeliveryHandover.customerSigned, false)) : "-"}</strong>
            </div>
            <div>
              <span>Delivered At</span>
              <strong>{formatDate(firstValue(latestDeliveryHandover?.delivered_at, latestDeliveryHandover?.deliveredAt))}</strong>
            </div>
          </div>
          {canManageDelivery && job?.status === "PAID" ? (
            <div className="page-actions">
              <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/delivery/ready")} disabled={workflowSaving}>
                Ready For Delivery
              </Button>
            </div>
          ) : null}
          {canManageDelivery && job?.status === "READY_FOR_DELIVERY" ? (
            <form className="form" onSubmit={submitDeliveryForm}>
              <div className="form-row">
                <label className="form-field">
                  <span>Received By</span>
                  <input className="input" value={deliveryForm.received_by_name} onChange={(event) => updateDeliveryForm("received_by_name", event.target.value)} />
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={deliveryForm.customer_signed} onChange={(event) => updateDeliveryForm("customer_signed", event.target.checked)} />
                  <span>Customer Signed</span>
                </label>
              </div>
              <label className="form-field">
                <span>Delivery Notes</span>
                <input className="input" value={deliveryForm.notes} onChange={(event) => updateDeliveryForm("notes", event.target.value)} />
              </label>
              <div className="form-actions">
                <Button type="submit" icon={CheckCircle2} disabled={workflowSaving}>
                  Mark Delivered
                </Button>
              </div>
            </form>
          ) : null}
          {canManageDelivery && job?.status === "DELIVERED" ? (
            <div className="page-actions">
              <Button icon={CheckCircle2} onClick={() => postWorkflowAction("/close")} disabled={workflowSaving}>
                Close Job
              </Button>
            </div>
          ) : null}
          <div className="nested-table-block">
            <DataTable
              columns={[
                { header: "Delivered At", render: (row) => formatDate(firstValue(row.delivered_at, row.deliveredAt)) },
                { header: "Received By", render: (row) => firstValue(row.received_by_name, row.receivedByName, "-") },
                { header: "Signed", render: (row) => yesNo(firstValue(row.customer_signed, row.customerSigned, false)) },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={deliveryHandovers}
              emptyMessage="No delivery handover yet"
            />
          </div>
        </section>
      ) : null}

      <ConfirmModal
        isOpen={cancelOpen}
        title="Cancel service job"
        message="Cancel this service job and return all reserved parts to stock?"
        onConfirm={cancelJob}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
};

export default ServiceJobDetails;
