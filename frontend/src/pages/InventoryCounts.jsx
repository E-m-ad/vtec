import {
  ArrowLeft,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanBarcode,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import SearchInput from "../components/SearchInput";
import SearchableSelect from "../components/SearchableSelect";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue } from "../utils/fields";
import { normalizePartNumber } from "../utils/partNumber";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const initialForm = {
  scope_type: "all",
  scope_value: "",
  notes: "",
};

const initialMissingProductForm = (code = "", quantity = 1) => ({
  raw_code: code,
  sku: normalizePartNumber(code) || code,
  name: "",
  description: "",
  category_id: "",
  brand_id: "",
  supplier_id: "",
  purchase_price: "0",
  sale_price: "0",
  min_stock_level: "0",
  location: "",
  counted_quantity: String(quantity || 1),
});

const scopeOptions = [
  { value: "all", label: "All active products" },
  { value: "category", label: "Category" },
  { value: "brand", label: "Brand" },
  { value: "supplier", label: "Supplier" },
  { value: "location", label: "Location" },
  { value: "search", label: "Search result" },
];

const statusMeta = {
  counting: { label: "Counting", className: "badge-info" },
  reviewed: { label: "Reviewed", className: "badge-warning" },
  outdated: { label: "Outdated", className: "badge-danger" },
  applied: { label: "Applied", className: "badge-success" },
  cancelled: { label: "Cancelled", className: "badge-danger" },
};

