import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import PaymentSplitInput, { normalizePaymentsPayload, paymentTotal } from "../components/PaymentSplitInput";
import SearchableSelect from "../components/SearchableSelect";
import formatCurrency from "../utils/formatCurrency";
import { getProductBrandName, getProductCategoryName, getProductCost, getProductSku } from "../utils/fields";
import { normalizePartNumber } from "../utils/partNumber";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const createNewProduct = () => ({
  sku: "",
  name: "",
  category_id: "",
  brand_id: "",
  sale_price: "0",
  min_stock_level: "0",
  location: "",
});

const createEmptyItem = () => ({
  product_mode: "existing",
  product_id: "",
  quantity: "1",
  cost_price: "0",
  new_product: createNewProduct(),
});

const normalizeSku = (value) => normalizePartNumber(value);

const productLabel = (product) => {
  if (product?.id === "__new__") return "New product";

  const sku = getProductSku(product);
  return `${product?.name || "Product"}${sku ? ` - ${sku}` : ""}`;
};

const productDescription = (product) => {
  if (product?.id === "__new__") return "Create product while recording this purchase";

  return [getProductCategoryName(product), getProductBrandName(product)].filter(Boolean).join(" / ");
};

const productSearchText = (product) =>
  [productLabel(product), getProductCategoryName(product), getProductBrandName(product)].filter(Boolean).join(" ");

