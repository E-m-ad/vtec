import {
  CalendarDays,
  CreditCard,
  MinusCircle,
  Receipt,
  Save,
  Truck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import SearchInput from "../components/SearchInput";
import SearchableSelect from "../components/SearchableSelect";
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

const getDayParams = (date) => {
  if (!date) return {};

  return {
    from: `${date}T00:00:00.000`,
    to: `${date}T23:59:59.999`,
  };
};

const money = (...values) => Number(firstValue(...values, 0) ?? 0);

const supplierDescription = (supplier) => [supplier?.phone, supplier?.email].filter(Boolean).join(" / ");
const supplierSearchText = (supplier) =>
  [supplier?.name, supplier?.phone, supplier?.email, supplier?.tax_number, supplier?.taxNumber].filter(Boolean).join(" ");

const employeeDescription = (employee) => [employee?.position, employee?.department, employee?.phone].filter(Boolean).join(" / ");
const employeeSearchText = (employee) =>
  [employee?.name, employee?.employeeCode, employee?.employee_code, employee?.phone, employee?.position, employee?.department]
    .filter(Boolean)
    .join(" ");

const purchaseLabel = (purchase) => firstValue(purchase?.invoice_number, purchase?.invoiceNumber, `Purchase #${purchase?.id}`);
const purchaseDescription = (purchase) =>
  [
    formatDate(firstValue(purchase?.purchase_date, purchase?.purchaseDate)),
    `Remaining ${formatCurrency(money(purchase?.remaining_amount, purchase?.remainingAmount))}`,
  ]
    .filter(Boolean)
    .join(" / ");
const purchaseSearchText = (purchase) =>
  [
    purchaseLabel(purchase),
    firstValue(purchase?.purchase_date, purchase?.purchaseDate, ""),
    money(purchase?.remaining_amount, purchase?.remainingAmount),
  ]
    .filter(Boolean)
    .join(" ");

const initialForm = (date = toDateInput()) => ({
  source_type: "general_expense",
  amount: "",
  transaction_date: date,
  payment_method: "cash",
  supplier_id: "",
  purchase_id: "",
  employee_id: "",
  employee_transaction_type: "advance",
  category: "",
  notes: "",
});

const sourceOptions = [
  { value: "general_expense", label: "General Expense" },
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "employee_transaction", label: "Employee Transaction" },
];

const employeeTransactionTypes = [
  { value: "advance", label: "Advance" },
  { value: "salary_payment", label: "Salary Payment" },
  { value: "bonus", label: "Bonus" },
  { value: "allowance", label: "Allowance" },
  { value: "deduction", label: "Deduction" },
];

const typeMeta = {
  supplier_payment: { className: "badge-info" },
  employee_transaction: { className: "badge-warning" },
  general_expense: { className: "badge-neutral" },
};

