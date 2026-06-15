import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import LoadingSpinner from "../components/LoadingSpinner";
import SearchableSelect from "../components/SearchableSelect";
import {
  getProductCost,
  getProductLocation,
  getProductMinStock,
  getProductPrice,
  getProductSku,
  getProductStock,
} from "../utils/fields";
import { normalizePartNumber } from "../utils/partNumber";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const initialForm = {
  name: "",
  part_number: "",
  description: "",
  category_id: "",
  brand_id: "",
  location: "",
  cost_price: "0",
  selling_price: "0",
  stock_quantity: "0",
  min_stock: "0",
};

const ProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [errors, setErrors] = useState({});
  const [pageError, setPageError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setInitialLoading(true);
      try {
        const [categoriesResponse, brandsResponse] = await Promise.all([
          axiosClient.get("/categories"),
          axiosClient.get("/brands"),
        ]);
        setCategories(listFrom(unwrapData(categoriesResponse, [])));
        setBrands(listFrom(unwrapData(brandsResponse, [])));

        if (isEdit) {
          const productResponse = await axiosClient.get(`/products/${id}`);
          const product = unwrapData(productResponse, {});
          setForm({
            name: product.name || "",
            part_number: getProductSku(product),
            description: product.description || "",
            category_id: product.category_id || product.categoryId || "",
            brand_id: product.brand_id || product.brandId || "",
            location: getProductLocation(product),
            cost_price: String(getProductCost(product)),
            selling_price: String(getProductPrice(product)),
            stock_quantity: String(getProductStock(product)),
            min_stock: String(getProductMinStock(product)),
          });
        }
      } catch (err) {
        setPageError(errorMessage(err, "Unable to load product form"));
      } finally {
        setInitialLoading(false);
      }
    };

    load();
  }, [id, isEdit]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const updateFormValue = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const normalizePartNumberField = () => {
    setForm((current) => ({
      ...current,
      part_number: normalizePartNumber(current.part_number),
    }));
  };

  const handlePartNumberKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    normalizePartNumberField();
  };

  const prepareForm = () => ({
    ...form,
    part_number: normalizePartNumber(form.part_number),
  });

  const validate = (nextForm = form) => {
    const nextErrors = {};
    if (!nextForm.name.trim()) nextErrors.name = "Name is required";
    if (!nextForm.part_number.trim()) nextErrors.part_number = "Part number is required";

    ["cost_price", "selling_price"].forEach((field) => {
      const value = Number(nextForm[field]);
      if (!Number.isFinite(value) || value < 0) {
        nextErrors[field] = "Must be 0 or greater";
      }
    });

    ["stock_quantity", "min_stock"].forEach((field) => {
      const value = Number(nextForm[field]);
      if (!Number.isInteger(value) || value < 0) {
        nextErrors[field] = "Must be a whole number 0 or greater";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = (nextForm = form) => {
    const payload = {
      name: nextForm.name.trim(),
      part_number: nextForm.part_number.trim(),
      sku: nextForm.part_number.trim(),
      description: nextForm.description,
      category_id: nextForm.category_id ? Number(nextForm.category_id) : null,
      brand_id: nextForm.brand_id ? Number(nextForm.brand_id) : null,
      location: nextForm.location.trim() || null,
      cost_price: Number(nextForm.cost_price),
      purchase_price: Number(nextForm.cost_price),
      selling_price: Number(nextForm.selling_price),
      sale_price: Number(nextForm.selling_price),
      min_stock: Number(nextForm.min_stock),
      min_stock_level: Number(nextForm.min_stock),
    };

    if (!isEdit) {
      payload.stock_quantity = Number(nextForm.stock_quantity);
      payload.initial_stock_quantity = Number(nextForm.stock_quantity);
    }

    return payload;
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextForm = prepareForm();
    setForm(nextForm);
    if (!validate(nextForm)) return;

    setLoading(true);
    setPageError("");

    try {
      if (isEdit) {
        await axiosClient.put(`/products/${id}`, buildPayload(nextForm));
      } else {
        await axiosClient.post("/products", buildPayload(nextForm));
      }
      navigate("/products");
    } catch (err) {
      setPageError(errorMessage(err, "Unable to save product"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEdit ? "Edit Product" : "Add Product"}</h1>
          <p className="page-subtitle">Product details, pricing, and stock thresholds.</p>
        </div>
        <Link className="btn btn-secondary" to="/products">
          Back to Products
        </Link>
      </div>

      <section className="card">
        {pageError ? <p className="error-text form-alert">{pageError}</p> : null}
        {initialLoading ? (
          <div className="table-state">
            <LoadingSpinner />
          </div>
        ) : (
        <form className="form" onSubmit={submit}>
          <div className="form-row">
            <FormInput label="Name" name="name" value={form.name} onChange={updateField} error={errors.name} />
            <FormInput
              label="Part Number"
              name="part_number"
              value={form.part_number}
              onChange={updateField}
              onBlur={normalizePartNumberField}
              onKeyDown={handlePartNumberKeyDown}
              placeholder="SKU or OEM number"
              error={errors.part_number}
            />
          </div>

          <label className="form-field">
            <span>Description</span>
            <textarea className="textarea" name="description" value={form.description} onChange={updateField} />
          </label>

          <FormInput
            label="Location"
            name="location"
            value={form.location}
            onChange={updateField}
            placeholder="Shelf, aisle, or warehouse location"
          />

          <div className="form-row">
            <SearchableSelect
              emptyLabel="Select category"
              getOptionLabel={(category) => category.name}
              label="Category"
              onChange={(value) => updateFormValue("category_id", value)}
              options={categories}
              placeholder="Search category"
              value={form.category_id}
            />
            <SearchableSelect
              emptyLabel="Select brand"
              getOptionLabel={(brand) => brand.name}
              label="Brand"
              onChange={(value) => updateFormValue("brand_id", value)}
              options={brands}
              placeholder="Search brand"
              value={form.brand_id}
            />
          </div>

          <div className="form-row">
            <FormInput
              label="Cost Price"
              name="cost_price"
              value={form.cost_price}
              onChange={updateField}
              type="number"
              min="0"
              error={errors.cost_price}
            />
            <FormInput
              label="Selling Price"
              name="selling_price"
              value={form.selling_price}
              onChange={updateField}
              type="number"
              min="0"
              error={errors.selling_price}
            />
          </div>

          <div className="form-row">
            <FormInput
              label="Stock Quantity"
              name="stock_quantity"
              value={form.stock_quantity}
              onChange={updateField}
              type="number"
              min="0"
              disabled={isEdit}
              error={errors.stock_quantity}
            />
            <FormInput
              label="Min Stock"
              name="min_stock"
              value={form.min_stock}
              onChange={updateField}
              type="number"
              min="0"
              error={errors.min_stock}
            />
          </div>

          <div className="form-actions">
            <Button type="submit" icon={Save} disabled={loading}>
              {loading ? "Saving" : "Save Product"}
            </Button>
          </div>
        </form>
        )}
      </section>
    </div>
  );
};

export default ProductForm;
