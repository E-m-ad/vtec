import { Edit, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import axiosClient from "../api/axiosClient";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import Button from "./Button";
import ConfirmModal from "./ConfirmModal";
import DataTable from "./DataTable";
import FormInput from "./FormInput";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

const PartnerManager = ({ title, subtitle, endpoint, singular }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axiosClient.get(endpoint);
      setItems(listFrom(unwrapData(response, [])));
    } catch (err) {
      setError(errorMessage(err, `Unable to load ${title.toLowerCase()}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [endpoint]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError(`${singular} name is required`);
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address");
      return;
    }

    try {
      if (editing) {
        await axiosClient.put(`${endpoint}/${editing.id}`, form);
      } else {
        await axiosClient.post(endpoint, form);
      }
      resetForm();
      loadItems();
    } catch (err) {
      setError(errorMessage(err, `Unable to save ${singular.toLowerCase()}`));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosClient.delete(`${endpoint}/${deleteTarget.id}`);
      setDeleteTarget(null);
      loadItems();
    } catch (err) {
      setError(errorMessage(err, `Unable to delete ${singular.toLowerCase()}`));
      setDeleteTarget(null);
    }
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
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
            <Button type="submit" icon={editing ? Edit : Plus}>
              {editing ? "Update" : "Add"}
            </Button>
            {editing ? (
              <Button variant="secondary" icon={X} onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>

        {error ? <p className="error-text table-error">{error}</p> : null}

        <DataTable
          loading={loading}
          columns={[
            { header: "Name", accessor: "name" },
            { header: "Phone", accessor: "phone" },
            { header: "Email", accessor: "email" },
            { header: "Address", accessor: "address" },
            {
              header: "Actions",
              render: (row) => (
                <div className="actions">
                  <button className="icon-button" type="button" aria-label="Edit" onClick={() => startEdit(row)}>
                    <Edit size={16} />
                  </button>
                  <button className="icon-button" type="button" aria-label="Delete" onClick={() => setDeleteTarget(row)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
          data={items}
          emptyMessage={`No ${title.toLowerCase()} found`}
        />
      </section>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title={`Delete ${singular.toLowerCase()}`}
        message={`Delete ${deleteTarget?.name || `this ${singular.toLowerCase()}`}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default PartnerManager;
