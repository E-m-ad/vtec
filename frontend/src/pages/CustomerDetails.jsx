import { ArrowLeft, CarFront, CreditCard, Eye, ReceiptText, RotateCcw, UserRound, WalletCards, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import FormInput from "../components/FormInput";
import LoadingSpinner from "../components/LoadingSpinner";
import PaymentSplitInput, { normalizePaymentsPayload, paymentTotal } from "../components/PaymentSplitInput";
import SearchableSelect from "../components/SearchableSelect";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue, getCarLabel } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import { getUser } from "../utils/storage";

const money = (...values) => Number(firstValue(...values, 0) ?? 0);
const createPaymentRow = () => ({ amount: "", payment_method: "cash", custom_method: "", notes: "" });
const createOpeningBalanceForm = () => ({
  type: "receivable",
  amount: "",
  balance_date: new Date().toISOString().slice(0, 10),
  notes: "",
});
const createRefundForm = () => ({
  sale_id: "",
  amount: "",
  refund_date: new Date().toISOString().slice(0, 10),
  payment_method: "cash",
  notes: "",
});
const openingBalanceTypeLabel = (type) => (type === "credit" ? "Customer Credit" : "Receivable");
const customerTabs = [
  { id: "overview", label: "Overview" },
  { id: "invoices", label: "Invoices" },
  { id: "vehicles", label: "Vehicles" },
  { id: "balances", label: "Balances" },
];

const saleLabel = (sale) =>
  `${firstValue(sale.sale_number, sale.saleNumber, `Sale #${sale.id}`)} - ${formatCurrency(
    firstValue(sale.remaining_amount, sale.remainingAmount, 0),
  )}`;

const saleDescription = (sale) =>
  [
    formatDate(firstValue(sale.sale_date, sale.saleDate)),
    `Net: ${formatCurrency(firstValue(sale.net_total_amount, sale.netTotalAmount, sale.total_amount, sale.totalAmount, 0))}`,
    `Paid: ${formatCurrency(firstValue(sale.paid_amount, sale.paidAmount, 0))}`,
  ]
    .filter(Boolean)
    .join(" / ");

const saleSearchText = (sale) =>
  [
    firstValue(sale.sale_number, sale.saleNumber, `Sale #${sale.id}`),
    formatDate(firstValue(sale.sale_date, sale.saleDate)),
    firstValue(sale.total_amount, sale.totalAmount, ""),
  ]
    .filter(Boolean)
    .join(" ");

