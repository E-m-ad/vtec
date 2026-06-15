import { CarFront, Edit, Eye, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import FormInput from "../components/FormInput";
import SearchInput from "../components/SearchInput";
import SearchableSelect from "../components/SearchableSelect";
import { normalizePlateNumber } from "../utils/plateNumber";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const initialForm = {
  customer_id: "",
  plate_number: "",
  make: "",
  model: "",
  year: "",
  color: "",
  vin: "",
  notes: "",
};

const customerDescription = (customer) => [customer?.phone, customer?.email].filter(Boolean).join(" / ");
const customerSearchText = (customer) =>
  [customer?.name, customer?.phone, customer?.email].filter(Boolean).join(" ");

const Cars = () => {
  const [cars, setCars] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadCars = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get("/cars", {
        params: {
          search: search.trim() || undefined,
          customer_id: ownerFilter || undefined,
        },
      });
      setCars(listFrom(unwrapData(response, [])));
    } catch (err) {
      setError(errorMessage(err, "Unable to load cars"));
    } finally {
      setLoading(false);
    }
  }, [search, ownerFilter]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await axiosClient.get("/customers");
        setCustomers(listFrom(unwrapData(response, [])));
      } catch (err) {
        setError(errorMessage(err, "Unable to load customer options"));
      }
    };

    loadOptions();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadCars, 220);
    return () => window.clearTimeout(timer);
  }, [loadCars]);

  const ownedCount = useMemo(
    () => cars.filter((car) => car.customerId || car.customer_id).length,
    [cars],
  );

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "plate_number" ? normalizePlateNumber(value) : value }));
  };

  const updateFormValue = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
  };

  const startEdit = (car) => {
    setEditing(car);
    setForm({
      customer_id: car.customerId || car.customer_id || "",
      plate_number: car.plateNumber || car.plate_number || "",
      make: car.make || "",
      model: car.model || "",
      year: car.year || "",
      color: car.color || "",
      vin: car.vin || "",
      notes: car.notes || "",
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.make.trim()) {
      setError("Car make is required");
      return;
    }

    if (!form.model.trim()) {
      setError("Car model is required");
      return;
    }

    const numericYear = form.year ? Number(form.year) : null;
    if (form.year && (!Number.isInteger(numericYear) || numericYear < 1900)) {
      setError("Enter a valid car year");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      ...form,
      customer_id: form.customer_id ? Number(form.customer_id) : null,
      plate_number: normalizePlateNumber(form.plate_number) || null,
      year: form.year ? numericYear : null,
    };

    try {
      if (editing) {
        await axiosClient.put(`/cars/${editing.id}`, payload);
      } else {
        await axiosClient.post("/cars", payload);
      }

      resetForm();
      await loadCars();
    } catch (err) {
      setError(errorMessage(err, "Unable to save car"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await axiosClient.delete(`/cars/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadCars();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete car"));
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cars</h1>
          <p className="page-subtitle">
            Manage customer cars and open each car to review its service invoice history.
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-info">{ownedCount} with owner</span>
          <span className="badge badge-neutral">{cars.length} shown</span>
        </div>
      </div>

      <section className="card">
        <form className="form partner-form" onSubmit={submit}>
          <div className="form-row">
            <SearchableSelect
              emptyLabel="No owner linked"
              getOptionDescription={customerDescription}
              getOptionLabel={(customer) => customer.name}
              getOptionSearchText={customerSearchText}
              label="Owner"
              onChange={(value) => updateFormValue("customer_id", value)}
              options={customers}
              placeholder="Search owner name or phone"
              value={form.customer_id}
            />
            <FormInput
              label="Plate Number"
              name="plate_number"
              value={form.plate_number}
              onChange={updateField}
              placeholder="أ ط ع - 6 2 1 6"
            />
          </div>
          <div className="form-row">
            <FormInput label="Make" name="make" value={form.make} onChange={updateField} placeholder="Toyota" />
            <FormInput label="Model" name="model" value={form.model} onChange={updateField} placeholder="Corolla" />
          </div>
          <div className="form-row">
            <FormInput label="Year" name="year" type="number" min="1900" value={form.year} onChange={updateField} />
            <FormInput label="Color" name="color" value={form.color} onChange={updateField} />
          </div>
          <div className="form-row">
            <FormInput label="VIN" name="vin" value={form.vin} onChange={updateField} />
            <FormInput label="Notes" name="notes" value={form.notes} onChange={updateField} />
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

        <div className="toolbar">
          <div className="filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Search cars" />
            <SearchableSelect
              className="filter-searchable-select"
              emptyLabel="All owners"
              getOptionDescription={customerDescription}
              getOptionLabel={(customer) => customer.name}
              getOptionSearchText={customerSearchText}
              onChange={setOwnerFilter}
              options={customers}
              placeholder="Search owner"
              value={ownerFilter}
            />
          </div>
        </div>

        {error ? <p className="error-text table-error">{error}</p> : null}

        <DataTable
          loading={loading}
          columns={[
            {
              header: "Plate",
              render: (row) => row.plateNumber || row.plate_number || "-",
            },
            {
              header: "Car",
              render: (row) => (
                <span>
                  {row.make} {row.model} {row.year || ""}
                </span>
              ),
            },
            {
              header: "Owner",
              render: (row) => row.customer?.name || row.customer_name || "-",
            },
            {
              header: "Color",
              render: (row) => row.color || "-",
            },
            {
              header: "VIN",
              render: (row) => row.vin || "-",
            },
            {
              header: "Actions",
              render: (row) => (
                <div className="actions">
                  <Link className="icon-button" to={`/cars/${row.id}`} aria-label="View car history">
                    <Eye size={16} />
                  </Link>
                  <button className="icon-button" type="button" aria-label="Edit car" onClick={() => startEdit(row)}>
                    <Edit size={16} />
                  </button>
                  <button className="icon-button" type="button" aria-label="Delete car" onClick={() => setDeleteTarget(row)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
          data={cars}
          emptyMessage="No cars found"
        />
      </section>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete car"
        message={`Delete ${deleteTarget?.plateNumber || deleteTarget?.plate_number || deleteTarget?.model || "this car"}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Cars;