const MoneyOut = () => {
  const today = toDateInput();
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState({});
  const [entries, setEntries] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [payablePurchases, setPayablePurchases] = useState([]);
  const [form, setForm] = useState(initialForm(today));
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const loadMoneyOut = async (date = selectedDate, queryValue = search) => {
    setLoading(true);
    setError("");

    try {
      const query = queryValue.trim();
      const response = await axiosClient.get("/money-out", {
        params: {
          ...getDayParams(date),
          ...(query ? { search: query } : {}),
        },
      });
      const data = unwrapData(response, {});

      setSummary(data?.summary || {});
      setEntries(listFrom(data?.entries || []));
    } catch (err) {
      setError(errorMessage(err, "Unable to load money out"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);

      try {
        const [suppliersResponse, employeesResponse] = await Promise.all([
          axiosClient.get("/suppliers"),
          axiosClient.get("/employees"),
        ]);

        setSuppliers(listFrom(unwrapData(suppliersResponse, [])));
        setEmployees(listFrom(unwrapData(employeesResponse, [])));
      } catch (err) {
        setFormError(errorMessage(err, "Unable to load money out options"));
      } finally {
        setOptionsLoading(false);
      }
    };

    loadOptions();
  }, []);

  useEffect(() => {
    loadMoneyOut();
  }, [selectedDate, search]);

  useEffect(() => {
    if (!form.supplier_id || form.source_type !== "supplier_payment") {
      setPayablePurchases([]);
      return;
    }

    let isMounted = true;
    const loadSupplierInvoices = async () => {
      setSupplierLoading(true);
      setFormError("");

      try {
        const response = await axiosClient.get(`/suppliers/${form.supplier_id}/details`);
        const details = unwrapData(response, {});
        const purchases = listFrom(details?.purchases || []).filter(
          (purchase) => money(purchase.remaining_amount, purchase.remainingAmount) > 0,
        );

        if (isMounted) setPayablePurchases(purchases);
      } catch (err) {
        if (isMounted) setFormError(errorMessage(err, "Unable to load supplier invoices"));
      } finally {
        if (isMounted) setSupplierLoading(false);
      }
    };

    loadSupplierInvoices();

    return () => {
      isMounted = false;
    };
  }, [form.source_type, form.supplier_id]);

  const summaryCards = useMemo(
    () => [
      {
        title: "Cash Out",
        value: formatCurrency(summary.total_cash_out ?? 0),
        icon: WalletCards,
        tone: "danger",
        subtitle: formatDate(selectedDate),
      },
      {
        title: "Suppliers",
        value: formatCurrency(summary.supplier_payments ?? 0),
        icon: Truck,
        tone: "info",
      },
      {
        title: "Employees",
        value: formatCurrency(summary.employee_cash_out ?? 0),
        icon: UserRound,
        tone: "warning",
      },
      {
        title: "General",
        value: formatCurrency(summary.general_expenses ?? 0),
        icon: Receipt,
        tone: "neutral",
      },
      {
        title: "Adjustments",
        value: formatCurrency(summary.employee_adjustments ?? 0),
        icon: MinusCircle,
        tone: "neutral",
        subtitle: "Non-cash deductions",
      },
    ],
    [selectedDate, summary],
  );

  const updateForm = (event) => {
    const { name, value } = event.target;

    setForm((current) => {
      const next = { ...current, [name]: value };

      if (name === "source_type") {
        next.amount = "";
        next.supplier_id = "";
        next.purchase_id = "";
        next.employee_id = "";
        next.category = "";
        next.notes = "";
      }

      if (name === "supplier_id") {
        next.purchase_id = "";
        next.amount = "";
      }

      if (name === "purchase_id") {
        const purchase = payablePurchases.find((entry) => String(entry.id) === String(value));
        if (purchase) {
          next.amount = String(money(purchase.remaining_amount, purchase.remainingAmount));
        }
      }

      return next;
    });
  };

  const updateFormValue = (name, value) => {
    updateForm({ target: { name, value } });
  };

  const validate = () => {
    const amount = Number(form.amount);

    if (!form.transaction_date) return "Choose a transaction date";
    if (!Number.isFinite(amount) || amount <= 0) return "Amount must be greater than 0";

    if (form.source_type === "supplier_payment") {
      if (!form.supplier_id) return "Choose a supplier";
      if (!form.purchase_id) return "Choose the invoice to pay";
    }

    if (form.source_type === "employee_transaction") {
      if (!form.employee_id) return "Choose an employee";
      if (!form.employee_transaction_type) return "Choose employee transaction type";
    }

    if (form.source_type === "general_expense" && !form.category.trim()) {
      return "General expense category is required";
    }

    return "";
  };

  const resetForm = (date = form.transaction_date) => {
    setForm(initialForm(date));
    setPayablePurchases([]);
  };

  const submit = async (event) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      setSuccess("");
      return;
    }

    setSaving(true);
    setFormError("");
    setSuccess("");

    try {
      await axiosClient.post("/money-out", {
        ...form,
        amount: Number(form.amount),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        purchase_id: form.purchase_id ? Number(form.purchase_id) : null,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
      });

      setSuccess("Money out recorded");
      resetForm(form.transaction_date);

      if (selectedDate !== form.transaction_date) {
        setSelectedDate(form.transaction_date);
      } else {
        await loadMoneyOut();
      }
    } catch (err) {
      setFormError(errorMessage(err, "Unable to record money out"));
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setSelectedDate(today);
    setSearch("");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Money Out</h1>
          <p className="page-subtitle">Record daily cash out for suppliers, employees, and general expenses.</p>
        </div>
      </div>

      {error ? <section className="card error-text">{error}</section> : null}

      <section className="grid grid-4">
        {summaryCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section className="card">
        <div className="section-header">
          <div className="section-title-with-icon">
            <h2>Record Money Out</h2>
            <CreditCard size={18} aria-hidden="true" />
          </div>
        </div>

        <form className="form" onSubmit={submit}>
          {formError ? <p className="error-text">{formError}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}

          <div className="form-row">
            <label className="form-field">
              <span>Type</span>
              <select className="select" name="source_type" value={form.source_type} onChange={updateForm}>
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Date</span>
              <input
                className="input"
                type="date"
                name="transaction_date"
                value={form.transaction_date}
                onChange={updateForm}
              />
            </label>
          </div>

          {form.source_type === "supplier_payment" ? (
            <div className="form-row">
              <SearchableSelect
                disabled={optionsLoading}
                emptyLabel="Choose supplier"
                getOptionDescription={supplierDescription}
                getOptionLabel={(supplier) => supplier.name}
                getOptionSearchText={supplierSearchText}
                label="Supplier"
                onChange={(value) => updateFormValue("supplier_id", value)}
                options={suppliers}
                placeholder="Search supplier name or phone"
                value={form.supplier_id}
              />
              <SearchableSelect
                disabled={!form.supplier_id || supplierLoading}
                emptyLabel={supplierLoading ? "Loading invoices" : "Choose unpaid invoice"}
                getOptionDescription={purchaseDescription}
                getOptionLabel={purchaseLabel}
                getOptionSearchText={purchaseSearchText}
                label="Invoice"
                onChange={(value) => updateFormValue("purchase_id", value)}
                options={payablePurchases}
                placeholder="Search invoice number"
                value={form.purchase_id}
              />
            </div>
          ) : null}

          {form.source_type === "employee_transaction" ? (
            <div className="form-row">
              <SearchableSelect
                disabled={optionsLoading}
                emptyLabel="Choose employee"
                getOptionDescription={employeeDescription}
                getOptionLabel={(employee) => employee.name}
                getOptionSearchText={employeeSearchText}
                label="Employee"
                onChange={(value) => updateFormValue("employee_id", value)}
                options={employees}
                placeholder="Search employee name, code, or phone"
                value={form.employee_id}
              />
              <label className="form-field">
                <span>Employee Type</span>
                <select
                  className="select"
                  name="employee_transaction_type"
                  value={form.employee_transaction_type}
                  onChange={updateForm}
                >
                  {employeeTransactionTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {form.source_type === "general_expense" ? (
            <label className="form-field">
              <span>Category</span>
              <input
                className="input"
                name="category"
                value={form.category}
                onChange={updateForm}
                placeholder="Rent, utilities, transport, workshop supplies"
              />
            </label>
          ) : null}

          <div className="form-row">
            <label className="form-field">
              <span>Amount</span>
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                name="amount"
                value={form.amount}
                onChange={updateForm}
              />
            </label>
            <label className="form-field">
              <span>Payment Method</span>
              <select className="select" name="payment_method" value={form.payment_method} onChange={updateForm}>
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
            <textarea className="textarea" name="notes" value={form.notes} onChange={updateForm} />
          </label>

          <div className="form-actions">
            <Button type="submit" icon={Save} disabled={saving || optionsLoading}>
              {saving ? "Saving" : "Record Money Out"}
            </Button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-header">
          <div className="section-title-with-icon">
            <h2>Daily Money Out</h2>
            <CalendarDays size={18} aria-hidden="true" />
          </div>
          <span className="badge badge-neutral">{summary.entry_count ?? entries.length} entries</span>
        </div>
        <div className="toolbar">
          <div className="filters compact-table-filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Search money out" />
            <input
              className="input filter-select"
              type="date"
              aria-label="Money out date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setForm((current) => ({ ...current, transaction_date: event.target.value }));
              }}
            />
          </div>
          {search || selectedDate !== today ? (
            <Button variant="secondary" onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : null}
        </div>
        <DataTable
          loading={loading}
          columns={[
            { header: "Date", render: (row) => formatDate(row.transaction_date) },
            {
              header: "Type",
              render: (row) => (
                <span className={`badge ${typeMeta[row.source_type]?.className || "badge-neutral"}`}>{row.type}</span>
              ),
            },
            {
              header: "Name / Category",
              render: (row) => {
                if (row.source_type === "supplier_payment") {
                  return (
                    <Link className="text-link" to={`/suppliers/${row.party_id}`}>
                      {row.party_name}
                    </Link>
                  );
                }

                if (row.source_type === "employee_transaction") {
                  return (
                    <Link className="text-link" to={`/employees/${row.party_id}`}>
                      {row.party_name}
                    </Link>
                  );
                }

                return row.party_name || "-";
              },
            },
            {
              header: "Reference",
              render: (row) =>
                row.source_type === "supplier_payment" && row.reference_id ? (
                  <Link className="text-link" to={`/purchases/${row.reference_id}`}>
                    {row.reference_label}
                  </Link>
                ) : (
                  row.reference_label || "-"
                ),
            },
            { header: "Amount", render: (row) => formatCurrency(row.amount) },
            { header: "Cash Out", render: (row) => formatCurrency(row.cash_out_amount) },
            { header: "Method", render: (row) => row.payment_method || "-" },
            { header: "Notes", render: (row) => row.notes || "-" },
          ]}
          data={entries}
          emptyMessage="No money out recorded for this day"
        />
      </section>
    </div>
  );
};

export default MoneyOut;
