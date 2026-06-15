import { Edit, Eye, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import FormInput from "../components/FormInput";
import SearchInput from "../components/SearchInput";
import formatCurrency from "../utils/formatCurrency";
import { firstValue } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

const money = (...values) => Number(firstValue(...values, 0) ?? 0);

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadCustomers = async () => {
    setLoading(true);
    setError("");

    try {
      const query = search.trim();
      const response = await axiosClient.get("/customers", {
        params: query ? { search: query } : undefined,
      });

      setCustomers(listFrom(unwrapData(response, [])));
    } catch (err) {
      setError(errorMessage(err, "Unable to load customers"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(loadCustomers, 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
  };

  const startEdit = (customer) => {
    setEditing(customer);
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Customer name is required");
      return;
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editing) {
        await axiosClient.put(`/customers/${editing.id}`, form);
      } else {
        await axiosClient.post("/customers", form);
      }

      resetForm();
      await loadCustomers();
    } catch (err) {
      setError(errorMessage(err, "Unable to save customer"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await axiosClient.delete(`/customers/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadCustomers();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete customer"));
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Customer contacts, invoices, payments, and receivable balances.</p>
        </div>
      </div>

      <section className="card">
        <form className="form partner-form" onSubmit={submit}>
          <div className="form-row">
            <FormInput label="Name" name="name" value={form.name} onChange={updateField} />
            <FormInput label="Phone" name="phone" value={form.phone} onChange={updateField} />
          </div>
          <div className="form-row">
            <FormInput label="Email" name="email" type="email" value={form.email} onChange={updateField} />
            <FormInput label="Address" name="address" value={form.address} onChange={updateField} />
          </div>
          <div className="form-actions">
            <Button type="submit" icon={editing ? Edit : Plus} disabled={saving}>
              {saving ? "Saving" : editing ? "Update" : "Add"}
            </Button>
            {editing ? (
              <Button variant="secondary" icon={X} onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>

        {error ? <p className="error-text table-error">{error}</p> : null}

        <div className="toolbar">
          <div className="filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Search customers" />
          </div>
        </div>

        <DataTable
          loading={loading}
          columns={[
            { header: "Name", accessor: "name" },
            { header: "Phone", accessor: "phone" },
            { header: "Email", accessor: "email" },
            { header: "Invoices", render: (row) => firstValue(row.invoice_count, row.invoiceCount, 0) },
            { header: "Sales", render: (row) => formatCurrency(money(row.total_sales, row.totalSales)) },
            { header: "Paid", render: (row) => formatCurrency(money(row.total_paid, row.totalPaid)) },
            {
              header: "Receivable",
              render: (row) => formatCurrency(money(row.receivable_amount, row.receivableAmount)),
            },
            {
              header: "Actions",
              render: (row) => (
                <div className="actions">
                  <Link className="icon-button" to={`/customers/${row.id}`} aria-label="View customer details">
                    <Eye size={16} />
                  </Link>
                  <button className="icon-button" type="button" aria-label="Edit customer" onClick={() => startEdit(row)}>
                    <Edit size={16} />
                  </button>
                  <button className="icon-button" type="button" aria-label="Delete customer" onClick={() => setDeleteTarget(row)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
          data={customers}
          emptyMessage="No customers found"
        />
      </section>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete customer"
        message={`Delete ${deleteTarget?.name || "this customer"}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Customers;
