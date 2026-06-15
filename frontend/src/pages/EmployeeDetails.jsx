import JsBarcode from "jsbarcode";
import {
  ArrowLeft,
  BadgeDollarSign,
  Banknote,
  Barcode,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  Edit,
  MinusCircle,
  Plus,
  PlusCircle,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import LoadingSpinner from "../components/LoadingSpinner";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const toDateInput = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
};

const toMonthInput = (value = new Date()) => toDateInput(value).slice(0, 7);

const formatTime = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const initialTransactionForm = {
  type: "advance",
  amount: "",
  transaction_date: toDateInput(),
  payment_method: "cash",
  notes: "",
};

const transactionTypes = [
  { value: "advance", label: "Advance" },
  { value: "deduction", label: "Deduction" },
  { value: "bonus", label: "Bonus" },
  { value: "allowance", label: "Allowance" },
  { value: "salary_payment", label: "Salary Payment" },
];

const transactionMeta = {
  advance: { label: "Advance", className: "badge-warning" },
  deduction: { label: "Deduction", className: "badge-danger" },
  bonus: { label: "Bonus", className: "badge-success" },
  allowance: { label: "Allowance", className: "badge-success" },
  salary_payment: { label: "Salary Payment", className: "badge-info" },
};

const statusMeta = {
  active: { label: "Active", className: "badge-success" },
  on_leave: { label: "On leave", className: "badge-warning" },
  inactive: { label: "Inactive", className: "badge-neutral" },
  terminated: { label: "Terminated", className: "badge-danger" },
};

const attendanceMeta = {
  present: { label: "Present", className: "badge-success" },
  absent: { label: "Absent", className: "badge-danger" },
};

const money = (...values) => Number(firstValue(...values, 0) ?? 0);
const employeeTabs = [
  { id: "overview", label: "Overview" },
  { id: "attendance", label: "Attendance" },
  { id: "salary", label: "Salary" },
];

