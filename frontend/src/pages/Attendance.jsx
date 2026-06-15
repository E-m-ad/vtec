import {
  BadgeDollarSign,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  RefreshCw,
  Save,
  ScanBarcode,
  UserCheck,
  UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import LoadingSpinner from "../components/LoadingSpinner";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const toDateInput = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};

const toTimeInput = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const nowTimeInput = () => toTimeInput(new Date());

const statusMeta = {
  present: { label: "Present", className: "badge-success" },
  absent: { label: "Absent", className: "badge-danger" },
  unmarked: { label: "Unmarked", className: "badge-neutral" },
};

const Attendance = () => {
  const scanInputRef = useRef(null);
  const [date, setDate] = useState(toDateInput());
  const [attendance, setAttendance] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [scanToken, setScanToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get("/attendance", {
        params: { date },
      });
      setAttendance(unwrapData(response, null));
    } catch (err) {
      setError(errorMessage(err, "Unable to load attendance"));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const employees = useMemo(
    () => listFrom(attendance?.employees || []),
    [attendance],
  );

  useEffect(() => {
    const nextDrafts = {};

    employees.forEach((employee) => {
      nextDrafts[employee.id] = {
        status: employee.attendance_status || "unmarked",
        check_in_time: toTimeInput(employee.check_in_at),
        notes: employee.attendance?.notes || "",
      };
    });

    setDrafts(nextDrafts);
  }, [employees]);

  const summary = attendance?.summary || {};

  const setDraftValue = (employeeId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [employeeId]: {
        ...(current[employeeId] || {}),
        [field]: value,
      },
    }));
  };

  const submitScan = async (event) => {
    event.preventDefault();

    const token = scanToken.trim();
    if (!token) {
      setScanMessage("");
      setError("Scan or enter an employee barcode");
      return;
    }

    setScanning(true);
    setError("");
    setScanMessage("");

    try {
      const response = await axiosClient.post("/attendance/scan", {
        token,
        date,
      });
      const result = unwrapData(response, null);
      setScanToken("");
      setScanMessage(`${result?.employee?.name || "Employee"} marked present`);
      await loadAttendance();
      window.setTimeout(() => scanInputRef.current?.focus(), 50);
    } catch (err) {
      setError(errorMessage(err, "Unable to record scanned attendance"));
    } finally {
      setScanning(false);
    }
  };

  const saveRow = async (employee, forcedStatus = null) => {
    const draft = drafts[employee.id] || {};
    const status = forcedStatus || draft.status;

    if (!["present", "absent"].includes(status)) {
      setError("Choose present or absent before saving");
      return;
    }

    setSavingId(employee.id);
    setError("");
    setScanMessage("");

    try {
      await axiosClient.put(`/attendance/${employee.id}`, {
        date,
        status,
        check_in_time:
          status === "present" ? draft.check_in_time || undefined : null,
        notes: draft.notes || null,
      });
      await loadAttendance();
    } catch (err) {
      setError(errorMessage(err, "Unable to save attendance"));
    } finally {
      setSavingId(null);
    }
  };

  const quickMark = (employee, status) => {
    setDrafts((current) => ({
      ...current,
      [employee.id]: {
        ...(current[employee.id] || {}),
        status,
        check_in_time:
          status === "present"
            ? current[employee.id]?.check_in_time || nowTimeInput()
            : "",
      },
    }));

    saveRow(employee, status);
  };

  const finalizeDay = async () => {
    if (!window.confirm(`Finalize attendance for ${formatDate(date)}?`)) return;

    setFinalizing(true);
    setError("");
    setScanMessage("");

    try {
      const response = await axiosClient.post("/attendance/finalize", { date });
      setAttendance(unwrapData(response, null));
      setScanMessage("Attendance finalized");
    } catch (err) {
      setError(errorMessage(err, "Unable to finalize attendance"));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-subtitle">
            Scan employee cards, review daily presence, and finalize absence deductions.
          </p>
        </div>
        <div className="page-actions attendance-date-actions">
          <label className="form-field attendance-date-field">
            <span>Date</span>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <Button variant="secondary" icon={RefreshCw} onClick={loadAttendance} disabled={loading}>
            Refresh
          </Button>
          <Button icon={CalendarCheck} onClick={finalizeDay} disabled={finalizing || loading}>
            {finalizing ? "Finalizing" : "Finalize Absences"}
          </Button>
        </div>
      </div>

      <section className="grid grid-4">
        <StatCard
          title="Present"
          value={summary.present || 0}
          icon={UserCheck}
          tone="success"
          subtitle={`${summary.total || 0} active employees`}
        />
        <StatCard
          title="Absent"
          value={summary.absent || 0}
          icon={UserX}
          tone="danger"
          subtitle={`${summary.unmarked || 0} unmarked`}
        />
        <StatCard
          title="Working Days"
          value={attendance?.working_days || 0}
          icon={CalendarDays}
          tone="info"
          subtitle={formatDate(date)}
        />
        <StatCard
          title="Deduction Total"
          value={formatCurrency(summary.estimated_deduction_total || 0)}
          icon={BadgeDollarSign}
          tone="warning"
          subtitle={`Finalized ${formatCurrency(summary.finalized_deduction_total || 0)}`}
        />
      </section>

      <section className="card attendance-scanner-card">
        <form className="attendance-scan-form" onSubmit={submitScan}>
          <label className="form-field">
            <span>Barcode Scan</span>
            <input
              ref={scanInputRef}
              className="input"
              name="scan_token"
              value={scanToken}
              onChange={(event) => setScanToken(event.target.value)}
              placeholder="Scan employee card"
              disabled={scanning}
              autoFocus
            />
          </label>
          <Button type="submit" icon={ScanBarcode} disabled={scanning}>
            {scanning ? "Scanning" : "Record"}
          </Button>
        </form>
        {scanMessage ? <p className="success-text">{scanMessage}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Daily Attendance</h2>
          {summary.is_finalized ? (
            <span className="badge badge-success">
              <CheckCircle2 size={14} aria-hidden="true" />
              Finalized
            </span>
          ) : (
            <span className="badge badge-neutral">{summary.finalized || 0} finalized</span>
          )}
        </div>

        {loading ? (
          <div className="table-state">
            <LoadingSpinner />
          </div>
        ) : (
          <DataTable
            columns={[
              {
                header: "Employee",
                render: (row) => (
                  <div className="attendance-employee-cell">
                    <strong>{row.name}</strong>
                    <span>{row.employeeCode || row.position || "-"}</span>
                  </div>
                ),
              },
              {
                header: "Status",
                render: (row) => {
                  const draft = drafts[row.id] || {};
                  const currentStatus = draft.status || row.attendance_status || "unmarked";
                  const meta = statusMeta[currentStatus] || statusMeta.unmarked;

                  return (
                    <div className="attendance-status-cell">
                      <span className={`badge ${meta.className}`}>{meta.label}</span>
                      <select
                        className="select attendance-select"
                        value={currentStatus}
                        onChange={(event) => setDraftValue(row.id, "status", event.target.value)}
                      >
                        <option value="unmarked">Unmarked</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                      </select>
                    </div>
                  );
                },
              },
              {
                header: "Check In",
                render: (row) => {
                  const draft = drafts[row.id] || {};
                  const status = draft.status || row.attendance_status;

                  return (
                    <label className="attendance-time-field">
                      <Clock size={15} aria-hidden="true" />
                      <input
                        className="input"
                        type="time"
                        value={draft.check_in_time || ""}
                        disabled={status !== "present"}
                        onChange={(event) =>
                          setDraftValue(row.id, "check_in_time", event.target.value)
                        }
                      />
                    </label>
                  );
                },
              },
              {
                header: "Daily Deduction",
                render: (row) => formatCurrency(row.daily_deduction || 0),
              },
              {
                header: "Notes",
                render: (row) => (
                  <input
                    className="input attendance-notes-input"
                    value={drafts[row.id]?.notes || ""}
                    onChange={(event) => setDraftValue(row.id, "notes", event.target.value)}
                    placeholder="Optional"
                  />
                ),
              },
              {
                header: "Actions",
                render: (row) => (
                  <div className="attendance-row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Mark present"
                      disabled={savingId === row.id}
                      onClick={() => quickMark(row, "present")}
                    >
                      <UserCheck size={16} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Mark absent"
                      disabled={savingId === row.id}
                      onClick={() => quickMark(row, "absent")}
                    >
                      <UserX size={16} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Save attendance"
                      disabled={savingId === row.id}
                      onClick={() => saveRow(row)}
                    >
                      <Save size={16} />
                    </button>
                  </div>
                ),
              },
            ]}
            data={employees}
            emptyMessage="No active employees found"
          />
        )}
      </section>
    </div>
  );
};

export default Attendance;
