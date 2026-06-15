import { CalendarDays, Eye, Plus, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import SearchInput from "../components/SearchInput";
import SearchableSelect from "../components/SearchableSelect";
import StatCard from "../components/StatCard";
import TablePagination from "../components/TablePagination";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue, getCarLabel } from "../utils/fields";
import { canAccessPermission } from "../utils/permissions";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import { getUser } from "../utils/storage";

const initialForm = {
  customer_id: "",
  car_id: "",
  odometer: "",
  fuel_level: "",
  expected_finish_date: "",
  complaint: "",
  visual_inspection: "",
  notes: "",
};

const fallbackStatusMeta = {
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

const fallbackStages = [
  { key: "intake", label: "Intake" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "estimate", label: "Estimate & Approval" },
  { key: "parts_work", label: "Parts & Work" },
  { key: "qc", label: "QC" },
  { key: "invoice_payment", label: "Invoice & Payment" },
  { key: "delivery", label: "Delivery" },
  { key: "stopped", label: "Stopped" },
];

const emptyPagination = {
  total: 0,
  limit: 50,
  offset: 0,
  page: 1,
  page_count: 1,
  has_previous: false,
  has_next: false,
};

const defaultSummary = {
  active_count: 0,
  total_amount: 0,
  paid_amount: 0,
  remaining_amount: 0,
};

const pageSizeOptions = [25, 50, 100];
const maxInspectionFiles = 10;
const maxInspectionFileSize = 50 * 1024 * 1024;

const formatFileSize = (size) => {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
};

const customerDescription = (customer) => [customer?.phone, customer?.email].filter(Boolean).join(" / ");
const customerSearchText = (customer) =>
  [customer?.name, customer?.phone, customer?.email].filter(Boolean).join(" ");

const carDescription = (car) => {
  const owner = firstValue(car?.customer?.name, car?.customer_name, "");
  const vin = firstValue(car?.vin, "");

  return [owner ? `Owner: ${owner}` : "", vin ? `VIN: ${vin}` : ""].filter(Boolean).join(" / ");
};

const carSearchText = (car) =>
  [
    getCarLabel(car, ""),
    firstValue(car?.plate_number, car?.plateNumber, ""),
    car?.make,
    car?.model,
    car?.year,
    car?.color,
    car?.vin,
    firstValue(car?.customer?.name, car?.customer_name, ""),
  ]
    .filter(Boolean)
    .join(" ");

const ServiceJobs = () => {
  const navigate = useNavigate();
  const currentUser = getUser();
  const canCreateServiceJob = canAccessPermission(currentUser, "service.reception.write");
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cars, setCars] = useState([]);
  const [workflowMeta, setWorkflowMeta] = useState({ stages: fallbackStages, status_meta: fallbackStatusMeta, statuses: [] });
  const [pagination, setPagination] = useState(emptyPagination);
  const [summary, setSummary] = useState(defaultSummary);
  const [form, setForm] = useState(initialForm);
  const [inspectionFiles, setInspectionFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("");
  const [activeFilter, setActiveFilter] = useState("true");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [customerQuery, setCustomerQuery] = useState("");
  const [carQuery, setCarQuery] = useState("");
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [carLookupLoading, setCarLookupLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [activeJobConflict, setActiveJobConflict] = useState(null);

  const statusMeta = workflowMeta.status_meta || fallbackStatusMeta;
  const stageOptions = workflowMeta.stages?.length ? workflowMeta.stages : fallbackStages;
  const statusOptions = workflowMeta.statuses?.length
    ? workflowMeta.statuses.map((entry) => ({ value: entry.status, label: entry.label || entry.status }))
    : Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label || value }));

  useEffect(() => {
    const loadWorkflowMeta = async () => {
      try {
        const response = await axiosClient.get("/service-jobs/workflow/meta");
        const data = unwrapData(response, null);
        if (data) setWorkflowMeta(data);
      } catch {
        setWorkflowMeta({ stages: fallbackStages, status_meta: fallbackStatusMeta, statuses: [] });
      }
    };

    loadWorkflowMeta();
  }, []);

  useEffect(() => {
    if (!canCreateServiceJob) return;
    const query = customerQuery.trim();

    setCustomerLookupLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await axiosClient.get("/service-jobs/reception/customers", {
          params: { search: query },
        });
        setCustomers(listFrom(unwrapData(response, [])));
      } catch (err) {
        setFormError(errorMessage(err, "Unable to search customers"));
      } finally {
        setCustomerLookupLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [canCreateServiceJob, customerQuery]);

  useEffect(() => {
    if (!canCreateServiceJob) return;
    const query = carQuery.trim();

    setCarLookupLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await axiosClient.get("/service-jobs/reception/cars", {
          params: {
            search: query || undefined,
            customer_id: form.customer_id || undefined,
          },
        });
        setCars(listFrom(unwrapData(response, [])));
      } catch (err) {
        setFormError(errorMessage(err, "Unable to search cars"));
      } finally {
        setCarLookupLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [canCreateServiceJob, carQuery, form.customer_id]);

  useEffect(() => {
    const loadJobs = async () => {
      setLoading(true);
      setError("");

      try {
        const query = search.trim();
        const response = await axiosClient.get("/service-jobs", {
          params: {
            search: query || undefined,
            stage: stage || undefined,
            status: status || undefined,
            active: activeFilter || undefined,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          },
        });
        const data = unwrapData(response, {});
        const nextPagination = {
          ...emptyPagination,
          limit: pageSize,
          ...data?.pagination,
        };

        setJobs(listFrom(data));
        setSummary({ ...defaultSummary, ...(data?.summary || {}) });
        setPagination(nextPagination);
        if (data?.meta) setWorkflowMeta(data.meta);

        if (nextPagination.page_count && page > nextPagination.page_count) {
          setPage(nextPagination.page_count);
        }
      } catch (err) {
        setError(errorMessage(err, "Unable to load service jobs"));
      } finally {
        setLoading(false);
      }
    };

    const timer = window.setTimeout(loadJobs, 220);
    return () => window.clearTimeout(timer);
  }, [activeFilter, page, pageSize, search, stage, status]);

  const carOptions = cars.filter((car) => {
    const ownerId = car.customerId || car.customer_id || car.customer?.id;
    if (!form.customer_id) return true;
    return !ownerId || String(ownerId) === String(form.customer_id);
  });

  const summaryCards = useMemo(
    () => [
      { title: "Active Jobs", value: summary.active_count || 0, icon: Wrench, tone: "warning" },
      { title: "Job Value", value: formatCurrency(summary.total_amount || 0), icon: CalendarDays, tone: "success" },
      { title: "Paid", value: formatCurrency(summary.paid_amount || 0), icon: CalendarDays, tone: "info" },
      { title: "Remaining", value: formatCurrency(summary.remaining_amount || 0), icon: CalendarDays, tone: "neutral" },
    ],
    [summary],
  );

  const totalJobs = Number(pagination.total || 0);
  const pageCount = Math.max(Number(pagination.page_count || 1), 1);
  const firstItem = totalJobs ? Number(pagination.offset || 0) + 1 : 0;
  const lastItem = Math.min(Number(pagination.offset || 0) + jobs.length, totalJobs);

  const setFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const updateForm = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const changeInspectionFiles = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) return;
    if (files.length > maxInspectionFiles) {
      setFormError(`Attach up to ${maxInspectionFiles} inspection files`);
      return;
    }

    const invalidType = files.find((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"));
    if (invalidType) {
      setFormError("Inspection attachments must be photos or videos");
      return;
    }

    const oversized = files.find((file) => file.size > maxInspectionFileSize);
    if (oversized) {
      setFormError(`Each inspection photo or video must be 50 MB or smaller. ${oversized.name} is ${formatFileSize(oversized.size)}.`);
      return;
    }

    setFormError("");
    setInspectionFiles(files);
  };

  const removeInspectionFile = (index) => {
    setInspectionFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };

  const changeCustomer = (value, customer = null) => {
    setActiveJobConflict(null);
    setForm((current) => ({ ...current, customer_id: value, car_id: "" }));
    if (customer && !customers.some((entry) => String(entry.id) === String(customer.id))) {
      setCustomers((current) => [customer, ...current]);
    }
  };

  const checkActiveJobForCar = async (car) => {
    const plateNumber = firstValue(car?.plate_number, car?.plateNumber, "");
    const vin = firstValue(car?.vin, "");
    if (!plateNumber && !vin) return;

    try {
      const response = await axiosClient.get("/service-jobs/reception/active-job", {
        params: {
          plate_number: plateNumber || undefined,
          vin: vin || undefined,
        },
      });
      setActiveJobConflict(unwrapData(response, null));
    } catch {
      setActiveJobConflict(null);
    }
  };

  const changeCar = (value, car) => {
    setActiveJobConflict(null);
    const carCustomer = car?.customer;
    setForm((current) => ({
      ...current,
      car_id: value,
      customer_id: car?.customerId || car?.customer_id || carCustomer?.id || current.customer_id,
    }));
    if (carCustomer && !customers.some((entry) => String(entry.id) === String(carCustomer.id))) {
      setCustomers((current) => [carCustomer, ...current]);
    }
    if (car) checkActiveJobForCar(car);
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.customer_id) {
      setFormError("Choose a customer");
      return;
    }

    if (!form.car_id) {
      setFormError("Choose a car");
      return;
    }

    setSaving(true);
    setFormError("");
    setActiveJobConflict(null);

    try {
      const payload = {
        customer_id: Number(form.customer_id),
        car_id: Number(form.car_id),
        odometer: form.odometer === "" ? null : Number(form.odometer),
        fuel_level: form.fuel_level || null,
        expected_finish_date: form.expected_finish_date || null,
        complaint: form.complaint || null,
        visual_inspection: form.visual_inspection || null,
        notes: form.notes || null,
      };

      const requestBody = inspectionFiles.length ? new FormData() : payload;
      if (inspectionFiles.length) {
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            requestBody.append(key, String(value));
          }
        });
        inspectionFiles.forEach((file) => requestBody.append("inspection_media", file));
      }

      const response = await axiosClient.post("/service-jobs", requestBody);
      const job = unwrapData(response, {});
      navigate(`/service-jobs/${job.id}`);
    } catch (err) {
      const details = err?.response?.data?.details;
      if (details?.active_job_id) {
        setActiveJobConflict({
          id: details.active_job_id,
          job_number: details.active_job_number,
          jobNumber: details.active_job_number,
          status: details.active_job_status,
        });
      }
      setFormError(errorMessage(err, "Unable to create service job"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Service Jobs</h1>
          <p className="page-subtitle">Department queues for service intake, diagnosis, parts, work, QC, invoice, and delivery.</p>
        </div>
      </div>

      <section className="grid grid-4">
        {summaryCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      {canCreateServiceJob ? (
        <section className="card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <h2>Create Service Job</h2>
              <Wrench size={18} aria-hidden="true" />
            </div>
          </div>

          <form className="form" onSubmit={submit}>
            {formError ? <p className="error-text">{formError}</p> : null}
            {activeJobConflict ? (
              <div className="active-job-warning">
                <div>
                  <strong>Active service job found</strong>
                  <p className="muted-text">
                    {firstValue(activeJobConflict.job_number, activeJobConflict.jobNumber, `Job #${activeJobConflict.id}`)} is currently{" "}
                    {activeJobConflict.status || "active"}. Close, deliver, cancel, or reject that job before creating another one for this car.
                  </p>
                </div>
                <Link className="btn btn-secondary btn-small" to={`/service-jobs/${activeJobConflict.id}`}>
                  Open Active Job
                </Link>
              </div>
            ) : null}
            <div className="form-row">
              <SearchableSelect
                emptyLabel="Select customer"
                getOptionDescription={customerDescription}
                getOptionLabel={(customer) => customer.name}
                getOptionSearchText={customerSearchText}
                label="Customer"
                noOptionsMessage={customerLookupLoading ? "Loading customers..." : "No matching customers"}
                onChange={changeCustomer}
                onSearchChange={setCustomerQuery}
                options={customers}
                placeholder="Search customer name or phone"
                value={form.customer_id}
              />
              <SearchableSelect
                emptyLabel="Select car"
                getOptionDescription={carDescription}
                getOptionLabel={(car) => getCarLabel(car)}
                getOptionSearchText={carSearchText}
                label="Car"
                noOptionsMessage={carLookupLoading ? "Loading cars..." : "No matching cars"}
                onChange={changeCar}
                onSearchChange={setCarQuery}
                options={carOptions}
                placeholder="Search plate, VIN, make, model"
                value={form.car_id}
              />
            </div>
            <div className="form-row">
              <label className="form-field">
                <span>Odometer</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form.odometer}
                  onChange={(event) => updateForm("odometer", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Fuel Level</span>
                <input
                  className="input"
                  value={form.fuel_level}
                  onChange={(event) => updateForm("fuel_level", event.target.value)}
                  placeholder="Full, 1/2, 1/4"
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-field">
                <span>Expected Finish</span>
                <input
                  className="input"
                  type="date"
                  value={form.expected_finish_date}
                  onChange={(event) => updateForm("expected_finish_date", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Customer Complaint</span>
                <input
                  className="input"
                  value={form.complaint}
                  onChange={(event) => updateForm("complaint", event.target.value)}
                  placeholder="Noise, warning light, overheating"
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-field">
                <span>Visual Inspection</span>
                <input
                  className="input"
                  value={form.visual_inspection}
                  onChange={(event) => updateForm("visual_inspection", event.target.value)}
                  placeholder="Body marks, missing trim, dashboard lights"
                />
              </label>
              <label className="form-field">
                <span>Notes</span>
                <input
                  className="input"
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                />
              </label>
            </div>
            <label className="form-field">
              <span>Inspection Photos / Videos</span>
              <input
                accept="image/*,video/*"
                className="input"
                multiple
                onChange={changeInspectionFiles}
                type="file"
              />
            </label>
            {inspectionFiles.length ? (
              <div className="inspection-media-list">
                {inspectionFiles.map((file, index) => (
                  <div className="inspection-media-file" key={`${file.name}-${file.size}-${index}`}>
                    <div>
                      <strong>{file.name}</strong>
                      <span>{file.type.startsWith("video/") ? "Video" : "Photo"} / {formatFileSize(file.size)}</span>
                    </div>
                    <button
                      aria-label={`Remove ${file.name}`}
                      className="icon-button"
                      onClick={() => removeInspectionFile(index)}
                      type="button"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="form-actions">
              <Button type="submit" icon={Plus} disabled={saving || Boolean(activeJobConflict)}>
                {saving ? "Creating" : "Create Service Job"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card">
        <div className="toolbar">
          <div className="filters">
            <SearchInput value={search} onChange={setFilter(setSearch)} placeholder="Search jobs, customers, cars" />
            <select className="select filter-select" value={stage} onChange={(event) => setFilter(setStage)(event.target.value)}>
              <option value="">All stages</option>
              {stageOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="select filter-select" value={status} onChange={(event) => setFilter(setStatus)(event.target.value)}>
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="select filter-select" value={activeFilter} onChange={(event) => setFilter(setActiveFilter)(event.target.value)}>
              <option value="true">Active jobs</option>
              <option value="">All jobs</option>
              <option value="false">Stopped/completed</option>
            </select>
            <select className="select filter-select" value={pageSize} onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}>
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} rows
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <p className="error-text table-error">{error}</p> : null}

        <DataTable
          loading={loading}
          columns={[
            { header: "Job", render: (row) => firstValue(row.job_number, row.jobNumber, `Job #${row.id}`) },
            {
              header: "Stage",
              render: (row) => <span className="badge badge-neutral">{firstValue(row.stage_label, row.stage?.label, "-")}</span>,
            },
            {
              header: "Status",
              render: (row) => {
                const meta = statusMeta[row.status] || fallbackStatusMeta.RECEIVED;
                return <span className={`badge ${meta.className}`}>{meta.label}</span>;
              },
            },
            { header: "Customer", render: (row) => row.customer?.name || row.customer_name || "-" },
            { header: "Car", render: (row) => getCarLabel(row.car) },
            { header: "Remaining", render: (row) => formatCurrency(firstValue(row.remaining_amount, row.remainingAmount, 0)) },
            {
              header: "Next",
              render: (row) => firstValue(row.next_actions?.[0]?.label, row.nextActions?.[0]?.label, "-"),
            },
            { header: "Opened", render: (row) => formatDate(firstValue(row.opened_at, row.openedAt, row.start_date, row.startDate)) },
            {
              header: "Actions",
              render: (row) => (
                <Link className="btn btn-secondary btn-small" to={`/service-jobs/${row.id}`}>
                  <Eye size={15} aria-hidden="true" />
                  <span>View</span>
                </Link>
              ),
            },
          ]}
          data={jobs}
          emptyMessage="No service jobs found"
        />

        <TablePagination
          itemLabel="service jobs"
          loading={loading}
          onPageChange={setPage}
          page={Number(pagination.page || page)}
          pageCount={pageCount}
          total={totalJobs}
          firstItem={firstItem}
          lastItem={lastItem}
        />
      </section>
    </div>
  );
};

export default ServiceJobs;
