import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import PaymentSplitInput, { normalizePaymentsPayload, paymentTotal } from "../components/PaymentSplitInput";
import SearchableSelect from "../components/SearchableSelect";
import formatCurrency from "../utils/formatCurrency";
import {
  firstValue,
  getCarLabel,
  getProductBrandName,
  getProductCategoryName,
  getProductPrice,
  getProductSku,
  getProductStock,
} from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const emptyItem = {
  line_type: "product",
  product_id: "",
  description: "",
  quantity: "1",
  selling_price: "0",
};

const emptyServiceItem = {
  line_type: "service",
  product_id: "",
  description: "",
  quantity: "1",
  selling_price: "0",
};

const customerDescription = (customer) => [customer?.phone, customer?.email].filter(Boolean).join(" / ");
const customerSearchText = (customer) =>
  [customer?.name, customer?.phone, customer?.email].filter(Boolean).join(" ");

const carDescription = (car) => {
  const owner = firstValue(car?.customer?.name, car?.customer_name, "");
  const vin = firstValue(car?.vin, "");

  return [owner ? `Owner: ${owner}` : "", vin ? `VIN: ${vin}` : ""].filter(Boolean).join(" / ");
};

const carSearchText = (car) =>
  [
    getCarLabel(car, ""),
    firstValue(car?.plate_number, car?.plateNumber, ""),
    car?.make,
    car?.model,
    car?.year,
    car?.color,
    car?.vin,
    firstValue(car?.customer?.name, car?.customer_name, ""),
  ]
    .filter(Boolean)
    .join(" ");

const productLabel = (product) => {
  const sku = getProductSku(product);
  return `${product?.name || "Product"}${sku ? ` - ${sku}` : ""}`;
};

const productDescription = (product) =>
  [getProductCategoryName(product), getProductBrandName(product), `Stock: ${getProductStock(product)}`]
    .filter(Boolean)
    .join(" / ");

const productSearchText = (product) =>
  [productLabel(product), getProductCategoryName(product), getProductBrandName(product)].filter(Boolean).join(" ");

