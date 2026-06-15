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

const supplierTotal = (supplier, key) => {
  const value = firstValue(supplier?.[key], supplier?.[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())], 0);
  return Number(value ?? 0);
};

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadSuppliers = async () => {
    setLoading(true);
    setError("");

    try {
      const query = search.trim();
      const response = await axiosClient.get("/suppliers", {
        params: query ? { search: query } : undefined,
      });
      setSuppliers(listFrom(unwrapData(response, [])));
    } catch (err) {
      setError(errorMessage(err, "Unable to load suppliers"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
  };

  const startEdit = (supplier) => {
    setEditing(supplier);
    setForm({
      name: supplier.name || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Supplier name is required");
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
        await axiosClient.put(`/suppliers/${editing.id}`, form);
      } else {
        await axiosClient.post("/suppliers", form);
      }

      resetForm();
      await loadSuppliers();
    } catch (err) {
      setError(errorMessage(err, "Unable to save supplier"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await axiosClient.delete(`/suppliers/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadSuppliers();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete supplier"));
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">Supplier contacts, purchase totals, settlements, and remaining balances.</p>
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
            <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers" />
          </div>
        </div>

        <DataTable
          loading={loading}
          columns={[
            { header: "Name", accessor: "name" },
            { header: "Phone", accessor: "phone" },
            { header: "Email", accessor: "email" },
            { header: "Purchased", render: (row) => formatCurrency(supplierTotal(row, "total_purchases")) },
            { header: "Settled", render: (row) => formatCurrency(supplierTotal(row, "total_paid")) },
            { header: "Balance", render: (row) => formatCurrency(supplierTotal(row, "remaining_amount")) },
            {
              header: "Actions",
              render: (row) => (
                <div className="actions">
                  <Link className="icon-button" to={`/suppliers/${row.id}`} aria-label="View supplier details">
                    <Eye size={16} />
                  </Link>
                  <button className="icon-button" type="button" aria-label="Edit supplier" onClick={() => startEdit(row)}>
                    <Edit size={16} />
                  </button>
                  <button className="icon-button" type="button" aria-label="Delete supplier" onClick={() => setDeleteTarget(row)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
          data={suppliers}
          emptyMessage="No suppliers found"
        />
      </section>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete supplier"
        message={`Delete ${deleteTarget?.name || "this supplier"}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Suppliers;