const CreatePurchase = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [payments, setPayments] = useState([{ amount: "", payment_method: "cash", custom_method: "", notes: "" }]);
  const [items, setItems] = useState([createEmptyItem()]);
  const [error, setError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setOptionsLoading(true);
      try {
        const [suppliersResponse, productsResponse, categoriesResponse, brandsResponse] = await Promise.all([
          axiosClient.get("/suppliers"),
          axiosClient.get("/products", { params: { limit: 1000 } }),
          axiosClient.get("/categories"),
          axiosClient.get("/brands"),
        ]);

        setSuppliers(listFrom(unwrapData(suppliersResponse, [])));
        setProducts(listFrom(unwrapData(productsResponse, [])));
        setCategories(listFrom(unwrapData(categoriesResponse, [])));
        setBrands(listFrom(unwrapData(brandsResponse, [])));
      } catch (err) {
        setError(errorMessage(err, "Unable to load purchase form"));
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
        const price = Number(item.cost_price);
        return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
      }, 0),
    [items],
  );

  const updateItem = (index, field, value) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        if (field === "product_id") {
          if (value === "__new__") {
            return {
              ...item,
              product_mode: "new",
              product_id: "",
              new_product: { ...item.new_product },
            };
          }

          const product = products.find((entry) => String(entry.id) === String(value));
          return {
            ...item,
            product_mode: "existing",
            product_id: value,
            cost_price: String(getProductCost(product)),
          };
        }

        return { ...item, [field]: value };
      }),
    );
  };

  const updateNewProduct = (index, field, value) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              new_product: {
                ...item.new_product,
                [field]: value,
              },
            }
          : item,
      ),
    );
  };

  const normalizeNewProductSku = (index) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              new_product: {
                ...item.new_product,
                sku: normalizePartNumber(item.new_product.sku),
              },
            }
          : item,
      ),
    );
  };

  const handleNewProductSkuKeyDown = (index, event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    normalizeNewProductSku(index);
  };

  const useExistingProduct = (index) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              product_mode: "existing",
              product_id: "",
            }
          : item,
      ),
    );
  };

  const addItem = () => setItems((current) => [...current, createEmptyItem()]);
  const removeItem = (index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const validate = () => {
    if (!supplierId) return "Supplier is required";

    const paid = paymentTotal(payments);
    if (!Number.isFinite(paid) || paid < 0) return "Paid amount must be 0 or greater";
    if (paid > totalAmount) return "Paid amount cannot be greater than total amount";
    if (!items.length) return "At least one item is required";

    for (const item of items) {
      const quantity = Number(item.quantity);
      const costPrice = Number(item.cost_price);

      if (!Number.isInteger(quantity) || quantity <= 0) return "Quantity must be a whole number greater than 0";
      if (!Number.isFinite(costPrice) || costPrice < 0) return "Cost price must be 0 or greater";

      if (item.product_mode === "existing") {
        if (!item.product_id) return "Product is required for every item";
        continue;
      }

      const sku = normalizePartNumber(item.new_product.sku);
      const salePrice = Number(item.new_product.sale_price);
      const minStock = Number(item.new_product.min_stock_level);

      if (!sku) return "Part number is required for every new product";
      if (!item.new_product.name.trim()) return "Name is required for every new product";
      if (products.some((product) => normalizeSku(getProductSku(product)) === sku)) {
        return `Product ${sku} already exists. Choose it from the product list.`;
      }
      if (!Number.isFinite(salePrice) || salePrice < 0) return "Selling price must be 0 or greater";
      if (!Number.isInteger(minStock) || minStock < 0) return "Min stock must be a whole number 0 or greater";
    }

    return "";
  };

  const buildItemPayload = (item) => {
    const payload = {
      quantity: Number(item.quantity),
      cost_price: Number(item.cost_price),
      unit_cost: Number(item.cost_price),
    };

    if (item.product_mode === "new") {
      const sku = normalizePartNumber(item.new_product.sku);

      payload.new_product = {
        sku,
        part_number: sku,
        name: item.new_product.name.trim(),
        category_id: item.new_product.category_id ? Number(item.new_product.category_id) : null,
        brand_id: item.new_product.brand_id ? Number(item.new_product.brand_id) : null,
        purchase_price: Number(item.cost_price),
        cost_price: Number(item.cost_price),
        sale_price: Number(item.new_product.sale_price),
        selling_price: Number(item.new_product.sale_price),
        min_stock_level: Number(item.new_product.min_stock_level),
        min_stock: Number(item.new_product.min_stock_level),
        location: item.new_product.location.trim() || null,
      };
    } else {
      payload.product_id = Number(item.product_id);
    }

    return payload;
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
      supplier_id: Number(supplierId),
      paid_amount: paymentTotal(payments),
      payments: normalizePaymentsPayload(payments),
      items: items.map(buildItemPayload),
    };

    try {
      await axiosClient.post("/purchases", payload);
      navigate("/purchases");
    } catch (err) {
      setError(errorMessage(err, "Unable to create purchase"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Create Purchase</h1>
          <p className="page-subtitle">Record supplier stock coming into inventory.</p>
        </div>
        <Link className="btn btn-secondary" to="/purchases">
          Back to Purchases
        </Link>
      </div>

      <form className="card form" onSubmit={submit}>
        {error ? <p className="error-text">{error}</p> : null}

        <div className="form-row">
          <SearchableSelect
            emptyLabel="Select supplier"
            getOptionLabel={(supplier) => supplier.name}
            getOptionSearchText={(supplier) => [supplier.name, supplier.phone, supplier.email].filter(Boolean).join(" ")}
            label="Supplier"
            onChange={setSupplierId}
            options={suppliers}
            placeholder="Search supplier"
            value={supplierId}
          />
        </div>

        <PaymentSplitInput payments={payments} onChange={setPayments} maxAmount={totalAmount} title="Supplier Payments" />

        <div className="item-table">
          <div className="item-table-header">
            <strong>Items</strong>
            <Button variant="secondary" icon={Plus} onClick={addItem} disabled={optionsLoading}>
              Add Item
            </Button>
          </div>

          {items.map((item, index) => {
            const subtotal = Number(item.quantity || 0) * Number(item.cost_price || 0);
            return (
              <div className="purchase-item" key={index}>
                <div className="item-row">
                  <SearchableSelect
                    emptyLabel="Select product"
                    getOptionDescription={productDescription}
                    getOptionLabel={productLabel}
                    getOptionSearchText={productSearchText}
                    label="Product"
                    onChange={(value) => updateItem(index, "product_id", value)}
                    options={[{ id: "__new__" }, ...products]}
                    placeholder="Search product, part no, category"
                    value={item.product_mode === "new" ? "__new__" : item.product_id}
                  />
                  <label className="form-field">
                    <span>Quantity</span>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updateItem(index, "quantity", event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Cost Price</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.cost_price}
                      onChange={(event) => updateItem(index, "cost_price", event.target.value)}
                    />
                  </label>
                  <div className="item-subtotal">
                    <span>Subtotal</span>
                    <strong>{formatCurrency(subtotal)}</strong>
                  </div>
                  <button className="icon-button" type="button" onClick={() => removeItem(index)} aria-label="Remove item">
                    <Trash2 size={16} />
                  </button>
                </div>

                {item.product_mode === "new" ? (
                  <div className="new-product-panel">
                    <div className="new-product-header">
                      <strong>New product details</strong>
                      <button className="btn btn-secondary btn-small" type="button" onClick={() => useExistingProduct(index)}>
                        <X size={15} aria-hidden="true" />
                        <span>Use Existing</span>
                      </button>
                    </div>

                    <div className="form-row">
                      <label className="form-field">
                        <span>Part Number</span>
                        <input
                          className="input"
                          value={item.new_product.sku}
                          onChange={(event) => updateNewProduct(index, "sku", event.target.value)}
                          onBlur={() => normalizeNewProductSku(index)}
                          onKeyDown={(event) => handleNewProductSkuKeyDown(index, event)}
                          placeholder="SKU or OEM number"
                        />
                      </label>
                      <label className="form-field">
                        <span>Name</span>
                        <input
                          className="input"
                          value={item.new_product.name}
                          onChange={(event) => updateNewProduct(index, "name", event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <SearchableSelect
                        emptyLabel="Select category"
                        getOptionLabel={(category) => category.name}
                        label="Category"
                        onChange={(value) => updateNewProduct(index, "category_id", value)}
                        options={categories}
                        placeholder="Search category"
                        value={item.new_product.category_id}
                      />
                      <SearchableSelect
                        emptyLabel="Select brand"
                        getOptionLabel={(brand) => brand.name}
                        label="Brand"
                        onChange={(value) => updateNewProduct(index, "brand_id", value)}
                        options={brands}
                        placeholder="Search brand"
                        value={item.new_product.brand_id}
                      />
                    </div>

                    <div className="form-row">
                      <label className="form-field">
                        <span>Selling Price</span>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.new_product.sale_price}
                          onChange={(event) => updateNewProduct(index, "sale_price", event.target.value)}
                        />
                      </label>
                      <label className="form-field">
                        <span>Min Stock</span>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          value={item.new_product.min_stock_level}
                          onChange={(event) => updateNewProduct(index, "min_stock_level", event.target.value)}
                        />
                      </label>
                    </div>

                    <label className="form-field">
                      <span>Location</span>
                      <input
                        className="input"
                        value={item.new_product.location}
                        onChange={(event) => updateNewProduct(index, "location", event.target.value)}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="total-row">
          <span>Total Amount</span>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>

        <div className="form-actions">
          <Button type="submit" icon={Save} disabled={loading || optionsLoading}>
            {loading ? "Saving" : "Save Purchase"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreatePurchase;