const CreateSale = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [cars, setCars] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerMode, setCustomerMode] = useState("existing");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [carId, setCarId] = useState("");
  const [payments, setPayments] = useState([{ amount: "", payment_method: "cash", custom_method: "", notes: "" }]);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [error, setError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setOptionsLoading(true);
      try {
        const [customersResponse, carsResponse, productsResponse] = await Promise.all([
          axiosClient.get("/customers"),
          axiosClient.get("/cars"),
          axiosClient.get("/products", { params: { limit: 1000 } }),
        ]);
        setCustomers(listFrom(unwrapData(customersResponse, [])));
        setCars(listFrom(unwrapData(carsResponse, [])));
        setProducts(listFrom(unwrapData(productsResponse, [])));
      } catch (err) {
        setError(errorMessage(err, "Unable to load sale form"));
      } finally {
        setOptionsLoading(false);
      }
    };

    load();
  }, []);

  const totalAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const quantity = Number(item.quantity);
        const price = Number(item.selling_price);
        return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
      }, 0),
    [items],
  );
  const paidNumber = paymentTotal(payments);
  const remainingAmount =
    totalAmount - (Number.isFinite(paidNumber) ? paidNumber : 0);

  const selectedProduct = (productId) => products.find((product) => String(product.id) === String(productId));
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(customerId));
  const carOptions = cars.filter((car) => {
    const ownerId = car.customerId || car.customer_id;

    if (customerMode === "manual") {
      return !ownerId;
    }

    if (!customerId) {
      return !ownerId;
    }

    return !ownerId || String(ownerId) === String(customerId);
  });

  const changeCustomerMode = (value) => {
    setCustomerMode(value);
    setCustomerId("");
    setCustomerName("");
    setCarId("");
  };

  const changeCustomer = (value) => {
    setCustomerId(value);
    setCarId("");
  };

  const updateItem = (index, field, value) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, [field]: value };

        if (field === "product_id") {
          const product = selectedProduct(value);
          next.selling_price = String(getProductPrice(product));
          next.description = product?.name || "";
        }

        return next;
      }),
    );
  };

  const addItem = () => setItems((current) => [...current, { ...emptyItem }]);
  const addServiceItem = () => setItems((current) => [...current, { ...emptyServiceItem }]);
  const removeItem = (index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const validate = () => {
    if (customerMode === "existing" && !customerId) return "Choose a customer";
    if (customerMode === "manual" && !customerName.trim()) return "Enter customer name for this invoice";
    if (!Number.isFinite(paidNumber) || paidNumber < 0) return "Paid amount must be 0 or greater";
    if (paidNumber > totalAmount) return "Paid amount cannot be greater than total amount";
    if (!items.length) return "At least one item is required";

    const requestedByProduct = new Map();

    for (const item of items) {
      const quantity = Number(item.quantity);
      const sellingPrice = Number(item.selling_price);

      if (!Number.isInteger(quantity) || quantity <= 0) return "Quantity must be a whole number greater than 0";
      if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return "Selling price must be 0 or greater";

      if (item.line_type === "service") {
        if (!item.description.trim()) return "Service description is required";
        continue;
      }

      const product = selectedProduct(item.product_id);
      const stock = getProductStock(product);

      if (!item.product_id) return "Product is required for every product line";
      if (stock === 0) return `${product?.name || "Selected product"} is out of stock`;
      if (quantity > stock) return `${product?.name || "Selected product"} has only ${stock} in stock`;

      requestedByProduct.set(item.product_id, (requestedByProduct.get(item.product_id) || 0) + quantity);
    }

    for (const [productId, requestedQuantity] of requestedByProduct.entries()) {
      const product = selectedProduct(productId);
      const stock = getProductStock(product);
      if (requestedQuantity > stock) {
        return `${product?.name || "Selected product"} has only ${stock} in stock across all rows`;
      }
    }

    return "";
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    const payload = {
      customer_id: customerMode === "existing" ? Number(customerId) : null,
      customer_name:
        customerMode === "manual"
          ? customerName.trim()
          : selectedCustomer?.name || null,
      car_id: carId ? Number(carId) : null,
      paid_amount: paidNumber,
      payments: normalizePaymentsPayload(payments),
      items: items.map((item) => ({
        line_type: item.line_type,
        product_id: item.line_type === "product" ? Number(item.product_id) : null,
        description: item.line_type === "service" ? item.description.trim() : item.description || null,
        quantity: Number(item.quantity),
        selling_price: Number(item.selling_price),
        unit_price: Number(item.selling_price),
      })),
    };

    try {
      await axiosClient.post("/sales", payload);
      navigate("/sales");
    } catch (err) {
      setError(errorMessage(err, "Unable to create sale"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Create Sale</h1>
          <p className="page-subtitle">Record customer sales and reduce available stock.</p>
        </div>
        <Link className="btn btn-secondary" to="/sales">
          Back to Sales
        </Link>
      </div>

      <form className="card form" onSubmit={submit}>
        {error ? <p className="error-text">{error}</p> : null}

        <div className="form-row">
          <label className="form-field">
            <span>Customer Type</span>
            <select className="select" value={customerMode} onChange={(event) => changeCustomerMode(event.target.value)}>
              <option value="existing">Existing customer</option>
              <option value="manual">Write customer name</option>
            </select>
          </label>
          {customerMode === "existing" ? (
            <SearchableSelect
              emptyLabel="Select customer"
              getOptionDescription={customerDescription}
              getOptionLabel={(customer) => customer.name}
              getOptionSearchText={customerSearchText}
              label="Customer"
              onChange={changeCustomer}
              options={customers}
              placeholder="Search customer name or phone"
              value={customerId}
            />
          ) : (
            <label className="form-field">
              <span>Customer Name</span>
              <input
                className="input"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Name printed on this invoice"
              />
            </label>
          )}
        </div>

        <div className="form-row">
          <SearchableSelect
            emptyLabel="No car linked"
            getOptionDescription={carDescription}
            getOptionLabel={(car) => getCarLabel(car)}
            getOptionSearchText={carSearchText}
            label="Car"
            onChange={setCarId}
            options={carOptions}
            placeholder="Search plate, VIN, make, model"
            value={carId}
          />
          <div className="item-subtotal">
            <span>Car Link</span>
            <strong>{carId ? "This invoice will appear in car history" : "Optional"}</strong>
          </div>
        </div>

        <PaymentSplitInput payments={payments} onChange={setPayments} maxAmount={totalAmount} title="Customer Payments" />

        <div className="item-table">
          <div className="item-table-header">
            <strong>Items</strong>
            <div className="inline-form-actions">
              <Button variant="secondary" icon={Plus} onClick={addItem} disabled={optionsLoading}>
                Add Product
              </Button>
              <Button variant="secondary" icon={Plus} onClick={addServiceItem}>
                Add Service
              </Button>
            </div>
          </div>
          {items.map((item, index) => {
            const product = selectedProduct(item.product_id);
            const stock = getProductStock(product);
            const subtotal = Number(item.quantity || 0) * Number(item.selling_price || 0);
            return (
              <div className="item-row sale-item-row" key={index}>
                {item.line_type === "service" ? (
                  <label className="form-field">
                    <span>Service</span>
                    <input
                      className="input"
                      value={item.description}
                      onChange={(event) => updateItem(index, "description", event.target.value)}
                      placeholder="Oil change labor, inspection, diagnosis"
                    />
                  </label>
                ) : (
                  <SearchableSelect
                    emptyLabel="Select product"
                    getOptionDescription={productDescription}
                    getOptionLabel={productLabel}
                    getOptionSearchText={productSearchText}
                    label="Product"
                    onChange={(value) => updateItem(index, "product_id", value)}
                    options={products}
                    placeholder="Search product, part no, category"
                    value={item.product_id}
                  />
                )}
                <label className="form-field">
                  <span>Quantity</span>
                  <input className="input" type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} />
                </label>
                <label className="form-field">
                  <span>Selling Price</span>
                  <input className="input" type="number" min="0" value={item.selling_price} onChange={(e) => updateItem(index, "selling_price", e.target.value)} />
                </label>
                <div className="item-subtotal">
                  <span>{item.line_type === "service" ? "Type" : "Available"}</span>
                  <strong>{item.line_type === "service" ? "Service" : product ? (stock === 0 ? "Out of stock" : stock) : "-"}</strong>
                </div>
                <div className="item-subtotal">
                  <span>Subtotal</span>
                  <strong>{formatCurrency(subtotal)}</strong>
                </div>
                <button className="icon-button" type="button" onClick={() => removeItem(index)} aria-label="Remove item">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="total-row">
          <span>Total Amount</span>
          <strong>{formatCurrency(totalAmount)}</strong>
          <span>Paid</span>
          <strong>{formatCurrency(paidNumber)}</strong>
          <span>Remaining</span>
          <strong>{formatCurrency(Math.max(remainingAmount, 0))}</strong>
        </div>

        <div className="form-actions">
          <Button type="submit" icon={Save} disabled={loading || optionsLoading}>
            {loading ? "Saving" : "Save Sale"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateSale;
