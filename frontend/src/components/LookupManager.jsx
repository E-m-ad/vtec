import { Edit, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import axiosClient from "../api/axiosClient";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import Button from "./Button";
import ConfirmModal from "./ConfirmModal";
import DataTable from "./DataTable";
import FormInput from "./FormInput";

const LookupManager = ({ title, subtitle, endpoint, singular }) => {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
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

  const resetForm = () => {
    setName("");
    setEditing(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(`${singular} name is required`);
      return;
    }

    try {
      if (editing) {
        await axiosClient.put(`${endpoint}/${editing.id}`, { name: name.trim() });
      } else {
        await axiosClient.post(endpoint, { name: name.trim() });
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      <section className="card">
        <form className="inline-form" onSubmit={submit}>
          <FormInput
            label={`${singular} Name`}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="inline-form-actions">
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
            {
              header: "Actions",
              render: (row) => (
                <div className="actions">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Edit"
                    onClick={() => {
                      setEditing(row);
                      setName(row.name || "");
                    }}
                  >
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

export default LookupManager;
