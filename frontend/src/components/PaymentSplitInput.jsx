import { Plus, Trash2 } from "lucide-react";

import Button from "./Button";
import formatCurrency from "../utils/formatCurrency";

const methodOptions = [
  { value: "cash", label: "Cash" },
  { value: "instapay", label: "InstaPay" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
];

const createPayment = () => ({
  amount: "",
  payment_method: "cash",
  custom_method: "",
  notes: "",
});

const displayMethodValue = (payment) => {
  const method = payment.payment_method || "cash";
  return methodOptions.some((option) => option.value === method) ? method : "other";
};

export const paymentTotal = (payments = []) =>
  payments.reduce((sum, payment) => {
    const amount = Number(payment.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

export const normalizePaymentsPayload = (payments = []) =>
  payments
    .map((payment) => {
      const amount = Number(payment.amount);
      const method =
        payment.payment_method === "other"
          ? payment.custom_method.trim()
          : payment.payment_method;

      return {
        amount,
        payment_method: method || "other",
        notes: payment.notes?.trim() || null,
      };
    })
    .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0);

const PaymentSplitInput = ({
  payments,
  onChange,
  maxAmount,
  title = "Payments",
  showNotes = false,
}) => {
  const rows = payments.length ? payments : [createPayment()];
  const total = paymentTotal(rows);
  const remaining = typeof maxAmount === "number" ? Math.max(maxAmount - total, 0) : null;

  const updatePayment = (index, field, value) => {
    onChange(
      rows.map((payment, paymentIndex) => {
        if (paymentIndex !== index) return payment;

        if (field === "payment_method") {
          return {
            ...payment,
            payment_method: value,
            custom_method: value === "other" ? payment.custom_method : "",
          };
        }

        return { ...payment, [field]: value };
      }),
    );
  };

  const addPayment = () => onChange([...rows, createPayment()]);
  const removePayment = (index) => {
    const nextRows = rows.filter((_, paymentIndex) => paymentIndex !== index);
    onChange(nextRows.length ? nextRows : [createPayment()]);
  };

  return (
    <div className="payment-split">
      <div className="payment-split-header">
        <strong>{title}</strong>
        <div className="payment-split-summary">
          <span>Paid {formatCurrency(total)}</span>
          {remaining !== null ? <span>Remaining {formatCurrency(remaining)}</span> : null}
        </div>
      </div>

      <div className="payment-split-rows">
        {rows.map((payment, index) => (
          <div className="payment-split-row" key={index}>
            <label className="form-field">
              <span>Amount</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={payment.amount}
                onChange={(event) => updatePayment(index, "amount", event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Method</span>
              <select
                className="select"
                value={displayMethodValue(payment)}
                onChange={(event) => updatePayment(index, "payment_method", event.target.value)}
              >
                {methodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {displayMethodValue(payment) === "other" ? (
              <label className="form-field">
                <span>Custom Method</span>
                <input
                  className="input"
                  value={payment.custom_method}
                  onChange={(event) => updatePayment(index, "custom_method", event.target.value)}
                  placeholder="Wallet, transfer, etc."
                />
              </label>
            ) : null}
            {showNotes ? (
              <label className="form-field">
                <span>Notes</span>
                <input
                  className="input"
                  value={payment.notes}
                  onChange={(event) => updatePayment(index, "notes", event.target.value)}
                />
              </label>
            ) : null}
            <button
              className="icon-button payment-split-remove"
              type="button"
              onClick={() => removePayment(index)}
              aria-label="Remove payment"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <Button className="payment-split-add" variant="secondary" icon={Plus} onClick={addPayment}>
        Add Payment Method
      </Button>
    </div>
  );
};

export default PaymentSplitInput;