const numberValue = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const InventoryCounts = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const scanInputRef = useRef(null);
  const isDetailsPage = Boolean(id);
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [showCreate, setShowCreate] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanQuantity, setScanQuantity] = useState("1");
  const [itemSearch, setItemSearch] = useState("");
  const [varianceFilter, setVarianceFilter] = useState("all");
  const [drafts, setDrafts] = useState({});
  const [lastScan, setLastScan] = useState(null);
  const [missingProduct, setMissingProduct] = useState(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingItemId, setSavingItemId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError("");

    try {
      const response = await axiosClient.get("/inventory-counts");
      setSessions(listFrom(unwrapData(response, [])));
    } catch (err) {
      setError(errorMessage(err, "Unable to load inventory counts"));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadSession = useCallback(async (id) => {
    if (!id) return;

    setLoadingSession(true);
    setError("");

    try {
      const response = await axiosClient.get(`/inventory-counts/${id}`);
      setSession(unwrapData(response, null));
    } catch (err) {
      setError(errorMessage(err, "Unable to load inventory count"));
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const [categoryResponse, brandResponse, supplierResponse] = await Promise.all([
        axiosClient.get("/categories"),
        axiosClient.get("/brands"),
        axiosClient.get("/suppliers"),
      ]);

      setCategories(listFrom(unwrapData(categoryResponse, [])));
      setBrands(listFrom(unwrapData(brandResponse, [])));
      setSuppliers(listFrom(unwrapData(supplierResponse, [])));
    } catch {
      // The count can still run with all/search/location scopes.
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (isDetailsPage) {
      loadSession(id);
      return;
    }

    loadSessions();
  }, [id, isDetailsPage, loadSession, loadSessions]);

  const items = useMemo(() => listFrom(session?.items || []), [session]);
  const summary = session?.summary || {};
  const activeSession = session && ["counting", "reviewed"].includes(session.status);

  useEffect(() => {
    const nextDrafts = {};

    items.forEach((item) => {
      nextDrafts[item.id] = {
        counted_quantity: item.is_counted ? String(item.counted_quantity ?? 0) : "",
        notes: item.notes || "",
      };
    });

    setDrafts(nextDrafts);
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();

    return items.filter((item) => {
      const variance = item.variance_quantity;
      const matchesFilter =
        varianceFilter === "all" ||
        (varianceFilter === "counted" && item.is_counted) ||
        (varianceFilter === "uncounted" && !item.is_counted) ||
        (varianceFilter === "shortage" && item.is_counted && variance < 0) ||
        (varianceFilter === "extra" && item.is_counted && variance > 0) ||
        (varianceFilter === "matched" && item.is_counted && variance === 0);

      if (!matchesFilter) return false;
      if (!query) return true;

      return [
        item.product_name,
        item.product_sku,
        item.product_barcode,
        item.category_name,
        item.brand_name,
        item.supplier_name,
        item.product_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [itemSearch, items, varianceFilter]);

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "scope_type" ? { scope_value: "" } : {}),
    }));
  };

  const updateDraft = (itemId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        [field]: value,
      },
    }));
  };

  const createSession = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await axiosClient.post("/inventory-counts", form);
      const createdSession = unwrapData(response, null);
      setShowCreate(false);
      setForm(initialForm);
      setMessage("Inventory count started");
      await loadSessions();
      navigate(`/inventory-counts/${createdSession.id}`);
    } catch (err) {
      setError(errorMessage(err, "Unable to create inventory count"));
    } finally {
      setSaving(false);
    }
  };

  const submitScan = async (event) => {
    event.preventDefault();

    if (!activeSession) return;
    const code = scanCode.trim();
    const quantity = Number(scanQuantity || 1);

    if (!code) {
      setError("Scan or enter a product barcode");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Scan quantity must be greater than 0");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    setConflict(null);

    try {
      const response = await axiosClient.post(`/inventory-counts/${session.id}/scan`, {
        code,
        quantity,
      });
      const result = unwrapData(response, null);
      const item = result?.item;
      setMissingProduct(null);
      setLastScan({
        itemId: item?.id,
        previousCountedQuantity: result?.previous_counted_quantity ?? 0,
        notes: item?.notes || "",
        productName: item?.product_name || "Product",
      });
      setScanCode("");
      setMessage(`${item?.product_name || "Product"} counted: ${item?.counted_quantity ?? quantity}`);
      await loadSession(session.id);
      window.setTimeout(() => scanInputRef.current?.focus(), 60);
    } catch (err) {
      if (err?.response?.status === 404) {
        setMissingProduct(initialMissingProductForm(code, quantity));
        setScanCode("");
        setError("Product not found. Create it with stock 0, then it will be added to this count.");
      } else {
        setError(errorMessage(err, "Unable to record scan"));
      }
    } finally {
      setSaving(false);
    }
  };

  const updateMissingProduct = (field, value) => {
    setMissingProduct((current) => ({
      ...(current || initialMissingProductForm()),
      [field]: value,
    }));
  };

  const closeMissingProduct = () => {
    setMissingProduct(null);
    setError("");
    window.setTimeout(() => scanInputRef.current?.focus(), 60);
  };

  const createMissingProduct = async (event) => {
    event.preventDefault();

    if (!activeSession || !missingProduct) return;

    const sku = normalizePartNumber(missingProduct.sku || missingProduct.raw_code);
    const countedQuantity = Number(missingProduct.counted_quantity);
    const purchasePrice = Number(missingProduct.purchase_price || 0);
    const salePrice = Number(missingProduct.sale_price || 0);
    const minStockLevel = Number(missingProduct.min_stock_level || 0);

    if (!sku) {
      setError("Part number is required");
      return;
    }

    if (!missingProduct.name.trim()) {
      setError("Product name is required");
      return;
    }

    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      setError("Counted quantity must be 0 or more");
      return;
    }

    if (
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0 ||
      !Number.isFinite(salePrice) ||
      salePrice < 0 ||
      !Number.isInteger(minStockLevel) ||
      minStockLevel < 0
    ) {
      setError("Prices and minimum stock must be 0 or more");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    setConflict(null);

    try {
      const productResponse = await axiosClient.post("/products", {
        sku,
        part_number: sku,
        name: missingProduct.name.trim(),
        description: missingProduct.description || null,
        category_id: missingProduct.category_id ? Number(missingProduct.category_id) : null,
        brand_id: missingProduct.brand_id ? Number(missingProduct.brand_id) : null,
        supplier_id: missingProduct.supplier_id ? Number(missingProduct.supplier_id) : null,
        purchase_price: purchasePrice,
        cost_price: purchasePrice,
        sale_price: salePrice,
        selling_price: salePrice,
        min_stock_level: minStockLevel,
        min_stock: minStockLevel,
        location: missingProduct.location.trim() || null,
        stock_quantity: 0,
        initial_stock_quantity: 0,
      });
      const product = unwrapData(productResponse, null);

      const itemResponse = await axiosClient.post(`/inventory-counts/${session.id}/items`, {
        product_id: product.id,
        counted_quantity: countedQuantity,
        notes: `Created during inventory count from scan ${missingProduct.raw_code || sku}`,
      });
      const result = unwrapData(itemResponse, null);
      const item = result?.item;

      setLastScan({
        itemId: item?.id,
        previousCountedQuantity: 0,
        notes: item?.notes || "",
        productName: product.name || item?.product_name || "Product",
      });
      setMissingProduct(null);
      setMessage(`${product.name || "Product"} created and counted: ${countedQuantity}`);
      await loadSession(session.id);
      await loadSessions();
      window.setTimeout(() => scanInputRef.current?.focus(), 60);
    } catch (err) {
      setError(errorMessage(err, "Unable to create product from scan"));
    } finally {
      setSaving(false);
    }
  };

  const undoLastScan = async () => {
    if (!activeSession || !lastScan?.itemId) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await axiosClient.put(`/inventory-counts/${session.id}/items/${lastScan.itemId}`, {
        counted_quantity: lastScan.previousCountedQuantity,
        notes: lastScan.notes || null,
      });
      setMessage(`Undo complete for ${lastScan.productName}`);
      setLastScan(null);
      await loadSession(session.id);
    } catch (err) {
      setError(errorMessage(err, "Unable to undo last scan"));
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async (item) => {
    if (!activeSession) return;

    const draft = drafts[item.id] || {};
    const countedQuantity = Number(draft.counted_quantity);

    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      setError("Counted quantity must be 0 or more");
      return;
    }

    setSavingItemId(item.id);
    setError("");
    setMessage("");
    setConflict(null);

    try {
      await axiosClient.put(`/inventory-counts/${session.id}/items/${item.id}`, {
        counted_quantity: countedQuantity,
        notes: draft.notes || null,
      });
      setMessage(`${item.product_name || "Product"} count saved`);
      await loadSession(session.id);
    } catch (err) {
      setError(errorMessage(err, "Unable to save item count"));
    } finally {
      setSavingItemId(null);
    }
  };

  const updateSessionStatus = async (status) => {
    if (!session) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await axiosClient.patch(`/inventory-counts/${session.id}`, { status });
      setSession(unwrapData(response, null));
      setMessage(status === "reviewed" ? "Inventory count reviewed" : "Inventory count updated");
      await loadSessions();
    } catch (err) {
      setError(errorMessage(err, "Unable to update inventory count"));
    } finally {
      setSaving(false);
    }
  };

  const applySession = async (force = false) => {
    if (!session) return;

    setSaving(true);
    setError("");
    setMessage("");
    setConflict(null);

    try {
      const response = await axiosClient.post(`/inventory-counts/${session.id}/apply`, { force });
      setSession(unwrapData(response, null));
      setConfirmApply(false);
      setMessage("Inventory adjustments applied");
      await loadSessions();
    } catch (err) {
      const details = err?.response?.data?.details;
      if (details?.movements_after_start?.length) {
        setConflict(details.movements_after_start);
      }
      setError(errorMessage(err, "Unable to apply inventory count"));
    } finally {
      setSaving(false);
    }
  };

  const cancelSession = async () => {
    if (!session) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await axiosClient.post(`/inventory-counts/${session.id}/cancel`);
      setSession(unwrapData(response, null));
      setConfirmCancel(false);
      setMessage("Inventory count cancelled");
      await loadSessions();
    } catch (err) {
      setError(errorMessage(err, "Unable to cancel inventory count"));
    } finally {
      setSaving(false);
    }
  };

  const deleteSession = async () => {
    if (!deleteTarget) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await axiosClient.delete(`/inventory-counts/${deleteTarget.id}`);
      const deletedSession = unwrapData(response, null);
      const deletedId = deletedSession?.id || deleteTarget.id;
      const deletedNumber =
        deletedSession?.count_number ||
        deletedSession?.countNumber ||
        deleteTarget.count_number ||
        deleteTarget.countNumber ||
        "Inventory count";

      setDeleteTarget(null);
      setSessions((current) => current.filter((item) => item.id !== deletedId));
      setMessage(`${deletedNumber} deleted`);

      if (isDetailsPage) {
        navigate("/inventory-counts");
      } else {
        await loadSessions();
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to delete inventory count"));
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const scopeValueControl = () => {
    if (form.scope_type === "all") return null;

    if (form.scope_type === "category") {
      return (
        <SearchableSelect
          label="Category"
          onChange={(value) => updateForm("scope_value", value)}
          options={categories}
          placeholder="Search category"
          value={form.scope_value}
        />
      );
    }

    if (form.scope_type === "brand") {
      return (
        <SearchableSelect
          label="Brand"
          onChange={(value) => updateForm("scope_value", value)}
          options={brands}
          placeholder="Search brand"
          value={form.scope_value}
        />
      );
    }

    if (form.scope_type === "supplier") {
      return (
        <SearchableSelect
          label="Supplier"
          getOptionDescription={(supplier) => supplier.phone || supplier.email || ""}
          onChange={(value) => updateForm("scope_value", value)}
          options={suppliers}
          placeholder="Search supplier"
          value={form.scope_value}
        />
      );
    }

    return (
      <label className="form-field">
        <span>{form.scope_type === "location" ? "Location" : "Search Text"}</span>
        <input
          className="input"
          value={form.scope_value}
          onChange={(event) => updateForm("scope_value", event.target.value)}
          placeholder={form.scope_type === "location" ? "Shelf / warehouse" : "Product, part number, category"}
        />
      </label>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isDetailsPage
              ? session?.count_number || session?.countNumber || `Inventory Count #${id}`
              : "Inventory Counts"}
          </h1>
          <p className="page-subtitle">
            {isDetailsPage
              ? "Scan, review variance, and apply controlled stock adjustments."
              : "Start and review barcode stock take sessions."}
          </p>
        </div>
        <div className="page-actions">
          {isDetailsPage ? (
            <>
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={() => loadSession(id)}
                disabled={loadingSession}
              >
                Refresh Count
              </Button>
              {session ? (
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={() => setDeleteTarget(session)}
                  disabled={saving}
                >
                  Delete Count
                </Button>
              ) : null}
              <Link className="btn btn-secondary" to="/inventory-counts">
                <ArrowLeft size={17} aria-hidden="true" />
                <span>Back to Sessions</span>
              </Link>
            </>
          ) : (
            <>
              <Button variant="secondary" icon={RefreshCw} onClick={loadSessions} disabled={loadingSessions}>
                Refresh
              </Button>
              <Button icon={Plus} onClick={() => setShowCreate((current) => !current)}>
                New Count
              </Button>
            </>
          )}
        </div>
      </div>

      {!isDetailsPage && showCreate ? (
        <section className="card">
          <div className="section-header">
            <h2>Start Inventory Count</h2>
          </div>
          <form className="form" onSubmit={createSession}>
            <div className="form-row">
              <label className="form-field">
                <span>Scope</span>
                <select
                  className="select"
                  value={form.scope_type}
                  onChange={(event) => updateForm("scope_type", event.target.value)}
                >
                  {scopeOptions.map((scope) => (
                    <option key={scope.value} value={scope.value}>
                      {scope.label}
                    </option>
                  ))}
                </select>
              </label>
              {scopeValueControl()}
            </div>
            <label className="form-field">
              <span>Notes</span>
              <textarea
                className="textarea"
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
              />
            </label>
            <div className="form-actions">
              <Button type="submit" icon={ClipboardCheck} disabled={saving}>
                {saving ? "Starting" : "Start Count"}
              </Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={saving}>
                Close
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {isDetailsPage && conflict?.length ? (
        <section className="card inventory-conflict-card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <AlertTriangle size={18} aria-hidden="true" />
              <h2>Stock Changed During Count</h2>
            </div>
            <Button variant="danger" icon={PackageCheck} onClick={() => applySession(true)} disabled={saving}>
              Force Apply
            </Button>
          </div>
          <DataTable
            columns={[
              { header: "Product", render: (row) => row.product_name || "-" },
              { header: "Part Number", render: (row) => row.product_sku || "-" },
              { header: "Movement", render: (row) => row.movement_type || "-" },
              { header: "Quantity", render: (row) => row.quantity },
              { header: "Date", render: (row) => formatDate(row.created_at) },
            ]}
            data={conflict}
            emptyMessage="No movements found"
          />
        </section>
      ) : null}

      <section className="grid">
        {!isDetailsPage ? (
          <section className="card">
          <div className="section-header">
            <h2>Sessions</h2>
            <span className="badge badge-neutral">{sessions.length} shown</span>
          </div>
          <DataTable
            loading={loadingSessions}
            columns={[
              {
                header: "Count",
                render: (row) => row.count_number || row.countNumber,
              },
              {
                header: "Status",
                render: (row) => {
                  const meta = statusMeta[row.status] || statusMeta.counting;
                  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
                },
              },
              {
                header: "Items",
                render: (row) => firstValue(row.item_count, row.itemCount, 0),
              },
              {
                header: "Started",
                render: (row) => formatDate(firstValue(row.started_at, row.startedAt)),
              },
              {
                header: "Actions",
                render: (row) => (
                  <div className="actions">
                    <Link
                      className="icon-button"
                      to={`/inventory-counts/${row.id}`}
                      aria-label="Open count"
                    >
                      <Eye size={16} />
                    </Link>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Delete count"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ),
              },
            ]}
            data={sessions}
            emptyMessage="No inventory counts found"
          />
          </section>
        ) : null}

        {isDetailsPage ? (
          <section className="card">
          {session ? (
            <>
              <div className="section-header">
                <div>
                  <h2>{session.count_number || session.countNumber}</h2>
                  <p className="muted">
                    {session.scope_type || session.scopeType} count started {formatDate(firstValue(session.started_at, session.startedAt))}
                  </p>
                </div>
                <span className={`badge ${(statusMeta[session.status] || statusMeta.counting).className}`}>
                  {(statusMeta[session.status] || statusMeta.counting).label}
                </span>
              </div>

              {activeSession ? (
                <>
                  <form className="inventory-scan-form" onSubmit={submitScan}>
                    <label className="form-field">
                      <span>Scan Product</span>
                      <input
                        ref={scanInputRef}
                        className="input inventory-scan-input"
                        disabled={saving}
                        value={scanCode}
                        onChange={(event) => setScanCode(event.target.value)}
                        placeholder="Barcode or part number"
                        autoFocus
                      />
                    </label>
                    <label className="form-field inventory-scan-quantity">
                      <span>Qty</span>
                      <input
                        className="input"
                        disabled={saving}
                        min="1"
                        type="number"
                        value={scanQuantity}
                        onChange={(event) => setScanQuantity(event.target.value)}
                      />
                    </label>
                    <Button type="submit" icon={ScanBarcode} disabled={saving}>
                      Add
                    </Button>
                    <Button
                      variant="secondary"
                      icon={RotateCcw}
                      onClick={undoLastScan}
                      disabled={!lastScan || saving}
                    >
                      Undo
                    </Button>
                  </form>

                  <div className="inventory-session-actions">
                    <Button
                      variant="secondary"
                      icon={CheckCircle2}
                      onClick={() => updateSessionStatus("reviewed")}
                      disabled={saving}
                    >
                      Mark Reviewed
                    </Button>
                    <Button
                      icon={PackageCheck}
                      onClick={() => setConfirmApply(true)}
                      disabled={saving || !summary.counted_items}
                    >
                      Apply Adjustments
                    </Button>
                    <Button
                      variant="danger"
                      icon={XCircle}
                      onClick={() => setConfirmCancel(true)}
                      disabled={saving}
                    >
                      Cancel Count
                    </Button>
                  </div>
                </>
              ) : (
                <div className="inventory-readonly-panel">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <span>
                    This session is {statusMeta[session.status]?.label?.toLowerCase() || "read-only"}.
                    You can search and view the snapshot, but scanning and edits are disabled.
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              Select an inventory count or start a new one.
            </div>
          )}
          </section>
        ) : null}
      </section>

      {isDetailsPage && activeSession && missingProduct ? (
        <section className="card inventory-missing-product-card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <PackagePlus size={18} aria-hidden="true" />
              <h2>Create Product From Scan</h2>
            </div>
            <Button variant="secondary" onClick={closeMissingProduct} disabled={saving}>
              Close
            </Button>
          </div>
          <form className="form" onSubmit={createMissingProduct}>
            <div className="inventory-missing-product-summary">
              <span className="badge badge-warning">Not found</span>
              <strong>{missingProduct.raw_code || missingProduct.sku}</strong>
              <span>Stock will start at 0. Counted quantity will be added to this inventory count only.</span>
            </div>

            <div className="form-row">
              <label className="form-field">
                <span>Product Name</span>
                <input
                  className="input"
                  value={missingProduct.name}
                  onChange={(event) => updateMissingProduct("name", event.target.value)}
                  placeholder="Product name"
                />
              </label>
              <label className="form-field">
                <span>Part Number / Barcode</span>
                <input
                  className="input"
                  value={missingProduct.sku}
                  onBlur={() =>
                    updateMissingProduct("sku", normalizePartNumber(missingProduct.sku))
                  }
                  onChange={(event) => updateMissingProduct("sku", event.target.value)}
                  placeholder="Part number"
                />
              </label>
            </div>

            <label className="form-field">
              <span>Description</span>
              <textarea
                className="textarea"
                value={missingProduct.description}
                onChange={(event) => updateMissingProduct("description", event.target.value)}
              />
            </label>

            <div className="form-row">
              <SearchableSelect
                label="Category"
                emptyLabel="No category"
                onChange={(value) => updateMissingProduct("category_id", value)}
                options={categories}
                placeholder="Search category"
                value={missingProduct.category_id}
              />
              <SearchableSelect
                label="Brand"
                emptyLabel="No brand"
                onChange={(value) => updateMissingProduct("brand_id", value)}
                options={brands}
                placeholder="Search brand"
                value={missingProduct.brand_id}
              />
            </div>

            <div className="form-row">
              <SearchableSelect
                label="Supplier"
                emptyLabel="No supplier"
                getOptionDescription={(supplier) => supplier.phone || supplier.email || ""}
                onChange={(value) => updateMissingProduct("supplier_id", value)}
                options={suppliers}
                placeholder="Search supplier"
                value={missingProduct.supplier_id}
              />
              <label className="form-field">
                <span>Location</span>
                <input
                  className="input"
                  value={missingProduct.location}
                  onChange={(event) => updateMissingProduct("location", event.target.value)}
                  placeholder="Shelf / warehouse"
                />
              </label>
            </div>

            <div className="inventory-missing-product-numbers">
              <label className="form-field">
                <span>Cost</span>
                <input
                  className="input"
                  min="0"
                  step="0.01"
                  type="number"
                  value={missingProduct.purchase_price}
                  onChange={(event) => updateMissingProduct("purchase_price", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Selling Price</span>
                <input
                  className="input"
                  min="0"
                  step="0.01"
                  type="number"
                  value={missingProduct.sale_price}
                  onChange={(event) => updateMissingProduct("sale_price", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Min Stock</span>
                <input
                  className="input"
                  min="0"
                  type="number"
                  value={missingProduct.min_stock_level}
                  onChange={(event) => updateMissingProduct("min_stock_level", event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Counted Qty</span>
                <input
                  className="input"
                  min="0"
                  type="number"
                  value={missingProduct.counted_quantity}
                  onChange={(event) => updateMissingProduct("counted_quantity", event.target.value)}
                />
              </label>
            </div>

            <div className="form-actions">
              <Button type="submit" icon={PackagePlus} disabled={saving}>
                {saving ? "Creating" : "Create and Add"}
              </Button>
              <Button variant="secondary" onClick={closeMissingProduct} disabled={saving}>
                Skip
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {isDetailsPage && session ? (
        <>
          <section className="grid grid-4">
            <StatCard
              title="Counted"
              value={summary.counted_items || 0}
              icon={ScanBarcode}
              tone="info"
              subtitle={`${summary.uncounted_items || 0} uncounted`}
            />
            <StatCard
              title="Matched"
              value={summary.matched_items || 0}
              icon={CheckCircle2}
              tone="success"
              subtitle={`${summary.total_items || 0} total lines`}
            />
            <StatCard
              title="Shortage / Extra"
              value={`${summary.shortage_items || 0} / ${summary.extra_items || 0}`}
              icon={Archive}
              tone="warning"
              subtitle={`Qty ${summary.variance_quantity || 0}`}
            />
            <StatCard
              title="Variance Value"
              value={formatCurrency(summary.variance_value || 0)}
              icon={PackageCheck}
              tone="neutral"
            />
          </section>

          <section className="card">
            <div className="toolbar">
              <div className="filters compact-table-filters inventory-table-filters">
                <SearchInput
                  value={itemSearch}
                  onChange={setItemSearch}
                  placeholder="Search counted products"
                />
                <select
                  className="select filter-select"
                  value={varianceFilter}
                  onChange={(event) => setVarianceFilter(event.target.value)}
                >
                  <option value="all">All lines</option>
                  <option value="counted">Counted</option>
                  <option value="uncounted">Uncounted</option>
                  <option value="shortage">Shortage</option>
                  <option value="extra">Extra</option>
                  <option value="matched">Matched</option>
                </select>
              </div>
              <Button variant="secondary" icon={RefreshCw} onClick={() => loadSession(session.id)} disabled={loadingSession}>
                Refresh Count
              </Button>
            </div>

            <DataTable
              loading={loadingSession}
              columns={[
                {
                  header: "Product",
                  render: (row) => (
                    <div className="attendance-employee-cell">
                      <strong>{row.product_name || "-"}</strong>
                      <span>{row.product_sku || row.product_barcode || "-"}</span>
                    </div>
                  ),
                },
                { header: "Location", render: (row) => row.product_location || "-" },
                { header: "System", render: (row) => row.system_quantity_snapshot },
                {
                  header: "Counted",
                  render: (row) =>
                    activeSession ? (
                      <input
                        className="input inventory-counted-input"
                        disabled={savingItemId === row.id}
                        min="0"
                        type="number"
                        value={drafts[row.id]?.counted_quantity ?? ""}
                        onChange={(event) => updateDraft(row.id, "counted_quantity", event.target.value)}
                        placeholder="Not counted"
                      />
                    ) : row.is_counted ? (
                      row.counted_quantity
                    ) : (
                      "-"
                    ),
                },
                {
                  header: "Variance",
                  render: (row) => {
                    if (!row.is_counted) return <span className="badge badge-neutral">Uncounted</span>;
                    const variance = numberValue(row.variance_quantity);
                    const className =
                      variance === 0 ? "badge-success" : variance < 0 ? "badge-danger" : "badge-warning";
                    return <span className={`badge ${className}`}>{variance}</span>;
                  },
                },
                {
                  header: "Value",
                  render: (row) => (row.is_counted ? formatCurrency(row.variance_value || 0) : "-"),
                },
                {
                  header: "Notes",
                  render: (row) =>
                    activeSession ? (
                      <input
                        className="input inventory-notes-input"
                        disabled={savingItemId === row.id}
                        value={drafts[row.id]?.notes ?? ""}
                        onChange={(event) => updateDraft(row.id, "notes", event.target.value)}
                        placeholder="Optional"
                      />
                    ) : (
                      row.notes || "-"
                    ),
                },
                {
                  header: "Actions",
                  render: (row) =>
                    activeSession ? (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Save count"
                        disabled={savingItemId === row.id}
                        onClick={() => saveItem(row)}
                      >
                        <Save size={16} />
                      </button>
                    ) : (
                      "-"
                    ),
                },
              ]}
              data={filteredItems}
              emptyMessage="No count lines found"
            />
          </section>
        </>
      ) : null}

      <ConfirmModal
        isOpen={confirmApply}
        title="Apply inventory adjustments"
        message="This will create stock adjustment movements for counted products only. Uncounted products will not change."
        onConfirm={() => applySession(false)}
        onCancel={() => setConfirmApply(false)}
      />
      <ConfirmModal
        isOpen={confirmCancel}
        title="Cancel inventory count"
        message="Cancel this inventory count? No stock quantities will be changed."
        onConfirm={cancelSession}
        onCancel={() => setConfirmCancel(false)}
      />
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete inventory count"
        message={`Delete ${deleteTarget?.count_number || deleteTarget?.countNumber || "this inventory count"}? Its count lines will be removed.`}
        onConfirm={deleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default InventoryCounts;