const refundSaleLabel = (sale) =>
  `${firstValue(sale.sale_number, sale.saleNumber, `Sale #${sale.id}`)} - credit ${formatCurrency(
    firstValue(sale.credit_amount, sale.creditAmount, 0),
  )}`;

const CustomerDetails = () => {
  const { id } = useParams();
  const user = getUser();
  const canManageOpeningBalances = ["admin", "manager"].includes(user?.role);
  const [details, setDetails] = useState(null);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [paymentRows, setPaymentRows] = useState([createPaymentRow()]);
  const [accountPaymentRows, setAccountPaymentRows] = useState([createPaymentRow()]);
  const [paymentType, setPaymentType] = useState("invoice");
  const [openingBalanceForm, setOpeningBalanceForm] = useState(createOpeningBalanceForm);
  const [refundForm, setRefundForm] = useState(createRefundForm);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [openingBalanceSaving, setOpeningBalanceSaving] = useState(false);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [refundError, setRefundError] = useState("");
  const [refundSuccess, setRefundSuccess] = useState("");
  const [openingBalanceError, setOpeningBalanceError] = useState("");
  const [openingBalanceSuccess, setOpeningBalanceSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const loadDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get(`/customers/${id}/details`);
      const data = unwrapData(response, null);

      setDetails(data);
      const unpaidSales = listFrom(data?.unpaid_sales ?? data?.unpaidSales ?? []);
      setSelectedSaleId((current) =>
        current && unpaidSales.some((sale) => String(sale.id) === String(current))
          ? current
          : String(unpaidSales[0]?.id || ""),
      );
    } catch (err) {
      setError(errorMessage(err, "Unable to load customer details"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [id]);

  const customer = details?.customer || {};
  const summary = details?.summary || {};
  const sales = useMemo(() => listFrom(details?.sales ?? []), [details]);
  const unpaidSales = useMemo(
    () => listFrom(details?.unpaid_sales ?? details?.unpaidSales ?? []),
    [details],
  );
  const cars = useMemo(() => listFrom(details?.cars ?? []), [details]);
  const serviceJobs = useMemo(
    () => listFrom(details?.service_jobs ?? details?.serviceJobs ?? []),
    [details],
  );
  const payments = useMemo(() => listFrom(details?.payments ?? []), [details]);
  const refunds = useMemo(
    () => listFrom(details?.refunds ?? details?.customer_refunds ?? []),
    [details],
  );
  const openingBalances = useMemo(
    () => listFrom(details?.opening_balances ?? details?.openingBalances ?? []),
    [details],
  );
  const selectedSale = unpaidSales.find((sale) => String(sale.id) === String(selectedSaleId));
  const selectedSaleRemaining = money(selectedSale?.remaining_amount, selectedSale?.remainingAmount);
  const totalSales = money(summary.total_sales, summary.totalSales, customer.total_sales, customer.totalSales);
  const totalPaid = money(summary.total_paid, summary.totalPaid, customer.total_paid, customer.totalPaid);
  const openingReceivable = money(summary.opening_receivable, summary.openingReceivable, customer.opening_receivable, customer.openingReceivable);
  const openingCredit = money(summary.opening_credit, summary.openingCredit, customer.opening_credit, customer.openingCredit);
  const accountPayments = money(summary.account_payments, summary.accountPayments, customer.account_payments, customer.accountPayments);
  const openingBalanceRemaining = money(
    summary.opening_balance_remaining,
    summary.openingBalanceRemaining,
    customer.opening_balance_remaining,
    customer.openingBalanceRemaining,
  );
  const receivableAmount = money(
    summary.receivable_amount,
    summary.receivableAmount,
    customer.receivable_amount,
    customer.receivableAmount,
  );
  const creditAmount = money(
    summary.credit_amount,
    summary.creditAmount,
    customer.credit_amount,
    customer.creditAmount,
  );
  const refundableSales = useMemo(
    () => sales.filter((sale) => money(sale.credit_amount, sale.creditAmount) > 0),
    [sales],
  );
  const selectedRefundSale = refundableSales.find((sale) => String(sale.id) === String(refundForm.sale_id));
  const selectedRefundCredit = money(selectedRefundSale?.credit_amount, selectedRefundSale?.creditAmount);

  const validatePayment = () => {
    const amount = paymentTotal(paymentType === "account" ? accountPaymentRows : paymentRows);

    if (paymentType === "account") {
      if (openingBalanceRemaining <= 0) return "No opening balance remaining to pay";
      if (!Number.isFinite(amount) || amount <= 0) return "Payment amount must be greater than 0";
      if (amount > openingBalanceRemaining) return "Payment cannot be greater than opening balance remaining amount";

      return "";
    }

    if (!selectedSaleId) return "Choose an unpaid invoice";
    if (!Number.isFinite(amount) || amount <= 0) return "Payment amount must be greater than 0";
    if (amount > selectedSaleRemaining) return "Payment cannot be greater than selected invoice remaining amount";

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

    try {
      if (paymentType === "account") {
        const accountPaymentsPayload = normalizePaymentsPayload(accountPaymentRows);

        await axiosClient.post(`/customers/${id}/payments`, {
          amount: paymentTotal(accountPaymentRows),
          payments: accountPaymentsPayload,
        });

        setAccountPaymentRows([createPaymentRow()]);
      } else {
        await axiosClient.post(`/sales/${selectedSaleId}/payments`, {
          amount: paymentTotal(paymentRows),
          payments: normalizePaymentsPayload(paymentRows),
        });

        setPaymentRows([createPaymentRow()]);
      }

      setPaymentSuccess("Payment recorded");
      await loadDetails();
    } catch (err) {
      setPaymentError(errorMessage(err, "Unable to record payment"));
    } finally {
      setPaying(false);
    }
  };

  const updatePaymentType = (type) => {
    setPaymentType(type);
    setPaymentError("");
    setPaymentSuccess("");
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

  const updateRefundSale = (value) => {
    setRefundForm((current) => ({ ...current, sale_id: value }));
    setRefundError("");
    setRefundSuccess("");
  };

  const validateRefund = () => {
    const amount = Number(refundForm.amount);
    const maxRefund = refundForm.sale_id ? selectedRefundCredit : creditAmount;

    if (!Number.isFinite(amount) || amount <= 0) return "Refund amount must be greater than 0";
    if (maxRefund <= 0) return "No customer credit available to refund";
    if (amount > maxRefund) return "Refund cannot be greater than available customer credit";
    if (!refundForm.refund_date) return "Refund date is required";

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
      const response = await axiosClient.post(`/customers/${id}/refunds`, {
        ...refundForm,
        sale_id: refundForm.sale_id || null,
        amount: Number(refundForm.amount),
      });

      setDetails(unwrapData(response, null));
      setRefundForm(createRefundForm());
      setRefundSuccess("Customer refund recorded");
    } catch (err) {
      setRefundError(errorMessage(err, "Unable to record customer refund"));
    } finally {
      setRefunding(false);
    }
  };

  const validateOpeningBalance = () => {
    const amount = Number(openingBalanceForm.amount);

    if (!["receivable", "credit"].includes(openingBalanceForm.type)) {
      return "Choose receivable or credit";
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
      const response = await axiosClient.post(`/customers/${id}/opening-balances`, {
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{customer?.name || `Customer #${id}`}</h1>
          <p className="page-subtitle">Customer profile, receivable balance, invoices, cars, and service history.</p>
        </div>
        <Link className="btn btn-secondary" to="/customers">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Back to Customers</span>
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
          <nav className="page-tabs" aria-label="Customer profile sections">
            {customerTabs.map((tab) => (
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
                <StatCard title="Sales" value={formatCurrency(totalSales)} icon={ReceiptText} />
                <StatCard title="Paid" value={formatCurrency(totalPaid)} icon={WalletCards} tone="success" />
                <StatCard title="Receivable" value={formatCurrency(receivableAmount)} icon={CreditCard} tone="warning" />
              </section>

              <section className="card invoice-header-card">
                <div className="invoice-title">
                  <div className="brand-mark">
                    <UserRound size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <strong>{customer.name}</strong>
                    <span>{firstValue(customer.phone, customer.email, "-")}</span>
                  </div>
                </div>
                <div className="invoice-meta-grid">
                  <div>
                    <span>Phone</span>
                    <strong>{customer.phone || "-"}</strong>
                  </div>
                  <div>
                    <span>Email</span>
                    <strong>{customer.email || "-"}</strong>
                  </div>
                  <div>
                    <span>Address</span>
                    <strong>{customer.address || "-"}</strong>
                  </div>
                  <div>
                    <span>Tax Number</span>
                    <strong>{firstValue(customer.tax_number, customer.taxNumber, "-")}</strong>
                  </div>
                  <div>
                    <span>Invoices</span>
                    <strong>{firstValue(summary.invoice_count, summary.invoiceCount, 0)}</strong>
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
                <p className="section-subtitle">Legacy receivable or credit carried into the new system.</p>
              </div>
              <span className="badge badge-neutral">{openingBalances.length} entries</span>
            </div>
            <div className="invoice-meta-grid">
              <div>
                <span>Receivable</span>
                <strong>{formatCurrency(openingReceivable)}</strong>
              </div>
              <div>
                <span>Credit</span>
                <strong>{formatCurrency(openingCredit)}</strong>
              </div>
              <div>
                <span>Account Payments</span>
                <strong>{formatCurrency(accountPayments)}</strong>
              </div>
              <div>
                <span>Opening Remaining</span>
                <strong>{formatCurrency(openingBalanceRemaining)}</strong>
              </div>
            </div>

            {canManageOpeningBalances ? (
              <form className="form" onSubmit={submitOpeningBalance}>
                {openingBalanceError ? <p className="error-text">{openingBalanceError}</p> : null}
                {openingBalanceSuccess ? <p className="success-text">{openingBalanceSuccess}</p> : null}
                <div className="mode-toggle" role="group" aria-label="Opening balance type">
                  <button
                    className={`mode-toggle-button ${openingBalanceForm.type === "receivable" ? "mode-toggle-button-active" : ""}`}
                    onClick={() => updateOpeningBalanceType("receivable")}
                    type="button"
                  >
                    <ReceiptText size={16} aria-hidden="true" />
                    <span>Receivable</span>
                  </button>
                  <button
                    className={`mode-toggle-button ${openingBalanceForm.type === "credit" ? "mode-toggle-button-active" : ""}`}
                    onClick={() => updateOpeningBalanceType("credit")}
                    type="button"
                  >
                    <WalletCards size={16} aria-hidden="true" />
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

          {activeTab === "overview" ? (
          <>
          <section className="card">
            <div className="section-header">
              <div>
                <h2>Record Customer Payment</h2>
                <p className="section-subtitle">
                  {paymentType === "account" ? "Apply payment to opening balance." : "Apply payment to one unpaid invoice."}
                </p>
              </div>
              <div className="mode-toggle" role="group" aria-label="Payment target">
                <button
                  className={`mode-toggle-button ${paymentType === "invoice" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => updatePaymentType("invoice")}
                  type="button"
                >
                  <ReceiptText size={16} aria-hidden="true" />
                  <span>Invoice</span>
                </button>
                <button
                  className={`mode-toggle-button ${paymentType === "account" ? "mode-toggle-button-active" : ""}`}
                  onClick={() => updatePaymentType("account")}
                  type="button"
                >
                  <WalletCards size={16} aria-hidden="true" />
                  <span>Opening Balance</span>
                </button>
              </div>
            </div>
            <form className="form" onSubmit={submitPayment}>
              {paymentError ? <p className="error-text">{paymentError}</p> : null}
              {paymentSuccess ? <p className="success-text">{paymentSuccess}</p> : null}
              {paymentType === "account" ? (
                <>
                  <div className="form-row">
                    <label className="form-field">
                      <span>Opening Remaining</span>
                      <strong className="input readonly-input">{formatCurrency(openingBalanceRemaining)}</strong>
                    </label>
                  </div>
                  <PaymentSplitInput
                    payments={accountPaymentRows}
                    onChange={setAccountPaymentRows}
                    maxAmount={openingBalanceRemaining}
                    title="Opening Balance Payment Split"
                    showNotes
                  />
                  <div className="form-actions">
                    <Button type="submit" icon={CreditCard} disabled={paying || openingBalanceRemaining <= 0}>
                      {paying ? "Saving" : "Record Payment"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-row">
                    <SearchableSelect
                      emptyLabel="Choose unpaid invoice"
                      getOptionDescription={saleDescription}
                      getOptionLabel={saleLabel}
                      getOptionSearchText={saleSearchText}
                      label="Invoice"
                      onChange={setSelectedSaleId}
                      options={unpaidSales}
                      placeholder="Search invoice"
                      value={selectedSaleId}
                    />
                    <label className="form-field">
                      <span>Invoice Remaining</span>
                      <strong className="input readonly-input">{formatCurrency(selectedSaleRemaining)}</strong>
                    </label>
                  </div>
                  <PaymentSplitInput
                    payments={paymentRows}
                    onChange={setPaymentRows}
                    maxAmount={selectedSaleRemaining}
                    title="Customer Payment Split"
                    showNotes
                  />
                  <div className="form-actions">
                    <Button type="submit" icon={CreditCard} disabled={paying || !selectedSaleId || selectedSaleRemaining <= 0}>
                      {paying ? "Saving" : "Record Payment"}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </section>

          <section className="card">
            <div className="section-header">
              <div>
                <h2>Refund Customer</h2>
                <p className="section-subtitle">Pay back available customer credit from returns or overpayment.</p>
              </div>
              <span className={`badge ${creditAmount > 0 ? "badge-success" : "badge-neutral"}`}>
                Credit {formatCurrency(creditAmount)}
              </span>
            </div>
            <form className="form" onSubmit={submitRefund}>
              {refundError ? <p className="error-text">{refundError}</p> : null}
              {refundSuccess ? <p className="success-text">{refundSuccess}</p> : null}
              <div className="form-row">
                <SearchableSelect
                  emptyLabel="Account credit"
                  getOptionDescription={saleDescription}
                  getOptionLabel={refundSaleLabel}
                  getOptionSearchText={saleSearchText}
                  label="Invoice Credit"
                  onChange={updateRefundSale}
                  options={refundableSales}
                  placeholder="Choose invoice credit or leave empty"
                  value={refundForm.sale_id}
                />
                <label className="form-field">
                  <span>Available</span>
                  <strong className="input readonly-input">
                    {formatCurrency(refundForm.sale_id ? selectedRefundCredit : creditAmount)}
                  </strong>
                </label>
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
                <FormInput
                  label="Method"
                  name="payment_method"
                  value={refundForm.payment_method}
                  onChange={updateRefundField}
                />
                <FormInput
                  label="Notes"
                  name="notes"
                  value={refundForm.notes}
                  onChange={updateRefundField}
                />
              </div>
              <div className="form-actions">
                <Button type="submit" icon={RotateCcw} disabled={refunding || creditAmount <= 0}>
                  {refunding ? "Saving" : "Record Refund"}
                </Button>
              </div>
            </form>
          </section>
          </>
          ) : null}

          {activeTab === "invoices" ? (
          <section className="card">
            <div className="section-header">
              <h2>Invoices</h2>
              <span className="badge badge-neutral">{sales.length} invoices</span>
            </div>
            <DataTable
              columns={[
                { header: "Invoice", render: (row) => firstValue(row.sale_number, row.saleNumber, `Sale #${row.id}`) },
                { header: "Date", render: (row) => formatDate(firstValue(row.sale_date, row.saleDate)) },
                { header: "Car", render: (row) => (row.car ? getCarLabel(row.car) : "-") },
                { header: "Total", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount, 0)) },
                { header: "Returned", render: (row) => formatCurrency(firstValue(row.returned_amount, row.returnedAmount, 0)) },
                { header: "Refunded", render: (row) => formatCurrency(firstValue(row.refunded_amount, row.refundedAmount, 0)) },
                { header: "Net", render: (row) => formatCurrency(firstValue(row.net_total_amount, row.netTotalAmount, row.total_amount, row.totalAmount, 0)) },
                { header: "Paid", render: (row) => formatCurrency(firstValue(row.effective_paid_amount, row.effectivePaidAmount, row.paid_amount, row.paidAmount, 0)) },
                {
                  header: "Remaining",
                  render: (row) => formatCurrency(firstValue(row.remaining_amount, row.remainingAmount, 0)),
                },
                {
                  header: "Actions",
                  render: (row) => (
                    <Link className="btn btn-secondary btn-small" to={`/sales/${row.id}`}>
                      <Eye size={15} aria-hidden="true" />
                      <span>View</span>
                    </Link>
                  ),
                },
              ]}
              data={sales}
              emptyMessage="No invoices found"
            />
          </section>
          ) : null}

          {activeTab === "vehicles" ? (
          <section className="card">
            <div className="section-header">
              <h2>Cars</h2>
              <CarFront size={18} aria-hidden="true" />
            </div>
            <DataTable
              columns={[
                {
                  header: "Car",
                  render: (row) => (
                    <Link className="text-link" to={`/cars/${row.id}`}>
                      {getCarLabel(row)}
                    </Link>
                  ),
                },
                { header: "VIN", render: (row) => row.vin || "-" },
                { header: "Color", render: (row) => row.color || "-" },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={cars}
              emptyMessage="No cars linked to this customer"
            />
          </section>
          ) : null}

          {activeTab === "balances" ? (
          <>
          <section className="card">
            <div className="section-header">
              <h2>Payment History</h2>
              <span className="badge badge-neutral">{payments.length} entries</span>
            </div>
            <DataTable
              columns={[
                {
                  header: "Date",
                  render: (row) => formatDate(firstValue(row.payment_date, row.paymentDate, row.refund_date, row.refundDate)),
                },
                {
                  header: "Amount",
                  render: (row) => (
                    <span className={row.source === "refund" ? "text-danger" : ""}>
                      {row.source === "refund" ? "-" : ""}
                      {formatCurrency(row.amount)}
                    </span>
                  ),
                },
                { header: "Method", render: (row) => firstValue(row.payment_method, row.paymentMethod, "-") },
                {
                  header: "Source",
                  render: (row) => {
                    if (row.source === "refund") return "Refund";
                    return row.source === "account" ? "Opening Balance" : "Invoice";
                  },
                },
                {
                  header: "Invoice",
                  render: (row) => {
                    const saleId = firstValue(row.sale_id, row.saleId);

                    return saleId ? (
                      <Link className="text-link" to={`/sales/${saleId}`}>
                        {firstValue(row.sale?.saleNumber, row.sale?.sale_number, `Sale #${saleId}`)}
                      </Link>
                    ) : (
                      "-"
                    );
                  },
                },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={payments}
              emptyMessage="No payments recorded"
            />
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Refund History</h2>
              <span className="badge badge-neutral">{refunds.length} entries</span>
            </div>
            <DataTable
              columns={[
                { header: "Date", render: (row) => formatDate(firstValue(row.refund_date, row.refundDate)) },
                { header: "Amount", render: (row) => formatCurrency(row.amount) },
                { header: "Method", render: (row) => firstValue(row.payment_method, row.paymentMethod, "-") },
                {
                  header: "Invoice",
                  render: (row) => {
                    const saleId = firstValue(row.sale_id, row.saleId);

                    return saleId ? (
                      <Link className="text-link" to={`/sales/${saleId}`}>
                        {firstValue(row.sale?.saleNumber, row.sale?.sale_number, `Sale #${saleId}`)}
                      </Link>
                    ) : (
                      "Account credit"
                    );
                  },
                },
                { header: "Created By", render: (row) => row.creator?.name || "-" },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={refunds}
              emptyMessage="No refunds recorded"
            />
          </section>
          </>
          ) : null}

          {activeTab === "vehicles" ? (
          <section className="card">
            <div className="section-header">
              <h2>Service Jobs</h2>
              <Wrench size={18} aria-hidden="true" />
            </div>
            <DataTable
              columns={[
                {
                  header: "Job",
                  render: (row) => (
                    <Link className="text-link" to={`/service-jobs/${row.id}`}>
                      {firstValue(row.job_number, row.jobNumber, `Job #${row.id}`)}
                    </Link>
                  ),
                },
                { header: "Status", render: (row) => row.status },
                { header: "Car", render: (row) => (row.car ? getCarLabel(row.car) : "-") },
                { header: "Started", render: (row) => formatDate(firstValue(row.start_date, row.startDate)) },
                {
                  header: "Invoice",
                  render: (row) =>
                    row.sale ? (
                      <Link className="text-link" to={`/sales/${row.sale.id}`}>
                        {firstValue(row.sale.sale_number, row.sale.saleNumber, `Sale #${row.sale.id}`)}
                      </Link>
                    ) : (
                      "-"
                    ),
                },
              ]}
              data={serviceJobs}
              emptyMessage="No service jobs found"
            />
          </section>
          ) : null}
        </>
      )}
    </div>
  );
};

export default CustomerDetails;