const EmployeeDetails = () => {
  const { id } = useParams();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState("");
  const [transactionForm, setTransactionForm] = useState(initialTransactionForm);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [attendanceFilterMode, setAttendanceFilterMode] = useState("month");
  const [attendanceFilterDate, setAttendanceFilterDate] = useState(toDateInput());
  const [attendanceFilterMonth, setAttendanceFilterMonth] = useState(toMonthInput());
  const [attendanceFilterStartDate, setAttendanceFilterStartDate] = useState(toDateInput());
  const [attendanceFilterEndDate, setAttendanceFilterEndDate] = useState(toDateInput());
  const [attendanceHistory, setAttendanceHistory] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");

  const loadDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get(`/employees/${id}/details`);
      setDetails(unwrapData(response, null));
    } catch (err) {
      setError(errorMessage(err, "Unable to load employee details"));
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    setAttendanceError("");

    const params =
      attendanceFilterMode === "day"
        ? { date: attendanceFilterDate }
        : attendanceFilterMode === "range"
          ? { start_date: attendanceFilterStartDate, end_date: attendanceFilterEndDate }
          : { month: attendanceFilterMonth };

    try {
      const response = await axiosClient.get(`/employees/${id}/attendance`, { params });
      setAttendanceHistory(unwrapData(response, null));
    } catch (err) {
      setAttendanceError(errorMessage(err, "Unable to load employee attendance"));
    } finally {
      setAttendanceLoading(false);
    }
  }, [
    attendanceFilterDate,
    attendanceFilterEndDate,
    attendanceFilterMode,
    attendanceFilterMonth,
    attendanceFilterStartDate,
    id,
  ]);

  useEffect(() => {
    loadDetails();
  }, [id]);

  useEffect(() => {
    loadEmployeeAttendance();
  }, [loadEmployeeAttendance]);

  const employee = details?.employee || {};
  const summary = details?.summary || {};
  const transactions = useMemo(
    () => listFrom(details?.transactions ?? []),
    [details],
  );
  const attendanceRecords = useMemo(
    () => listFrom(firstValue(attendanceHistory?.attendance_records, attendanceHistory?.attendanceRecords, [])),
    [attendanceHistory],
  );
  const attendanceSummary = attendanceHistory?.summary || {};
  const attendanceRange =
    attendanceHistory?.start_date && attendanceHistory?.end_date
      ? attendanceHistory.start_date === attendanceHistory.end_date
        ? formatDate(attendanceHistory.start_date)
        : `${formatDate(attendanceHistory.start_date)} - ${formatDate(attendanceHistory.end_date)}`
      : "-";
  const status = statusMeta[employee.status] || statusMeta.inactive;
  const totalAdvances = money(summary.total_advances, summary.totalAdvances);
  const totalSalaryDeductions = money(
    summary.total_salary_deductions,
    summary.totalSalaryDeductions,
  );
  const totalDeductions = money(summary.total_deductions, summary.totalDeductions);

  const updateTransactionField = (event) => {
    const { name, value } = event.target;
    setTransactionForm((current) => ({ ...current, [name]: value }));
  };

  const resetTransactionForm = () => {
    setTransactionForm(initialTransactionForm);
    setEditingTransaction(null);
    setTransactionError("");
  };

  const startEditTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setTransactionError("");
    setTransactionSuccess("");
    setActiveTab("overview");
    setTransactionForm({
      type: transaction.type || "advance",
      amount: transaction.amount ?? "",
      transaction_date: toDateInput(firstValue(transaction.transaction_date, transaction.transactionDate)),
      payment_method: firstValue(transaction.payment_method, transaction.paymentMethod, "cash") || "cash",
      notes: transaction.notes || "",
    });
  };

  const validateTransaction = () => {
    const amount = Number(transactionForm.amount);

    if (!transactionForm.type) return "Choose transaction type";
    if (!Number.isFinite(amount) || amount <= 0) return "Amount must be greater than 0";
    if (!transactionForm.transaction_date) return "Choose transaction date";

    return "";
  };

  const submitTransaction = async (event) => {
    event.preventDefault();

    const validationError = validateTransaction();
    if (validationError) {
      setTransactionError(validationError);
      setTransactionSuccess("");
      return;
    }

    setSaving(true);
    setTransactionError("");
    setTransactionSuccess("");

    const payload = {
      type: transactionForm.type,
      amount: Number(transactionForm.amount),
      transaction_date: transactionForm.transaction_date,
      payment_method: transactionForm.payment_method || null,
      notes: transactionForm.notes || null,
    };

    try {
      const response = editingTransaction
        ? await axiosClient.put(
            `/employees/${id}/salary-transactions/${editingTransaction.id}`,
            payload,
          )
        : await axiosClient.post(`/employees/${id}/salary-transactions`, payload);

      setDetails(unwrapData(response, null));
      setTransactionSuccess(
        editingTransaction ? "Salary transaction updated" : "Salary transaction recorded",
      );
      resetTransactionForm();
    } catch (err) {
      setTransactionError(errorMessage(err, "Unable to save salary transaction"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!deleteTarget) return;

    try {
      const response = await axiosClient.delete(
        `/employees/${id}/salary-transactions/${deleteTarget.id}`,
      );
      setDetails(unwrapData(response, null));
      setDeleteTarget(null);
      setTransactionSuccess("Salary transaction deleted");
      if (editingTransaction?.id === deleteTarget.id) {
        resetTransactionForm();
      }
    } catch (err) {
      setTransactionError(errorMessage(err, "Unable to delete salary transaction"));
      setDeleteTarget(null);
    }
  };

  const printAttendanceBarcode = () => {
    const token = employee.attendanceToken || employee.attendance_token;

    if (!token) {
      setError("Employee attendance token is missing");
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    try {
      JsBarcode(svg, token, {
        format: "CODE128",
        displayValue: false,
        font: "Arial",
        height: 76,
        margin: 12,
        width: 2,
      });
    } catch {
      setError("Unable to generate employee barcode");
      return;
    }

    const printWindow = window.open("", "_blank", "width=540,height=420");
    if (!printWindow) {
      setError("Allow popups to print the employee card");
      return;
    }

    const employeeName = escapeHtml(employee.name || "Employee");
    const employeeCode = escapeHtml(employee.employeeCode || employee.employee_code || `EMP-${employee.id}`);
    const position = escapeHtml(employee.position || employee.department || "VTEC Staff");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Attendance Card ${employeeCode}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              color: #111827;
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 24px;
            }
            .card {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              display: grid;
              gap: 12px;
              min-height: 240px;
              padding: 18px;
              width: 360px;
            }
            .brand {
              color: #dc2626;
              font-size: 13px;
              font-weight: 900;
              letter-spacing: 0.12em;
            }
            h1 {
              font-size: 20px;
              line-height: 1.15;
              margin: 0;
            }
            .meta {
              color: #4b5563;
              font-size: 13px;
              font-weight: 700;
            }
            .barcode {
              display: grid;
              justify-items: center;
              margin-top: 6px;
            }
            svg {
              max-width: 100%;
            }
            @media print {
              body { padding: 0; }
              .card { border: 0; width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">VTEC ATTENDANCE</div>
            <div>
              <h1>${employeeName}</h1>
              <div class="meta">${employeeCode} - ${position}</div>
            </div>
            <div class="barcode">${svg.outerHTML}</div>
          </div>
          <script>
            window.addEventListener("load", () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{employee?.name || `Employee #${id}`}</h1>
          <p className="page-subtitle">
            Employee profile, salary advances, deductions, additions, payments, and balance.
          </p>
        </div>
        <div className="page-actions">
          <Button
            variant="secondary"
            icon={Barcode}
            onClick={printAttendanceBarcode}
            disabled={!employee?.id}
          >
            Print Card
          </Button>
          <Link className="btn btn-secondary" to="/employees">
            <ArrowLeft size={17} aria-hidden="true" />
            <span>Back to Employees</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <section className="card table-state">
          <LoadingSpinner />
        </section>
      ) : error ? (
        <section className="card error-text">{error}</section>
      ) : (
        <>
          <nav className="page-tabs" aria-label="Employee profile sections">
            {employeeTabs.map((tab) => (
              <button
                className={`page-tab ${activeTab === tab.id ? "page-tab-active" : ""}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === "overview" ? (
            <>
              <section className="grid grid-4">
                <StatCard
                  title="Base Salary"
                  value={formatCurrency(firstValue(summary.base_salary, summary.baseSalary, employee.salary))}
                  icon={BadgeDollarSign}
                  tone="info"
                />
                <StatCard
                  title="Additions"
                  value={formatCurrency(firstValue(summary.total_additions, summary.totalAdditions))}
                  icon={PlusCircle}
                  tone="success"
                />
                <StatCard
                  title="Deductions"
                  value={formatCurrency(totalDeductions)}
                  icon={MinusCircle}
                  tone="danger"
                  subtitle={`Advances ${formatCurrency(totalAdvances)} / deductions ${formatCurrency(totalSalaryDeductions)}`}
                />
                <StatCard
                  title="Paid"
                  value={formatCurrency(firstValue(summary.total_paid, summary.totalPaid))}
                  icon={CreditCard}
                  tone="neutral"
                />
                <StatCard
                  title="Net Payable"
                  value={formatCurrency(firstValue(summary.net_payable, summary.netPayable))}
                  icon={Banknote}
                  tone="warning"
                />
              </section>

              <section className="card invoice-header-card">
                <div className="invoice-title">
                  <div className="brand-mark">
                    <UserRound size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <strong>{employee.name}</strong>
                    <span>{firstValue(employee.position, employee.department, "-")}</span>
                  </div>
                </div>
                <div className="invoice-meta-grid">
                  <div>
                    <span>Code</span>
                    <strong>{employee.employeeCode || "-"}</strong>
                  </div>
                  <div>
                    <span>Phone</span>
                    <strong>{employee.phone || "-"}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>
                      <span className={`badge ${status.className}`}>{status.label}</span>
                    </strong>
                  </div>
                  <div>
                    <span>Department</span>
                    <strong>{employee.department || "-"}</strong>
                  </div>
                  <div>
                    <span>Hire Date</span>
                    <strong>{formatDate(employee.hireDate)}</strong>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === "overview" ? (
          <section className="card">
            <div className="section-header">
              <h2>{editingTransaction ? "Edit Salary Transaction" : "Record Salary Transaction"}</h2>
            </div>
            <form className="form" onSubmit={submitTransaction}>
              {transactionError ? <p className="error-text">{transactionError}</p> : null}
              {transactionSuccess ? <p className="success-text">{transactionSuccess}</p> : null}
              <div className="form-row">
                <label className="form-field">
                  <span>Type</span>
                  <select
                    className="select"
                    name="type"
                    value={transactionForm.type}
                    onChange={updateTransactionField}
                  >
                    {transactionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Amount</span>
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    name="amount"
                    value={transactionForm.amount}
                    onChange={updateTransactionField}
                  />
                </label>
              </div>
              <div className="form-row">
                <label className="form-field">
                  <span>Date</span>
                  <input
                    className="input"
                    type="date"
                    name="transaction_date"
                    value={transactionForm.transaction_date}
                    onChange={updateTransactionField}
                  />
                </label>
                <label className="form-field">
                  <span>Payment Method</span>
                  <select
                    className="select"
                    name="payment_method"
                    value={transactionForm.payment_method}
                    onChange={updateTransactionField}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="check">Check</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <label className="form-field">
                <span>Notes</span>
                <textarea
                  className="textarea"
                  name="notes"
                  value={transactionForm.notes}
                  onChange={updateTransactionField}
                />
              </label>
              <div className="form-actions">
                <Button type="submit" icon={editingTransaction ? Edit : Plus} disabled={saving}>
                  {saving ? "Saving" : editingTransaction ? "Update Transaction" : "Record Transaction"}
                </Button>
                {editingTransaction ? (
                  <Button variant="secondary" icon={X} onClick={resetTransactionForm} disabled={saving}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </section>
          ) : null}

          {activeTab === "attendance" ? (
          <section className="card">
            <div className="section-header">
              <div>
                <h2>Attendance History</h2>
                <p className="section-subtitle">Filter this employee attendance by day, month, or date range.</p>
              </div>
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={loadEmployeeAttendance}
                disabled={attendanceLoading}
              >
                Refresh
              </Button>
            </div>

            <div className="toolbar employee-attendance-filter-toolbar">
              <div className="mode-toggle" role="group" aria-label="Employee attendance filter">
                <button
                  className={`mode-toggle-button ${attendanceFilterMode === "day" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => setAttendanceFilterMode("day")}
                  type="button"
                >
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>Day</span>
                </button>
                <button
                  className={`mode-toggle-button ${attendanceFilterMode === "month" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => setAttendanceFilterMode("month")}
                  type="button"
                >
                  <CalendarCheck size={16} aria-hidden="true" />
                  <span>Month</span>
                </button>
                <button
                  className={`mode-toggle-button ${attendanceFilterMode === "range" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => setAttendanceFilterMode("range")}
                  type="button"
                >
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>Range</span>
                </button>
              </div>

              <div className="employee-attendance-filter-fields">
                {attendanceFilterMode === "day" ? (
                  <label className="form-field">
                    <span>Day</span>
                    <input
                      className="input"
                      type="date"
                      value={attendanceFilterDate}
                      onChange={(event) => setAttendanceFilterDate(event.target.value)}
                    />
                  </label>
                ) : null}

                {attendanceFilterMode === "month" ? (
                  <label className="form-field">
                    <span>Month</span>
                    <input
                      className="input"
                      type="month"
                      value={attendanceFilterMonth}
                      onChange={(event) => setAttendanceFilterMonth(event.target.value)}
                    />
                  </label>
                ) : null}

                {attendanceFilterMode === "range" ? (
                  <>
                    <label className="form-field">
                      <span>Start Date</span>
                      <input
                        className="input"
                        type="date"
                        value={attendanceFilterStartDate}
                        onChange={(event) => setAttendanceFilterStartDate(event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span>End Date</span>
                      <input
                        className="input"
                        type="date"
                        value={attendanceFilterEndDate}
                        onChange={(event) => setAttendanceFilterEndDate(event.target.value)}
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </div>

            {attendanceError ? <p className="error-text table-error">{attendanceError}</p> : null}

            <div className="invoice-meta-grid employee-attendance-summary">
              <div>
                <span>Period</span>
                <strong>{attendanceRange}</strong>
              </div>
              <div>
                <span>Records</span>
                <strong>{attendanceSummary.total || 0}</strong>
              </div>
              <div>
                <span>Present</span>
                <strong>{attendanceSummary.present || 0}</strong>
              </div>
              <div>
                <span>Absent</span>
                <strong>{attendanceSummary.absent || 0}</strong>
              </div>
              <div>
                <span>Deduction Total</span>
                <strong>{formatCurrency(attendanceSummary.deduction_total || 0)}</strong>
              </div>
            </div>

            {attendanceLoading ? (
              <div className="table-state">
                <LoadingSpinner />
              </div>
            ) : (
              <DataTable
                columns={[
                  {
                    header: "Date",
                    render: (row) => formatDate(firstValue(row.attendance_date, row.attendanceDate)),
                  },
                  {
                    header: "Status",
                    render: (row) => {
                      const meta = attendanceMeta[row.status] || attendanceMeta.absent;
                      return <span className={`badge ${meta.className}`}>{meta.label}</span>;
                    },
                  },
                  {
                    header: "Check In",
                    render: (row) => formatTime(firstValue(row.check_in_at, row.checkInAt)),
                  },
                  {
                    header: "Deduction",
                    render: (row) => formatCurrency(firstValue(row.deduction_amount, row.deductionAmount, 0)),
                  },
                  {
                    header: "Finalized",
                    render: (row) => (
                      <span className={`badge ${row.finalized ? "badge-success" : "badge-neutral"}`}>
                        {row.finalized ? "Yes" : "No"}
                      </span>
                    ),
                  },
                  { header: "Notes", render: (row) => row.notes || "-" },
                ]}
                data={attendanceRecords}
                emptyMessage="No attendance records found for this filter"
              />
            )}
          </section>
          ) : null}

          {activeTab === "salary" ? (
          <section className="card">
            <div className="section-header">
              <h2>Salary History</h2>
              <span className="badge badge-neutral">{transactions.length} entries</span>
            </div>
            <DataTable
              columns={[
                {
                  header: "Date",
                  render: (row) => formatDate(firstValue(row.transaction_date, row.transactionDate)),
                },
                {
                  header: "Type",
                  render: (row) => {
                    const meta = transactionMeta[row.type] || transactionMeta.advance;
                    return <span className={`badge ${meta.className}`}>{meta.label}</span>;
                  },
                },
                { header: "Amount", render: (row) => formatCurrency(row.amount) },
                {
                  header: "Method",
                  render: (row) => firstValue(row.payment_method, row.paymentMethod, "-"),
                },
                {
                  header: "Recorded By",
                  render: (row) => firstValue(row.creator?.name, "-"),
                },
                { header: "Notes", render: (row) => row.notes || "-" },
                {
                  header: "Actions",
                  render: (row) => (
                    <div className="actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Edit salary transaction"
                        onClick={() => startEditTransaction(row)}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Delete salary transaction"
                        onClick={() => setDeleteTarget(row)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ),
                },
              ]}
              data={transactions}
              emptyMessage="No salary transactions found"
            />
          </section>
          ) : null}
        </>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete salary transaction"
        message="Delete this salary transaction? This will update the employee salary balance."
        onConfirm={confirmDeleteTransaction}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default EmployeeDetails;
