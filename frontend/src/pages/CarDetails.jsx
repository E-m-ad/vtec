import { ArrowLeft, CarFront, CreditCard, Eye, ReceiptText, WalletCards, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import DataTable from "../components/DataTable";
import LoadingSpinner from "../components/LoadingSpinner";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue, getCarLabel, getPartnerName } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const serviceJobStatusMeta = {
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

const CarDetails = () => {
  const { id } = useParams();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await axiosClient.get(`/cars/${id}/details`);
        setDetails(unwrapData(response, null));
      } catch (err) {
        setError(errorMessage(err, "Unable to load car history"));
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [id]);

  const car = details?.car || {};
  const summary = details?.summary || {};
  const sales = useMemo(() => listFrom(details?.sales ?? []), [details]);
  const serviceJobs = useMemo(() => listFrom(details?.service_jobs ?? details?.serviceJobs ?? []), [details]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{getCarLabel(car, `Car #${id}`)}</h1>
          <p className="page-subtitle">Car profile and all sale invoices linked as service history.</p>
        </div>
        <Link className="btn btn-secondary" to="/cars">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Back to Cars</span>
        </Link>
      </div>

      {loading ? (
        <section className="card table-state">
          <LoadingSpinner />
        </section>
      ) : error ? (
        <section className="card error-text">{error}</section>
      ) : (
        <>
          <section className="grid grid-4">
            <StatCard
              title="Invoices"
              value={firstValue(summary.invoice_count, summary.invoiceCount, 0)}
              icon={ReceiptText}
              tone="info"
            />
            <StatCard
              title="Total Sales"
              value={formatCurrency(firstValue(summary.total_sales, summary.totalSales, 0))}
              icon={WalletCards}
              tone="success"
            />
            <StatCard
              title="Paid"
              value={formatCurrency(firstValue(summary.total_paid, summary.totalPaid, 0))}
              icon={CreditCard}
              tone="neutral"
            />
            <StatCard
              title="Remaining"
              value={formatCurrency(firstValue(summary.remaining_amount, summary.remainingAmount, 0))}
              icon={CarFront}
              tone="warning"
            />
            <StatCard
              title="Service Jobs"
              value={firstValue(summary.service_job_count, summary.serviceJobCount, serviceJobs.length)}
              icon={Wrench}
              tone="neutral"
              subtitle={`${firstValue(summary.active_service_job_count, summary.activeServiceJobCount, 0)} active`}
            />
          </section>

          <section className="card invoice-header-card">
            <div className="invoice-title">
              <div className="brand-mark">
                <CarFront size={22} aria-hidden="true" />
              </div>
              <div>
                <strong>{car.make} {car.model}</strong>
                <span>{firstValue(car.plate_number, car.plateNumber, "No plate number")}</span>
              </div>
            </div>
            <div className="invoice-meta-grid">
              <div>
                <span>Owner</span>
                <strong>{car.customer?.name || car.customer_name || "-"}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{car.customer?.phone || "-"}</strong>
              </div>
              <div>
                <span>Year</span>
                <strong>{car.year || "-"}</strong>
              </div>
              <div>
                <span>Color</span>
                <strong>{car.color || "-"}</strong>
              </div>
              <div>
                <span>VIN</span>
                <strong>{car.vin || "-"}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Service Jobs</h2>
              <span className="badge badge-neutral">{serviceJobs.length} jobs</span>
            </div>
            <DataTable
              columns={[
                { header: "Job", render: (row) => firstValue(row.job_number, row.jobNumber, `Job #${row.id}`) },
                {
                  header: "Status",
                  render: (row) => {
                    const meta = serviceJobStatusMeta[row.status] || serviceJobStatusMeta.RECEIVED;
                    return <span className={`badge ${meta.className}`}>{meta.label}</span>;
                  },
                },
                { header: "Started", render: (row) => formatDate(firstValue(row.start_date, row.startDate)) },
                { header: "Total", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount, 0)) },
                { header: "Returned", render: (row) => formatCurrency(firstValue(row.returned_amount, row.returnedAmount, 0)) },
                { header: "Net", render: (row) => formatCurrency(firstValue(row.net_total_amount, row.netTotalAmount, row.total_amount, row.totalAmount, 0)) },
                { header: "Paid", render: (row) => formatCurrency(firstValue(row.paid_amount, row.paidAmount, 0)) },
                {
                  header: "Remaining",
                  render: (row) => formatCurrency(firstValue(row.remaining_amount, row.remainingAmount, 0)),
                },
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
              data={serviceJobs}
              emptyMessage="No service jobs linked to this car yet"
            />
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Service Invoice History</h2>
              <span className="badge badge-neutral">{sales.length} invoices</span>
            </div>
            <DataTable
              columns={[
                { header: "Invoice", render: (row) => firstValue(row.sale_number, row.saleNumber, `Sale #${row.id}`) },
                { header: "Date", render: (row) => formatDate(firstValue(row.sale_date, row.saleDate)) },
                { header: "Customer", render: (row) => getPartnerName(row, "customer") },
                { header: "Total", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount, 0)) },
                { header: "Paid", render: (row) => formatCurrency(firstValue(row.paid_amount, row.paidAmount, 0)) },
                {
                  header: "Remaining",
                  render: (row) => formatCurrency(firstValue(row.remaining_amount, row.remainingAmount, 0)),
                },
                {
                  header: "Actions",
                  render: (row) => (
                    <Link className="btn btn-secondary btn-small" to={`/sales/${row.id}`}>
                      <Eye size={15} aria-hidden="true" />
                      <span>View</span>
                    </Link>
                  ),
                },
              ]}
              data={sales}
              emptyMessage="No invoices linked to this car yet"
            />
          </section>
        </>
      )}
    </div>
  );
};

export default CarDetails;
