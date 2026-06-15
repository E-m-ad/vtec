import { ArrowLeft, Printer, ReceiptText, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import FormInput from "../components/FormInput";
import LoadingSpinner from "../components/LoadingSpinner";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue, getCarLabel, getPartnerName } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const createReturnForm = () => ({
  return_date: new Date().toISOString().slice(0, 10),
  notes: "",
  quantities: {},
});

const money = (...values) => Number(firstValue(...values, 0) ?? 0);

const SaleDetails = () => {
  const { id } = useParams();
  const [sale, setSale] = useState(null);
  const [returnForm, setReturnForm] = useState(createReturnForm);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState("");
  const [returnError, setReturnError] = useState("");
  const [returnSuccess, setReturnSuccess] = useState("");

  const loadSale = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get(`/sales/${id}`);
      setSale(unwrapData(response, null));
    } catch (err) {
      setError(errorMessage(err, "Unable to load sale invoice"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSale();
  }, [id]);

  const items = useMemo(() => listFrom(sale?.items ?? []), [sale]);
  const payments = useMemo(() => listFrom(sale?.payments ?? []), [sale]);
  const returns = useMemo(() => listFrom(sale?.returns ?? []), [sale]);
  const refunds = useMemo(() => listFrom(sale?.refunds ?? []), [sale]);
  const returnableItems = useMemo(
    () =>
      items.filter(
        (item) =>
          firstValue(item.line_type, item.lineType, "product") === "product" &&
          Number(firstValue(item.returnable_quantity, item.returnableQuantity, 0)) > 0,
      ),
    [items],
  );
  const totalAmount = money(sale?.total_amount, sale?.totalAmount);
  const returnedAmount = money(sale?.returned_amount, sale?.returnedAmount);
  const netTotalAmount = money(sale?.net_total_amount, sale?.netTotalAmount, totalAmount - returnedAmount);
  const paidAmount = money(sale?.paid_amount, sale?.paidAmount);
  const refundedAmount = money(sale?.refunded_amount, sale?.refundedAmount);
  const effectivePaidAmount = money(sale?.effective_paid_amount, sale?.effectivePaidAmount, paidAmount - refundedAmount);
  const remainingAmount = firstValue(
    sale?.remaining_amount,
    sale?.remainingAmount,
    netTotalAmount - effectivePaidAmount,
  );
  const creditAmount = money(sale?.credit_amount, sale?.creditAmount, paidAmount - netTotalAmount);
  const invoiceNumber = firstValue(
    sale?.sale_number,
    sale?.saleNumber,
    `Sale #${sale?.id || id}`,
  );

  const handlePrint = () => {
    const previousTitle = document.title;
    document.title = `${invoiceNumber} - Sale Invoice`;
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 0);
  };

  const updateReturnField = (event) => {
    const { name, value } = event.target;
    setReturnForm((current) => ({ ...current, [name]: value }));
  };

  const updateReturnQuantity = (itemId, value) => {
    setReturnForm((current) => ({
      ...current,
      quantities: {
        ...current.quantities,
        [itemId]: value,
      },
    }));
  };

  const selectedReturnItems = useMemo(
    () =>
      returnableItems
        .map((item) => {
          const quantity = Number(returnForm.quantities[item.id]);

          return {
            item,
            quantity,
            lineTotal: quantity * money(item.unit_price, item.unitPrice),
          };
        })
        .filter((row) => Number.isInteger(row.quantity) && row.quantity > 0),
    [returnForm.quantities, returnableItems],
  );
  const returnTotal = selectedReturnItems.reduce((sum, row) => sum + row.lineTotal, 0);

  const validateReturn = () => {
    if (!returnForm.return_date) return "Return date is required";
    if (!selectedReturnItems.length) return "Enter quantity for at least one returned item";

    for (const row of selectedReturnItems) {
      const returnableQuantity = Number(firstValue(row.item.returnable_quantity, row.item.returnableQuantity, 0));

      if (row.quantity > returnableQuantity) {
        return "Return quantity cannot be greater than returnable quantity";
      }
    }

    return "";
  };

  const submitReturn = async (event) => {
    event.preventDefault();
    const validationError = validateReturn();

    if (validationError) {
      setReturnError(validationError);
      setReturnSuccess("");
      return;
    }

    setReturning(true);
    setReturnError("");
    setReturnSuccess("");

    try {
      const response = await axiosClient.post(`/sales/${id}/returns`, {
        return_date: returnForm.return_date,
        notes: returnForm.notes || null,
        items: selectedReturnItems.map((row) => ({
          sale_item_id: row.item.id,
          quantity: row.quantity,
        })),
      });

      setSale(unwrapData(response, null));
      setReturnForm(createReturnForm());
      setReturnSuccess("Sale return recorded");
    } catch (err) {
      setReturnError(errorMessage(err, "Unable to record sale return"));
    } finally {
      setReturning(false);
    }
  };

  return (
    <div className="page invoice-print-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sale Invoice #{sale?.id || id}</h1>
          <p className="page-subtitle">
            Customer invoice details and sold items.
          </p>
        </div>
        <div className="page-actions no-print">
          <Button
            variant="secondary"
            icon={Printer}
            onClick={handlePrint}
            disabled={loading || Boolean(error) || !sale}
          >
            Print
          </Button>
          <Link className="btn btn-secondary" to="/sales">
            <ArrowLeft size={17} aria-hidden="true" />
            <span>Back to Sales</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <section className="card table-state">
          <LoadingSpinner />
        </section>
      ) : error ? (
        <section className="card error-text">{error}</section>
      ) : (
        <>
          <section className="card invoice-header-card">
            <div className="invoice-title">
              <div className="brand-mark">
                <ReceiptText size={22} aria-hidden="true" />
              </div>
              <div>
                <strong>{invoiceNumber}</strong>
                <span>
                  {formatDate(firstValue(sale?.sale_date, sale?.saleDate))}
                </span>
              </div>
            </div>

            <div className="invoice-meta-grid">
              <div>
                <span>Customer</span>
                <strong>{getPartnerName(sale, "customer")}</strong>
              </div>
              <div>
                <span>Car</span>
                <strong>
                  {sale?.car ? (
                    <Link className="text-link" to={`/cars/${sale.car.id}`}>
                      {getCarLabel(sale.car)}
                    </Link>
                  ) : (
                    "-"
                  )}
                </strong>
              </div>
              <div>
                <span>Payment Status</span>
                <strong>
                  {firstValue(sale?.payment_status, sale?.paymentStatus, "-")}
                </strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatCurrency(totalAmount)}</strong>
              </div>
              <div>
                <span>Returned</span>
                <strong>{formatCurrency(returnedAmount)}</strong>
              </div>
              <div>
                <span>Net Total</span>
                <strong>{formatCurrency(netTotalAmount)}</strong>
              </div>
              <div>
                <span>Paid</span>
                <strong>{formatCurrency(paidAmount)}</strong>
              </div>
              <div>
                <span>Refunded</span>
                <strong>{formatCurrency(refundedAmount)}</strong>
              </div>
              <div>
                <span>Effective Paid</span>
                <strong>{formatCurrency(effectivePaidAmount)}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{formatCurrency(remainingAmount)}</strong>
              </div>
              <div>
                <span>Customer Credit</span>
                <strong>{formatCurrency(Math.max(creditAmount, 0))}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Invoice Items</h2>
            </div>
            <DataTable
              columns={[
                {
                  header: "Type",
                  render: (row) =>
                    firstValue(row.line_type, row.lineType, "product") ===
                    "service"
                      ? "Service"
                      : "Product",
                },
                {
                  header: "Item",
                  render: (row) =>
                    firstValue(
                      row.product_name,
                      row.product?.name,
                      row.description,
                      "-",
                    ),
                },
                {
                  header: "Part Number",
                  render: (row) =>
                    firstValue(row.product_sku, row.product?.sku, "-"),
                },
                {
                  header: "Quantity",
                  render: (row) => firstValue(row.quantity, 0),
                },
                {
                  header: "Returned",
                  render: (row) => firstValue(row.returned_quantity, row.returnedQuantity, 0),
                },
                {
                  header: "Returnable",
                  render: (row) => firstValue(row.returnable_quantity, row.returnableQuantity, 0),
                },
                {
                  header: "Selling Price",
                  render: (row) =>
                    formatCurrency(
                      firstValue(row.unit_price, row.unitPrice, 0),
                    ),
                },
                {
                  header: "Subtotal",
                  render: (row) =>
                    formatCurrency(
                      firstValue(row.line_total, row.lineTotal, 0),
                    ),
                },
              ]}
              data={items}
              emptyMessage="No invoice items found"
            />
          </section>

          <section className="card no-print">
            <div className="section-header">
              <div>
                <h2>Record Sale Return</h2>
                <p className="section-subtitle">Return sold products back to stock and reduce the invoice balance.</p>
              </div>
              <span className="badge badge-neutral">{returnableItems.length} returnable lines</span>
            </div>
            <form className="form" onSubmit={submitReturn}>
              {returnError ? <p className="error-text">{returnError}</p> : null}
              {returnSuccess ? <p className="success-text">{returnSuccess}</p> : null}
              <div className="form-row">
                <FormInput
                  label="Return Date"
                  name="return_date"
                  type="date"
                  value={returnForm.return_date}
                  onChange={updateReturnField}
                />
                <FormInput
                  label="Notes"
                  name="notes"
                  value={returnForm.notes}
                  onChange={updateReturnField}
                />
                <label className="form-field">
                  <span>Return Total</span>
                  <strong className="input readonly-input">{formatCurrency(returnTotal)}</strong>
                </label>
              </div>

              <DataTable
                columns={[
                  {
                    header: "Item",
                    render: (row) =>
                      firstValue(
                        row.product_name,
                        row.product?.name,
                        row.description,
                        "-",
                      ),
                  },
                  { header: "Sold", render: (row) => firstValue(row.quantity, 0) },
                  { header: "Returned", render: (row) => firstValue(row.returned_quantity, row.returnedQuantity, 0) },
                  { header: "Returnable", render: (row) => firstValue(row.returnable_quantity, row.returnableQuantity, 0) },
                  {
                    header: "Return Qty",
                    render: (row) => (
                      <input
                        className="input"
                        min="0"
                        max={firstValue(row.returnable_quantity, row.returnableQuantity, 0)}
                        onChange={(event) => updateReturnQuantity(row.id, event.target.value)}
                        step="1"
                        type="number"
                        value={returnForm.quantities[row.id] || ""}
                      />
                    ),
                  },
                  {
                    header: "Unit Price",
                    render: (row) => formatCurrency(firstValue(row.unit_price, row.unitPrice, 0)),
                  },
                  {
                    header: "Return Value",
                    render: (row) =>
                      formatCurrency(
                        Number(returnForm.quantities[row.id] || 0) *
                          money(row.unit_price, row.unitPrice),
                      ),
                  },
                ]}
                data={returnableItems}
                emptyMessage="No product lines are available to return"
              />

              <div className="form-actions">
                <Button type="submit" icon={RotateCcw} disabled={returning || returnTotal <= 0}>
                  {returning ? "Saving" : "Record Return"}
                </Button>
              </div>
            </form>
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Sale Return History</h2>
              <span className="badge badge-neutral">{returns.length} returns</span>
            </div>
            <DataTable
              columns={[
                {
                  header: "Return",
                  render: (row) => firstValue(row.return_number, row.returnNumber, `Return #${row.id}`),
                },
                {
                  header: "Date",
                  render: (row) => formatDate(firstValue(row.return_date, row.returnDate)),
                },
                { header: "Amount", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount, 0)) },
                { header: "Created By", render: (row) => row.creator?.name || "-" },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={returns}
              emptyMessage="No sale returns recorded for this invoice"
              renderDetailRow={(row) => {
                const returnItems = listFrom(row.items ?? []);

                if (!returnItems.length) return null;

                return (
                  <div className="return-detail-list">
                    {returnItems.map((item) => (
                      <div className="return-detail-row" key={item.id}>
                        <span>{firstValue(item.product_name, item.product?.name, item.saleItem?.description, "-")}</span>
                        <strong>{firstValue(item.quantity, 0)} x {formatCurrency(firstValue(item.unit_price, item.unitPrice, 0))}</strong>
                        <span>{formatCurrency(firstValue(item.line_total, item.lineTotal, 0))}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Payment History</h2>
              <span className="badge badge-neutral">
                {payments.length} entries
              </span>
            </div>
            <DataTable
              columns={[
                {
                  header: "Date",
                  render: (row) =>
                    formatDate(firstValue(row.payment_date, row.paymentDate)),
                },
                {
                  header: "Amount",
                  render: (row) => formatCurrency(row.amount),
                },
                {
                  header: "Method",
                  render: (row) =>
                    firstValue(row.payment_method, row.paymentMethod, "-"),
                },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={payments}
              emptyMessage="No payments recorded for this invoice"
            />
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Customer Refund History</h2>
              <span className="badge badge-neutral">{refunds.length} entries</span>
            </div>
            <DataTable
              columns={[
                {
                  header: "Date",
                  render: (row) => formatDate(firstValue(row.refund_date, row.refundDate)),
                },
                {
                  header: "Amount",
                  render: (row) => formatCurrency(row.amount),
                },
                {
                  header: "Method",
                  render: (row) => firstValue(row.payment_method, row.paymentMethod, "-"),
                },
                { header: "Created By", render: (row) => row.creator?.name || "-" },
                { header: "Notes", render: (row) => row.notes || "-" },
              ]}
              data={refunds}
              emptyMessage="No customer refunds recorded for this invoice"
            />
          </section>

          {sale?.notes ? (
            <section className="card">
              <div className="section-header">
                <h2>Notes</h2>
              </div>
              <p className="muted">{sale.notes}</p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
};

export default SaleDetails;
