import JsBarcode from "jsbarcode";
import { Barcode, Edit, Eye, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import FormInput from "../components/FormInput";
import SearchInput from "../components/SearchInput";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import logo from "../img/logo.png";

const initialForm = {
  employee_code: "",
  name: "",
  phone: "",
  email: "",
  position: "",
  department: "",
  salary: "",
  hire_date: "",
  status: "active",
  address: "",
  notes: "",
};

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On leave" },
  { value: "inactive", label: "Inactive" },
  { value: "terminated", label: "Terminated" },
];

const statusMeta = {
  active: { label: "Active", className: "badge-success" },
  on_leave: { label: "On leave", className: "badge-warning" },
  inactive: { label: "Inactive", className: "badge-neutral" },
  terminated: { label: "Terminated", className: "badge-danger" },
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const toDateInput = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
};

const employeePayload = (form) => ({
  employee_code: form.employee_code,
  name: form.name,
  phone: form.phone,
  email: form.email,
  position: form.position,
  department: form.department,
  salary: form.salary,
  hire_date: form.hire_date,
  status: form.status,
  address: form.address,
  notes: form.notes,
});

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get("/employees", {
        params: {
          search: search.trim() || undefined,
          status: status || undefined,
        },
      });
      setEmployees(listFrom(unwrapData(response, [])));
    } catch (err) {
      setError(errorMessage(err, "Unable to load employees"));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(loadEmployees, 220);
    return () => window.clearTimeout(timer);
  }, [loadEmployees]);

  const activeCount = useMemo(
    () => employees.filter((employee) => employee.status === "active").length,
    [employees],
  );

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
    setShowForm(false);
  };

  const startCreate = () => {
    setForm(initialForm);
    setEditing(null);
    setError("");
    setShowForm(true);
  };

  const startEdit = (employee) => {
    setEditing(employee);
    setShowForm(true);
    setError("");
    setForm({
      employee_code: employee.employeeCode || "",
      name: employee.name || "",
      phone: employee.phone || "",
      email: employee.email || "",
      position: employee.position || "",
      department: employee.department || "",
      salary: employee.salary ?? "",
      hire_date: toDateInput(employee.hireDate),
      status: employee.status || "active",
      address: employee.address || "",
      notes: employee.notes || "",
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Employee name is required");
      return;
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address");
      return;
    }

    if (form.salary && Number(form.salary) < 0) {
      setError("Salary must be 0 or more");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editing) {
        await axiosClient.put(
          `/employees/${editing.id}`,
          employeePayload(form),
        );
      } else {
        await axiosClient.post("/employees", employeePayload(form));
      }

      resetForm();
      await loadEmployees();
    } catch (err) {
      setError(errorMessage(err, "Unable to save employee"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await axiosClient.delete(`/employees/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadEmployees();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete employee"));
      setDeleteTarget(null);
    }
  };

  const printAttendanceBarcode = (employee) => {
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
        height: 150,
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
    const employeeCode = escapeHtml(
      employee.employeeCode || employee.employee_code || `EMP-${employee.id}`,
    );
    const position = escapeHtml(
      employee.position || employee.department || "VTEC Staff",
    );

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
            text-align: center;
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
              font-size: 18px;
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
              // margin-top: 6px;
            }
            svg {
              max-width: 100%;
            }
            @media print {
              body { padding: 0; }
              .card { border: 0; width: 250px; }
              .barcode { margin-top: -80px; height: 120px; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">VTEC</div>
            <div>
              <h1>${employeeName}</h1>
              <div class="meta"> ${position}</div>
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
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">
            Manage staff profiles, contact details, positions, salaries, and
            work status.
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-info">{activeCount} active</span>
          <span className="badge badge-neutral">{employees.length} shown</span>
          <Button icon={Plus} onClick={startCreate}>
            Create Employee
          </Button>
        </div>
      </div>

      <section className="card">
        {showForm ? (
          <form className="form partner-form" onSubmit={submit}>
            <div className="section-header">
              <h2>{editing ? "Edit Employee" : "Create Employee"}</h2>
              <button
                className="icon-button"
                type="button"
                onClick={resetForm}
                aria-label="Close employee form"
              >
                <X size={16} />
              </button>
            </div>
            <div className="form-row">
              <FormInput
                label="Employee code"
                name="employee_code"
                value={form.employee_code}
                onChange={updateField}
                placeholder="EMP-001"
              />
              <FormInput
                label="Name"
                name="name"
                value={form.name}
                onChange={updateField}
              />
            </div>
            <div className="form-row">
              <FormInput
                label="Phone"
                name="phone"
                value={form.phone}
                onChange={updateField}
              />
              <FormInput
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={updateField}
              />
            </div>
            <div className="form-row">
              <FormInput
                label="Position"
                name="position"
                value={form.position}
                onChange={updateField}
              />
              <FormInput
                label="Department"
                name="department"
                value={form.department}
                onChange={updateField}
              />
            </div>
            <div className="form-row">
              <FormInput
                label="Salary"
                name="salary"
                type="number"
                min="0"
                value={form.salary}
                onChange={updateField}
              />
              <FormInput
                label="Hire date"
                name="hire_date"
                type="date"
                value={form.hire_date}
                onChange={updateField}
              />
            </div>
            <div className="form-row">
              <label className="form-field">
                <span>Status</span>
                <select
                  className="select"
                  name="status"
                  value={form.status}
                  onChange={updateField}
                >
                  {statusOptions.slice(1).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <FormInput
                label="Address"
                name="address"
                value={form.address}
                onChange={updateField}
              />
            </div>
            <label className="form-field">
              <span>Notes</span>
              <textarea
                className="textarea"
                name="notes"
                value={form.notes}
                onChange={updateField}
              />
            </label>

            <div className="form-actions">
              <Button
                type="submit"
                icon={editing ? Edit : Plus}
                disabled={saving}
              >
                {saving ? "Saving" : editing ? "Update" : "Add"}
              </Button>
              <Button
                variant="secondary"
                icon={X}
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <div className="toolbar">
          <div className="filters">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search employees"
            />
            <select
              className="select filter-select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <p className="error-text table-error">{error}</p> : null}

        <DataTable
          loading={loading}
          columns={[
            {
              header: "Code",
              render: (row) => row.employeeCode || "-",
            },
            { header: "Name", accessor: "name" },
            {
              header: "Position",
              render: (row) => row.position || "-",
            },
            {
              header: "Department",
              render: (row) => row.department || "-",
            },
            {
              header: "Phone",
              render: (row) => row.phone || "-",
            },
            {
              header: "Status",
              render: (row) => {
                const meta = statusMeta[row.status] || statusMeta.inactive;
                return (
                  <span className={`badge ${meta.className}`}>
                    {meta.label}
                  </span>
                );
              },
            },
            {
              header: "Salary",
              render: (row) => formatCurrency(row.salary),
            },
            {
              header: "Hire Date",
              render: (row) => formatDate(row.hireDate),
            },
            {
              header: "Actions",
              render: (row) => (
                <div className="actions">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Print attendance barcode"
                    onClick={() => printAttendanceBarcode(row)}
                  >
                    <Barcode size={16} />
                  </button>
                  <Link
                    className="icon-button"
                    to={`/employees/${row.id}`}
                    aria-label="View employee details"
                  >
                    <Eye size={16} />
                  </Link>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Edit employee"
                    onClick={() => startEdit(row)}
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Delete employee"
                    onClick={() => setDeleteTarget(row)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
          data={employees}
          emptyMessage="No employees found"
        />
      </section>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete employee"
        message={`Delete ${deleteTarget?.name || "this employee"}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Employees;
