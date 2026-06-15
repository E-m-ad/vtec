import {
  ArrowLeft,
  Boxes,
  CreditCard,
  Eye,
  FileSpreadsheet,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  Truck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import FormInput from "../components/FormInput";
import LoadingSpinner from "../components/LoadingSpinner";
import PaymentSplitInput, { normalizePaymentsPayload, paymentTotal } from "../components/PaymentSplitInput";
import SearchableSelect from "../components/SearchableSelect";
import StatCard from "../components/StatCard";
import TablePagination from "../components/TablePagination";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import {
  firstValue,
  getProductBrandName,
  getProductCategoryName,
  getProductCost,
  getProductSku,
  getProductStock,
} from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import { getUser } from "../utils/storage";

const initialSettlementForm = {
  product_id: "",
  quantity: "1",
  unit_cost: "",
  settlement_date: new Date().toISOString().slice(0, 10),
  notes: "",
};
const createOpeningBalanceForm = () => ({
  type: "payable",
  amount: "",
  balance_date: new Date().toISOString().slice(0, 10),
  notes: "",
});
const createPaymentRow = () => ({ amount: "", payment_method: "cash", custom_method: "", notes: "" });
const createRefundForm = () => ({
  type: "credit_note",
  amount: "",
  refund_date: new Date().toISOString().slice(0, 10),
  payment_method: "cash",
  notes: "",
});
const supplierProductPageSizeOptions = [10, 25, 50];
const emptySupplierProductsPagination = {
  total: 0,
  limit: 10,
  offset: 0,
  page: 1,
  page_count: 1,
  has_previous: false,
  has_next: false,
};
const supplierTabs = [
  { id: "overview", label: "Overview" },
  { id: "products", label: "Products" },
  { id: "invoices", label: "Invoices" },
  { id: "balances", label: "Balances" },
  { id: "archive", label: "Archive" },
];

const money = (...values) => Number(firstValue(...values, 0) ?? 0);
const formatBytes = (value) => {
  const bytes = Number(value || 0);

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const supplierProductUnitCost = (product) => {
  const purchasedQuantity = money(product?.purchased_quantity, product?.purchasedQuantity);
  const purchasedValue = money(product?.purchased_value, product?.purchasedValue);

  return purchasedQuantity > 0 ? purchasedValue / purchasedQuantity : 0;
};
const openingBalanceTypeLabel = (type) => (type === "credit" ? "Supplier Credit" : "Payable");
const supplierRefundTypeLabel = (type) => (type === "cash_refund" ? "Cash Refund Received" : "Credit Note");

const productLabel = (product) => {
  const sku = getProductSku(product);
  return `${product?.name || "Product"}${sku ? ` - ${sku}` : ""}`;
};
const productDescription = (product) =>
  [
    getProductCategoryName(product),
    getProductBrandName(product),
    `Stock: ${getProductStock(product)}`,
    `Cost: ${formatCurrency(getProductCost(product))}`,
  ]
    .filter(Boolean)
    .join(" / ");
const productSearchText = (product) =>
  [productLabel(product), getProductCategoryName(product), getProductBrandName(product)]
    .filter(Boolean)
    .join(" ");

const SupplierDetails = () => {
  const { id } = useParams();
  const user = getUser();
  const legacyFileInputRef = useRef(null);
  const canManageLegacyArchive = ["admin", "manager"].includes(user?.role);
  const canManageOpeningBalances = ["admin", "manager"].includes(user?.role);
  const [details, setDetails] = useState(null);
  const [products, setProducts] = useState([]);
  const [supplierProducts, setSupplierProducts] = useState([]);
  const [supplierProductsLoading, setSupplierProductsLoading] = useState(false);
  const [supplierProductsError, setSupplierProductsError] = useState("");
  const [supplierProductPage, setSupplierProductPage] = useState(1);
  const [supplierProductPageSize, setSupplierProductPageSize] = useState(10);
  const [supplierProductsPagination, setSupplierProductsPagination] = useState(emptySupplierProductsPagination);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const [settlementSuccess, setSettlementSuccess] = useState("");
  const [settlementForm, setSettlementForm] = useState(initialSettlementForm);
  const [paymentRows, setPaymentRows] = useState([createPaymentRow()]);
  const [settlementType, setSettlementType] = useState("payment");
  const [refundForm, setRefundForm] = useState(createRefundForm);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");
  const [refundSuccess, setRefundSuccess] = useState("");
  const [openingBalanceForm, setOpeningBalanceForm] = useState(createOpeningBalanceForm);
  const [openingBalanceSaving, setOpeningBalanceSaving] = useState(false);
  const [openingBalanceError, setOpeningBalanceError] = useState("");
  const [openingBalanceSuccess, setOpeningBalanceSuccess] = useState("");
  const [legacyWorkbooks, setLegacyWorkbooks] = useState([]);
  const [legacyWorkbooksLoading, setLegacyWorkbooksLoading] = useState(false);
  const [legacyWorkbookLoading, setLegacyWorkbookLoading] = useState(false);
  const [legacyUploading, setLegacyUploading] = useState(false);
  const [legacyDeleting, setLegacyDeleting] = useState(false);
  const [legacyError, setLegacyError] = useState("");
  const [legacySuccess, setLegacySuccess] = useState("");
  const [selectedLegacyWorkbook, setSelectedLegacyWorkbook] = useState(null);
  const [legacyActiveSheetIndex, setLegacyActiveSheetIndex] = useState(0);
  const [legacyDeleteTarget, setLegacyDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const loadDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const [detailsResponse, productsResponse] = await Promise.all([
        axiosClient.get(`/suppliers/${id}/details`),
        axiosClient.get("/products", { params: { limit: 1000 } }),
      ]);
      setDetails(unwrapData(detailsResponse, null));
      setProducts(listFrom(unwrapData(productsResponse, [])));
    } catch (err) {
      setError(errorMessage(err, "Unable to load supplier details"));
    } finally {
      setLoading(false);
    }
  };

  const loadSupplierProducts = async () => {
    setSupplierProductsLoading(true);
    setSupplierProductsError("");

    try {
      const response = await axiosClient.get(`/suppliers/${id}/products`, {
        params: {
          limit: supplierProductPageSize,
          offset: (supplierProductPage - 1) * supplierProductPageSize,
        },
      });
      const data = unwrapData(response, {});
      const nextPagination = {
        ...emptySupplierProductsPagination,
        limit: supplierProductPageSize,
        ...data?.pagination,
      };

      setSupplierProducts(listFrom(data));
      setSupplierProductsPagination(nextPagination);

      if (nextPagination.page_count && supplierProductPage > nextPagination.page_count) {
        setSupplierProductPage(nextPagination.page_count);
      }
    } catch (err) {
      setSupplierProductsError(errorMessage(err, "Unable to load supplier products"));
    } finally {
      setSupplierProductsLoading(false);
    }
  };

  const loadLegacyWorkbooks = async () => {
    setLegacyWorkbooksLoading(true);
    setLegacyError("");

    try {
      const response = await axiosClient.get(`/suppliers/${id}/legacy-workbooks`);
      const data = unwrapData(response, {});

      setLegacyWorkbooks(Array.isArray(data?.workbooks) ? data.workbooks : []);
    } catch (err) {
      setLegacyError(errorMessage(err, "Unable to load legacy workbooks"));
    } finally {
      setLegacyWorkbooksLoading(false);
    }
  };

  const loadLegacyWorkbook = async (workbookId) => {
    if (String(selectedLegacyWorkbook?.workbook?.id) === String(workbookId)) {
      setSelectedLegacyWorkbook(null);
      setLegacyActiveSheetIndex(0);
      setLegacyError("");
      setLegacySuccess("");
      return;
    }

    setLegacyWorkbookLoading(true);
    setLegacyError("");
    setLegacySuccess("");

    try {
      const response = await axiosClient.get(`/suppliers/${id}/legacy-workbooks/${workbookId}`);
      const data = unwrapData(response, {});

      setSelectedLegacyWorkbook(data);
      setLegacyActiveSheetIndex(0);
    } catch (err) {
      setLegacyError(errorMessage(err, "Unable to open legacy workbook"));
    } finally {
      setLegacyWorkbookLoading(false);
    }
  };

  const uploadLegacyWorkbook = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!/\.xlsx$/i.test(file.name)) {
      setLegacyError("Choose an .xlsx workbook");
      event.target.value = "";
      return;
    }

    setLegacyUploading(true);
    setLegacyError("");
    setLegacySuccess("");

    try {
      const buffer = await file.arrayBuffer();

      await axiosClient.post(`/suppliers/${id}/legacy-workbooks`, buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "X-File-Name": encodeURIComponent(file.name),
        },
      });

      setLegacySuccess(`${file.name} imported`);
      await loadLegacyWorkbooks();
    } catch (err) {
      setLegacyError(errorMessage(err, "Unable to import legacy workbook"));
    } finally {
      setLegacyUploading(false);
      event.target.value = "";
    }
  };

  const confirmLegacyDelete = async () => {
    if (!legacyDeleteTarget) return;

    setLegacyDeleting(true);
    setLegacyError("");
    setLegacySuccess("");

    try {
      await axiosClient.delete(`/suppliers/${id}/legacy-workbooks/${legacyDeleteTarget.id}`);

      if (selectedLegacyWorkbook?.workbook?.id === legacyDeleteTarget.id) {
        setSelectedLegacyWorkbook(null);
      }

      setLegacySuccess(`${firstValue(legacyDeleteTarget.original_file_name, legacyDeleteTarget.originalFileName, "Workbook")} removed`);
      setLegacyDeleteTarget(null);
      await loadLegacyWorkbooks();
    } catch (err) {
      setLegacyError(errorMessage(err, "Unable to remove legacy workbook"));
    } finally {
      setLegacyDeleting(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [id]);

  useEffect(() => {
    loadLegacyWorkbooks();
    setSelectedLegacyWorkbook(null);
  }, [id]);

  useEffect(() => {
    setSupplierProductPage(1);
  }, [id]);

  useEffect(() => {
    loadSupplierProducts();
  }, [id, supplierProductPage, supplierProductPageSize]);

  const supplier = details?.supplier || {};
  const summary = details?.summary || {};
  const purchases = useMemo(() => listFrom(details?.purchases ?? []), [details]);
  const payments = useMemo(() => listFrom(details?.payments ?? []), [details]);
  const refunds = useMemo(
    () => listFrom(details?.refunds ?? details?.supplier_refunds ?? []),
    [details],
  );
  const purchaseReturns = useMemo(
    () => listFrom(details?.purchase_returns ?? details?.purchaseReturns ?? []),
    [details],
  );
  const openingBalances = useMemo(
    () => listFrom(details?.opening_balances ?? details?.openingBalances ?? []),
    [details],
  );
  const productSettlements = useMemo(
    () => listFrom(details?.product_settlements ?? details?.productSettlements ?? []),
    [details],
  );
  const supplierProductsTotal = Number(supplierProductsPagination.total || 0);
  const supplierProductsPageCount = Math.max(Number(supplierProductsPagination.page_count || 1), 1);
  const firstSupplierProduct = supplierProductsTotal
    ? Number(supplierProductsPagination.offset || 0) + 1
    : 0;
  const lastSupplierProduct = Math.min(
    Number(supplierProductsPagination.offset || 0) + supplierProducts.length,
    supplierProductsTotal,
  );

  const totalPurchases = money(summary.total_purchases, summary.totalPurchases, supplier.total_purchases, supplier.totalPurchases);
  const totalCashPaid = money(summary.total_cash_paid, summary.totalCashPaid, supplier.total_cash_paid, supplier.totalCashPaid);
  const openingPayable = money(summary.opening_payable, summary.openingPayable, supplier.opening_payable, supplier.openingPayable);
  const openingCredit = money(summary.opening_credit, summary.openingCredit, supplier.opening_credit, supplier.openingCredit);
  const remainingAmount = money(summary.remaining_amount, summary.remainingAmount, supplier.remaining_amount, supplier.remainingAmount);
  const payableAmount = money(summary.payable_amount, summary.payableAmount, Math.max(remainingAmount, 0));
  const creditAmount = money(summary.credit_amount, summary.creditAmount, Math.max(-remainingAmount, 0));
  const supplierCreditNotes = money(summary.supplier_credit_notes, summary.supplierCreditNotes);
  const supplierCashRefunds = money(summary.supplier_cash_refunds, summary.supplierCashRefunds);
  const selectedSettlementProduct = products.find((product) => String(product.id) === String(settlementForm.product_id));
  const settlementQuantity = Number(settlementForm.quantity);
  const settlementUnitCost = Number(settlementForm.unit_cost);
  const settlementAmount =
    Number.isFinite(settlementQuantity) && Number.isFinite(settlementUnitCost)
      ? settlementQuantity * settlementUnitCost
      : 0;
  const selectedLegacySheet = selectedLegacyWorkbook?.sheets?.[legacyActiveSheetIndex] || null;

  const updateSupplierProductPageSize = (event) => {
    setSupplierProductPageSize(Number(event.target.value));
    setSupplierProductPage(1);
  };

  const updateSettlementType = (type) => {
    setSettlementType(type);
    setPaymentError("");
    setPaymentSuccess("");
    setSettlementError("");
    setSettlementSuccess("");
  };

  const updateOpeningBalanceType = (type) => {
    setOpeningBalanceForm((current) => ({ ...current, type }));
    setOpeningBalanceError("");
    setOpeningBalanceSuccess("");
  };

  const updateOpeningBalanceField = (event) => {
    const { name, value } = event.target;
    setOpeningBalanceForm((current) => ({ ...current, [name]: value }));
  };

  const updateRefundField = (event) => {
    const { name, value } = event.target;
    setRefundForm((current) => ({ ...current, [name]: value }));
  };

  const updateRefundType = (type) => {
    setRefundForm((current) => ({ ...current, type }));
    setRefundError("");
    setRefundSuccess("");
  };

  const validateRefund = () => {
    const amount = Number(refundForm.amount);
    const maxAmount = refundForm.type === "cash_refund" ? creditAmount : payableAmount;

    if (!["credit_note", "cash_refund"].includes(refundForm.type)) {
      return "Choose credit note or cash refund";
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return "Amount must be greater than 0";
    }

    if (maxAmount <= 0) {
      return refundForm.type === "cash_refund"
        ? "No supplier credit available to receive as cash"
        : "No payable balance available for a credit note";
    }

    if (amount > maxAmount) {
      return refundForm.type === "cash_refund"
        ? "Cash refund cannot be greater than supplier credit"
        : "Credit note cannot be greater than supplier payable";
    }

    if (!refundForm.refund_date) {
      return "Date is required";
    }

    return "";
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    const validationError = validateRefund();

    if (validationError) {
      setRefundError(validationError);
      setRefundSuccess("");
      return;
    }

    setRefunding(true);
    setRefundError("");
    setRefundSuccess("");

    try {
      const response = await axiosClient.post(`/suppliers/${id}/refunds`, {
        ...refundForm,
        amount: Number(refundForm.amount),
        payment_method: refundForm.type === "cash_refund" ? refundForm.payment_method : null,
      });

      setDetails(unwrapData(response, null));
      setRefundForm(createRefundForm());
      setRefundSuccess("Supplier credit/refund recorded");
    } catch (err) {
      setRefundError(errorMessage(err, "Unable to record supplier credit/refund"));
    } finally {
      setRefunding(false);
    }
  };

  const validateOpeningBalance = () => {
    const amount = Number(openingBalanceForm.amount);

    if (!["payable", "credit"].includes(openingBalanceForm.type)) {
      return "Choose payable or credit";
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return "Opening balance amount must be greater than 0";
    }

    if (!openingBalanceForm.balance_date) {
      return "Opening balance date is required";
    }

    return "";
  };

  const submitOpeningBalance = async (event) => {
    event.preventDefault();
    const validationError = validateOpeningBalance();

    if (validationError) {
      setOpeningBalanceError(validationError);
      setOpeningBalanceSuccess("");
      return;
    }

    setOpeningBalanceSaving(true);
    setOpeningBalanceError("");
    setOpeningBalanceSuccess("");

    try {
      const response = await axiosClient.post(`/suppliers/${id}/opening-balances`, {
        ...openingBalanceForm,
        amount: Number(openingBalanceForm.amount),
      });

      setDetails(unwrapData(response, null));
      setOpeningBalanceForm(createOpeningBalanceForm());
      setOpeningBalanceSuccess("Opening balance recorded");
    } catch (err) {
      setOpeningBalanceError(errorMessage(err, "Unable to record opening balance"));
    } finally {
      setOpeningBalanceSaving(false);
    }
  };

  const validatePayment = () => {
    const amount = paymentTotal(paymentRows);

    if (!Number.isFinite(amount) || amount <= 0) return "Payment amount must be greater than 0";
    if (amount > payableAmount) return "Payment amount cannot be greater than supplier payable balance";

    return "";
  };

  const updateSettlementField = (event) => {
    const { name, value } = event.target;
    setSettlementForm((current) => ({ ...current, [name]: value }));
  };

  const updateSettlementValue = (name, value, option = null) => {
    setSettlementForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "product_id"
        ? {
            unit_cost: option ? String(getProductCost(option)) : "",
          }
        : {}),
    }));
  };

  const validateSettlement = () => {
    if (!settlementForm.product_id) return "Choose a product";
    if (!Number.isInteger(settlementQuantity) || settlementQuantity <= 0) {
      return "Quantity must be a positive integer";
    }
    if (!Number.isFinite(settlementUnitCost) || settlementUnitCost <= 0) {
      return "Unit cost must be greater than 0";
    }
    if (selectedSettlementProduct && settlementQuantity > getProductStock(selectedSettlementProduct)) {
      return "Quantity cannot be greater than current stock";
    }

    return "";
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    const validationError = validatePayment();

    if (validationError) {
      setPaymentError(validationError);
      setPaymentSuccess("");
      return;
    }

    setPaying(true);
    setPaymentError("");
    setPaymentSuccess("");

    const payload = {
      amount: paymentTotal(paymentRows),
      payments: normalizePaymentsPayload(paymentRows),
    };

    try {
      const response = await axiosClient.post(`/suppliers/${id}/payments`, payload);
      setDetails(unwrapData(response, null));
      setPaymentRows([createPaymentRow()]);
      setPaymentSuccess("Payment recorded");
    } catch (err) {
      setPaymentError(errorMessage(err, "Unable to record payment"));
    } finally {
      setPaying(false);
    }
  };

  const submitSettlement = async (event) => {
    event.preventDefault();
    const validationError = validateSettlement();

    if (validationError) {
      setSettlementError(validationError);
      setSettlementSuccess("");
      return;
    }

    setSettling(true);
    setSettlementError("");
    setSettlementSuccess("");

    const payload = {
      product_id: Number(settlementForm.product_id),
      quantity: Number(settlementForm.quantity),
      unit_cost: Number(settlementForm.unit_cost),
      settlement_date: settlementForm.settlement_date,
      notes: settlementForm.notes || null,
    };

    try {
      const response = await axiosClient.post(`/suppliers/${id}/product-settlements`, payload);
      setDetails(unwrapData(response, null));
      setSettlementForm(initialSettlementForm);
      setSettlementSuccess("Product settlement recorded");
    } catch (err) {
      setSettlementError(errorMessage(err, "Unable to record product settlement"));
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{supplier?.name || `Supplier #${id}`}</h1>
          <p className="page-subtitle">Supplier profile, purchase invoices, payments, and remaining balance.</p>
        </div>
        <Link className="btn btn-secondary" to="/suppliers">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Back to Suppliers</span>
        </Link>
      </div>

      {loading ? (
        <section className="card table-state">
          <LoadingSpinner />
        </section>
      ) : error ? (
        <section className="card error-text">{error}</section>
      ) : (
        <>
          <nav className="page-tabs" aria-label="Supplier profile sections">
            {supplierTabs.map((tab) => (
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
              <section className="grid grid-3">
                <StatCard title="Purchased" value={formatCurrency(totalPurchases)} icon={ReceiptText} />
                <StatCard title="Cash Paid" value={formatCurrency(totalCashPaid)} icon={CreditCard} tone="success" />
                <StatCard
                  title={remainingAmount < 0 ? "Supplier Credit" : "Payable"}
                  value={formatCurrency(remainingAmount < 0 ? creditAmount : payableAmount)}
                  icon={Truck}
                  tone={remainingAmount < 0 ? "success" : "warning"}
                />
              </section>

              <section className="card invoice-header-card">
                <div className="invoice-title">
                  <div className="brand-mark">
                    <Truck size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <strong>{supplier.name}</strong>
                    <span>{firstValue(supplier.phone, supplier.email, "-")}</span>
                  </div>
                </div>
                <div className="invoice-meta-grid">
                  <div>
                    <span>Phone</span>
                    <strong>{supplier.phone || "-"}</strong>
                  </div>
                  <div>
                    <span>Email</span>
                    <strong>{supplier.email || "-"}</strong>
                  </div>
                  <div>
                    <span>Address</span>
                    <strong>{supplier.address || "-"}</strong>
                  </div>
                  <div>
                    <span>Tax Number</span>
                    <strong>{firstValue(supplier.tax_number, supplier.taxNumber, "-")}</strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>{formatDate(firstValue(supplier.created_at, supplier.createdAt))}</strong>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === "balances" ? (
            <section className="card">
              <div className="section-header">
                <div>
                  <h2>Opening Balances</h2>
                  <p className="section-subtitle">Legacy payable or credit carried into the new system.</p>
                </div>
                <span className="badge badge-neutral">{openingBalances.length} entries</span>
              </div>
              <div className="invoice-meta-grid">
                <div>
                  <span>Opening Payable</span>
                  <strong>{formatCurrency(openingPayable)}</strong>
                </div>
                <div>
                  <span>Opening Credit</span>
                  <strong>{formatCurrency(openingCredit)}</strong>
                </div>
                <div>
                  <span>Current Payable</span>
                  <strong>{formatCurrency(payableAmount)}</strong>
                </div>
                <div>
                  <span>Supplier Credit</span>
                  <strong>{formatCurrency(creditAmount)}</strong>
                </div>
              </div>

            {canManageOpeningBalances ? (
              <form className="form" onSubmit={submitOpeningBalance}>
                {openingBalanceError ? <p className="error-text">{openingBalanceError}</p> : null}
                {openingBalanceSuccess ? <p className="success-text">{openingBalanceSuccess}</p> : null}
                <div className="mode-toggle" role="group" aria-label="Opening balance type">
                  <button
                    className={`mode-toggle-button ${openingBalanceForm.type === "payable" ? "mode-toggle-button-active" : ""}`}
                    onClick={() => updateOpeningBalanceType("payable")}
                    type="button"
                  >
                    <ReceiptText size={16} aria-hidden="true" />
                    <span>Payable</span>
                  </button>
                  <button
                    className={`mode-toggle-button ${openingBalanceForm.type === "credit" ? "mode-toggle-button-active" : ""}`}
                    onClick={() => updateOpeningBalanceType("credit")}
                    type="button"
                  >
                    <CreditCard size={16} aria-hidden="true" />
                    <span>Credit</span>
                  </button>
                </div>
                <div className="form-row">
                  <FormInput
                    label="Amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalanceForm.amount}
                    onChange={updateOpeningBalanceField}
                  />
                  <FormInput
                    label="Date"
                    name="balance_date"
                    type="date"
                    value={openingBalanceForm.balance_date}
                    onChange={updateOpeningBalanceField}
                  />
                  <FormInput
                    label="Notes"
                    name="notes"
                    value={openingBalanceForm.notes}
                    onChange={updateOpeningBalanceField}
                  />
                </div>
                <div className="form-actions">
                  <Button type="submit" icon={ReceiptText} disabled={openingBalanceSaving}>
                    {openingBalanceSaving ? "Saving" : "Record Opening Balance"}
                  </Button>
                </div>
              </form>
            ) : null}

            <DataTable
              columns={[
                { header: "Date", render: (row) => formatDate(firstValue(row.balance_date, row.balanceDate)) },
                {
                  header: "Type",
                  render: (row) => (
                    <span className={`badge ${row.type === "credit" ? "badge-success" : "badge-warning"}`}>
                      {openingBalanceTypeLabel(row.type)}
                    </span>
                  ),
                },
                { header: "Amount", render: (row) => formatCurrency(row.amount) },
                { header: "Created By", render: (row) => row.creator?.name || "-" },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={openingBalances}
              emptyMessage="No opening balances recorded"
            />
          </section>
          ) : null}

          {activeTab === "archive" ? (
          <section className="card legacy-archive-card">
            <div className="section-header">
              <div>
                <h2>Legacy Excel Archive</h2>
                <p className="section-subtitle">Uploaded workbook history</p>
              </div>
              {canManageLegacyArchive ? (
                <>
                  <input
                    accept=".xlsx"
                    className="visually-hidden"
                    onChange={uploadLegacyWorkbook}
                    ref={legacyFileInputRef}
                    type="file"
                  />
                  <Button
                    icon={Upload}
                    onClick={() => legacyFileInputRef.current?.click()}
                    disabled={legacyUploading}
                  >
                    {legacyUploading ? "Importing" : "Import Excel"}
                  </Button>
                </>
              ) : null}
            </div>

            {legacyError ? <p className="error-text table-error">{legacyError}</p> : null}
            {legacySuccess ? <p className="success-text table-error">{legacySuccess}</p> : null}

            <DataTable
              loading={legacyWorkbooksLoading}
              columns={[
                {
                  header: "File",
                  render: (row) => firstValue(row.original_file_name, row.originalFileName, "-"),
                },
                {
                  header: "Uploaded",
                  render: (row) => formatDate(firstValue(row.uploaded_at, row.uploadedAt)),
                },
                {
                  header: "Uploaded By",
                  render: (row) => row.uploader?.name || "-",
                },
                {
                  header: "Size",
                  render: (row) => formatBytes(firstValue(row.file_size_bytes, row.fileSizeBytes, 0)),
                },
                {
                  header: "Sheets",
                  render: (row) => firstValue(row.sheet_count, row.sheetCount, 0),
                },
                {
                  header: "Actions",
                  render: (row) => {
                    const isOpen = String(selectedLegacyWorkbook?.workbook?.id) === String(row.id);

                    return (
                      <div className="actions">
                        <Button
                          className="btn-small"
                          icon={Eye}
                          onClick={() => loadLegacyWorkbook(row.id)}
                          variant="secondary"
                          disabled={legacyWorkbookLoading}
                        >
                          {isOpen ? "Hide" : "View"}
                        </Button>
                        {canManageLegacyArchive ? (
                          <button
                            aria-label="Delete legacy workbook"
                            className="icon-button"
                            disabled={legacyDeleting}
                            onClick={() => setLegacyDeleteTarget(row)}
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </div>
                    );
                  },
                },
              ]}
              data={legacyWorkbooks}
              emptyMessage="No legacy workbooks imported"
            />

            {legacyWorkbookLoading ? (
              <div className="table-state legacy-workbook-loading">
                <LoadingSpinner />
              </div>
            ) : selectedLegacyWorkbook ? (
              <div className="legacy-workbook-viewer">
                <div className="legacy-workbook-toolbar">
                  <div className="section-title-with-icon">
                    <FileSpreadsheet size={17} aria-hidden="true" />
                    <strong>
                      {firstValue(
                        selectedLegacyWorkbook.workbook?.original_file_name,
                        selectedLegacyWorkbook.workbook?.originalFileName,
                        "Workbook",
                      )}
                    </strong>
                  </div>
                  <div className="legacy-sheet-tabs">
                    {selectedLegacyWorkbook.sheets.map((sheet, index) => (
                      <button
                        className={`legacy-sheet-tab ${index === legacyActiveSheetIndex ? "legacy-sheet-tab-active" : ""}`}
                        key={sheet.name}
                        onClick={() => setLegacyActiveSheetIndex(index)}
                        type="button"
                      >
                        {sheet.name}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedLegacySheet ? (
                  <div className="legacy-grid-wrapper">
                    <table className="legacy-grid-table">
                      <thead>
                        <tr>
                          <th className="legacy-row-number">#</th>
                          {selectedLegacySheet.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLegacySheet.rows.map((row) => (
                          <tr key={row.row_number || row.rowNumber}>
                            <th className="legacy-row-number">{firstValue(row.row_number, row.rowNumber)}</th>
                            {row.cells.map((cell, index) => (
                              <td dir="auto" key={`${firstValue(row.row_number, row.rowNumber)}-${index}`}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState message="No sheet rows found" />
                )}
              </div>
            ) : null}
          </section>
          ) : null}

          {activeTab === "products" ? (
          <section className="card supplier-products-card">
            <div className="section-header supplier-products-header">
              <div>
                <h2>Products Received / Sent With Supplier</h2>
                <p className="section-subtitle">Received comes from purchase lines; sent comes from product settlements.</p>
              </div>
              <label className="products-page-size">
                <span>Rows</span>
                <select
                  className="select"
                  value={supplierProductPageSize}
                  onChange={updateSupplierProductPageSize}
                >
                  {supplierProductPageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {supplierProductsError ? <p className="error-text table-error">{supplierProductsError}</p> : null}
            <DataTable
              className="supplier-products-data-table"
              columns={[
                {
                  header: "Product",
                  render: (row) => (
                    <div className="product-cell">
                      <Boxes size={16} aria-hidden="true" />
                      <div>
                        <Link className="text-link" to={`/products/${row.id}/edit`}>
                          {row.name || "Product"}
                        </Link>
                        <span>{getProductSku(row) || "-"}</span>
                      </div>
                    </div>
                  ),
                },
                { header: "Category", render: (row) => getProductCategoryName(row) || "-" },
                { header: "Brand", render: (row) => getProductBrandName(row) || "-" },
                { header: "Received Qty", render: (row) => firstValue(row.purchased_quantity, row.purchasedQuantity, 0) },
                {
                  header: "Unit Cost",
                  render: (row) => formatCurrency(supplierProductUnitCost(row)),
                },
                {
                  header: "Received Value",
                  render: (row) => formatCurrency(firstValue(row.purchased_value, row.purchasedValue, 0)),
                },
                { header: "Sent Qty", render: (row) => firstValue(row.sent_quantity, row.sentQuantity, 0) },
                {
                  header: "Sent Value",
                  render: (row) => formatCurrency(firstValue(row.sent_value, row.sentValue, 0)),
                },
                {
                  header: "Invoices",
                  render: (row) => {
                    const invoices = listFrom(row.invoices ?? []);

                    if (!invoices.length) return "-";

                    return (
                      <div className="supplier-product-invoice-list">
                        {invoices.map((invoice) => (
                          <Link className="text-link" key={invoice.id} to={`/purchases/${invoice.id}`}>
                            {firstValue(invoice.invoice_number, invoice.invoiceNumber, `Purchase #${invoice.id}`)}
                          </Link>
                        ))}
                      </div>
                    );
                  },
                },
                { header: "Stock Now", render: (row) => getProductStock(row) },
              ]}
              data={supplierProducts}
              loading={supplierProductsLoading}
              emptyMessage="No products bought from this supplier"
            />
            <TablePagination
              firstItem={firstSupplierProduct}
              itemLabel="products"
              lastItem={lastSupplierProduct}
              loading={supplierProductsLoading}
              onPageChange={setSupplierProductPage}
              page={supplierProductPage}
              pageCount={supplierProductsPageCount}
              total={supplierProductsTotal}
            />
          </section>
          ) : null}

          {activeTab === "overview" ? (
          <>
          <section className="card supplier-settlement-card">
            <div className="section-header supplier-settlement-header">
              <div>
                <h2>Record Supplier Settlement</h2>
                <p className="section-subtitle">Choose cash payment or product settlement.</p>
              </div>
              <div className="mode-toggle" role="group" aria-label="Settlement type">
                <button
                  className={`mode-toggle-button ${settlementType === "payment" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => updateSettlementType("payment")}
                  type="button"
                >
                  <CreditCard size={16} aria-hidden="true" />
                  <span>Cash Payment</span>
                </button>
                <button
                  className={`mode-toggle-button ${settlementType === "product" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => updateSettlementType("product")}
                  type="button"
                >
                  <PackageCheck size={16} aria-hidden="true" />
                  <span>Product Settlement</span>
                </button>
              </div>
            </div>

            <form
              className="form"
              onSubmit={settlementType === "payment" ? submitPayment : submitSettlement}
            >
              {settlementType === "payment" ? (
                <>
                  {paymentError ? <p className="error-text">{paymentError}</p> : null}
                  {paymentSuccess ? <p className="success-text">{paymentSuccess}</p> : null}
                  <PaymentSplitInput
                    payments={paymentRows}
                    onChange={setPaymentRows}
                    maxAmount={payableAmount}
                    title="Supplier Payment Split"
                    showNotes
                  />
                  <div className="form-actions">
                    <Button type="submit" icon={CreditCard} disabled={paying || payableAmount <= 0}>
                      {paying ? "Saving" : "Record Payment"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {settlementError ? <p className="error-text">{settlementError}</p> : null}
                  {settlementSuccess ? <p className="success-text">{settlementSuccess}</p> : null}
                  <div className="form-row">
                    <SearchableSelect
                      getOptionDescription={productDescription}
                      getOptionLabel={productLabel}
                      getOptionSearchText={productSearchText}
                      label="Product"
                      onChange={(value, option) => updateSettlementValue("product_id", value, option)}
                      options={products}
                      placeholder="Search product"
                      value={settlementForm.product_id}
                    />
                  </div>
                  <div className="form-row">
                    <FormInput
                      label="Quantity"
                      name="quantity"
                      type="number"
                      min="1"
                      value={settlementForm.quantity}
                      onChange={updateSettlementField}
                    />
                    <FormInput
                      label="Unit Cost"
                      name="unit_cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={settlementForm.unit_cost}
                      onChange={updateSettlementField}
                    />
                    <FormInput
                      label="Date"
                      name="settlement_date"
                      type="date"
                      value={settlementForm.settlement_date}
                      onChange={updateSettlementField}
                    />
                  </div>
                  <div className="form-row">
                    <FormInput
                      label="Notes"
                      name="notes"
                      value={settlementForm.notes}
                      onChange={updateSettlementField}
                    />
                    <label className="form-field">
                      <span>Settlement Value</span>
                      <strong className="input readonly-input">{formatCurrency(settlementAmount)}</strong>
                    </label>
                  </div>
                  <div className="form-actions">
                    <Button type="submit" icon={PackageCheck} disabled={settling}>
                      {settling ? "Saving" : "Record Product Settlement"}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </section>

          <section className="card">
            <div className="section-header">
              <div>
                <h2>Supplier Credit / Refund</h2>
                <p className="section-subtitle">Record supplier credit notes or cash received against existing supplier credit.</p>
              </div>
              <div className="mode-toggle" role="group" aria-label="Supplier credit or refund type">
                <button
                  className={`mode-toggle-button ${refundForm.type === "credit_note" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => updateRefundType("credit_note")}
                  type="button"
                >
                  <ReceiptText size={16} aria-hidden="true" />
                  <span>Credit Note</span>
                </button>
                <button
                  className={`mode-toggle-button ${refundForm.type === "cash_refund" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => updateRefundType("cash_refund")}
                  type="button"
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  <span>Cash Refund</span>
                </button>
              </div>
            </div>
            <form className="form" onSubmit={submitRefund}>
              {refundError ? <p className="error-text">{refundError}</p> : null}
              {refundSuccess ? <p className="success-text">{refundSuccess}</p> : null}
              <div className="invoice-meta-grid">
                <div>
                  <span>Credit Notes</span>
                  <strong>{formatCurrency(supplierCreditNotes)}</strong>
                </div>
                <div>
                  <span>Cash Refunds</span>
                  <strong>{formatCurrency(supplierCashRefunds)}</strong>
                </div>
                <div>
                  <span>{refundForm.type === "cash_refund" ? "Available Credit" : "Available Payable"}</span>
                  <strong>{formatCurrency(refundForm.type === "cash_refund" ? creditAmount : payableAmount)}</strong>
                </div>
              </div>
              <div className="form-row">
                <FormInput
                  label="Amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundForm.amount}
                  onChange={updateRefundField}
                />
                <FormInput
                  label="Date"
                  name="refund_date"
                  type="date"
                  value={refundForm.refund_date}
                  onChange={updateRefundField}
                />
                {refundForm.type === "cash_refund" ? (
                  <FormInput
                    label="Method"
                    name="payment_method"
                    value={refundForm.payment_method}
                    onChange={updateRefundField}
                  />
                ) : null}
                <FormInput
                  label="Notes"
                  name="notes"
                  value={refundForm.notes}
                  onChange={updateRefundField}
                />
              </div>
              <div className="form-actions">
                <Button
                  type="submit"
                  icon={refundForm.type === "cash_refund" ? RotateCcw : ReceiptText}
                  disabled={refunding || (refundForm.type === "cash_refund" ? creditAmount <= 0 : payableAmount <= 0)}
                >
                  {refunding ? "Saving" : refundForm.type === "cash_refund" ? "Record Cash Refund" : "Record Credit Note"}
                </Button>
              </div>
            </form>
          </section>
          </>
          ) : null}

          {activeTab === "invoices" ? (
          <section className="card">
            <div className="section-header">
              <h2>Purchased Invoices</h2>
            </div>
            <DataTable
              columns={[
                { header: "Invoice", render: (row) => firstValue(row.invoice_number, row.invoiceNumber, `Purchase #${row.id}`) },
                { header: "Date", render: (row) => formatDate(firstValue(row.purchase_date, row.purchaseDate)) },
                { header: "Total", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount, 0)) },
                { header: "Paid", render: (row) => formatCurrency(firstValue(row.paid_amount, row.paidAmount, 0)) },
                { header: "Remaining", render: (row) => formatCurrency(firstValue(row.remaining_amount, row.remainingAmount, 0)) },
                {
                  header: "Actions",
                  render: (row) => (
                    <Link className="btn btn-secondary btn-small" to={`/purchases/${row.id}`}>
                      <Eye size={15} aria-hidden="true" />
                      <span>View</span>
                    </Link>
                  ),
                },
              ]}
              data={purchases}
              emptyMessage="No purchase invoices found"
            />
          </section>
          ) : null}

          {activeTab === "balances" ? (
          <section className="card">
            <div className="section-header">
              <h2>Payment History</h2>
            </div>
            <DataTable
              columns={[
                { header: "Date", render: (row) => formatDate(firstValue(row.payment_date, row.paymentDate)) },
                { header: "Amount", render: (row) => formatCurrency(row.amount) },
                { header: "Method", render: (row) => firstValue(row.payment_method, row.paymentMethod, "-") },
                {
                  header: "Invoice",
                  render: (row) =>
                    row.purchaseId || row.purchase_id ? (
                      <Link className="text-link" to={`/purchases/${firstValue(row.purchase_id, row.purchaseId)}`}>
                        {firstValue(row.purchase?.invoiceNumber, `Purchase #${firstValue(row.purchase_id, row.purchaseId)}`)}
                      </Link>
                    ) : (
                      "-"
                    ),
                },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={payments}
              emptyMessage="No supplier payments found"
            />
          </section>
          ) : null}

          {activeTab === "balances" ? (
          <section className="card">
            <div className="section-header">
              <h2>Supplier Credit / Refund History</h2>
              <span className="badge badge-neutral">{refunds.length} entries</span>
            </div>
            <DataTable
              columns={[
                { header: "Date", render: (row) => formatDate(firstValue(row.refund_date, row.refundDate)) },
                {
                  header: "Type",
                  render: (row) => (
                    <span className={`badge ${row.type === "cash_refund" ? "badge-success" : "badge-info"}`}>
                      {supplierRefundTypeLabel(row.type)}
                    </span>
                  ),
                },
                { header: "Amount", render: (row) => formatCurrency(row.amount) },
                { header: "Method", render: (row) => firstValue(row.payment_method, row.paymentMethod, "-") },
                {
                  header: "Invoice",
                  render: (row) =>
                    row.purchaseId || row.purchase_id ? (
                      <Link className="text-link" to={`/purchases/${firstValue(row.purchase_id, row.purchaseId)}`}>
                        {firstValue(row.purchase?.invoiceNumber, `Purchase #${firstValue(row.purchase_id, row.purchaseId)}`)}
                      </Link>
                    ) : (
                      "Account"
                    ),
                },
                { header: "Created By", render: (row) => row.creator?.name || "-" },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={refunds}
              emptyMessage="No supplier credits or refunds found"
            />
          </section>
          ) : null}

          {activeTab === "invoices" ? (
          <section className="card">
            <div className="section-header">
              <h2>Purchase Return History</h2>
              <span className="badge badge-neutral">{purchaseReturns.length} returns</span>
            </div>
            <DataTable
              columns={[
                { header: "Return", render: (row) => firstValue(row.return_number, row.returnNumber, `Return #${row.id}`) },
                { header: "Date", render: (row) => formatDate(firstValue(row.return_date, row.returnDate)) },
                { header: "Amount", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount, 0)) },
                {
                  header: "Invoice",
                  render: (row) =>
                    row.purchaseId || row.purchase_id ? (
                      <Link className="text-link" to={`/purchases/${firstValue(row.purchase_id, row.purchaseId)}`}>
                        {firstValue(row.purchase?.invoiceNumber, `Purchase #${firstValue(row.purchase_id, row.purchaseId)}`)}
                      </Link>
                    ) : (
                      "-"
                    ),
                },
                { header: "Created By", render: (row) => row.creator?.name || "-" },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={purchaseReturns}
              emptyMessage="No purchase returns found"
            />
          </section>
          ) : null}

          {activeTab === "balances" ? (
          <section className="card">
            <div className="section-header">
              <h2>Product Settlement History</h2>
            </div>
            <DataTable
              columns={[
                { header: "Date", render: (row) => formatDate(firstValue(row.settlement_date, row.settlementDate)) },
                {
                  header: "Product",
                  render: (row) =>
                    [
                      firstValue(row.product?.name, "-"),
                      firstValue(row.product?.sku, ""),
                    ]
                      .filter(Boolean)
                      .join(" - "),
                },
                { header: "Qty", render: (row) => firstValue(row.quantity, 0) },
                { header: "Unit Cost", render: (row) => formatCurrency(firstValue(row.unit_cost, row.unitCost, 0)) },
                { header: "Value", render: (row) => formatCurrency(row.amount) },
                {
                  header: "Invoice",
                  render: (row) =>
                    row.purchaseId || row.purchase_id ? (
                      <Link className="text-link" to={`/purchases/${firstValue(row.purchase_id, row.purchaseId)}`}>
                        {firstValue(row.purchase?.invoiceNumber, `Purchase #${firstValue(row.purchase_id, row.purchaseId)}`)}
                      </Link>
                    ) : (
                      "Oldest unpaid"
                    ),
                },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={productSettlements}
              emptyMessage="No product settlements found"
            />
          </section>
          ) : null}
        </>
      )}
      <ConfirmModal
        isOpen={Boolean(legacyDeleteTarget)}
        title="Remove legacy workbook"
        message={`Remove ${firstValue(legacyDeleteTarget?.original_file_name, legacyDeleteTarget?.originalFileName, "this workbook")}?`}
        onConfirm={confirmLegacyDelete}
        onCancel={() => setLegacyDeleteTarget(null)}
      />
    </div>
  );
};

export default SupplierDetails;
