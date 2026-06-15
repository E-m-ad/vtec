import JsBarcode from "jsbarcode";
import {
  Barcode,
  ChevronDown,
  ChevronRight,
  Edit,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import SearchInput from "../components/SearchInput";
import SearchableSelect from "../components/SearchableSelect";
import TablePagination from "../components/TablePagination";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import {
  getProductBrandName,
  getProductCategoryName,
  getProductCost,
  getProductLocation,
  getProductMinStock,
  getProductPrice,
  getProductSku,
  getProductStock,
  productStatus,
} from "../utils/fields";
import { normalizePartNumberSearch } from "../utils/partNumber";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getProductDescription = (product) =>
  String(product?.description || "").trim();
const pageSizeOptions = [25, 50, 100];
const emptyPagination = {
  total: 0,
  limit: 50,
  offset: 0,
  page: 1,
  page_count: 1,
  has_previous: false,
  has_next: false,
};

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState(emptyPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [supplierSourceState, setSupplierSourceState] = useState({});

  const loadOptions = async () => {
    const [categoryResponse, brandResponse] = await Promise.all([
      axiosClient.get("/categories"),
      axiosClient.get("/brands"),
    ]);
    setCategories(listFrom(unwrapData(categoryResponse, [])));
    setBrands(listFrom(unwrapData(brandResponse, [])));
  };

  const loadProducts = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        search: normalizePartNumberSearch(search) || undefined,
        category_id: categoryId || undefined,
        brand_id: brandId || undefined,
        is_active: true,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      const response = await axiosClient.get("/products", { params });
      const data = unwrapData(response, {});
      const nextPagination = {
        ...emptyPagination,
        limit: pageSize,
        ...data?.pagination,
      };

      setProducts(listFrom(data));
      setPagination(nextPagination);
      setExpandedProductId(null);

      if (nextPagination.page_count && page > nextPagination.page_count) {
        setPage(nextPagination.page_count);
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to load products"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadProducts, 250);
    return () => clearTimeout(timer);
  }, [search, categoryId, brandId, page, pageSize]);

  const submitSearch = (value) => {
    setSearch(normalizePartNumberSearch(value));
    setPage(1);
  };

  const updateSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const updateCategory = (value) => {
    setCategoryId(value);
    setPage(1);
  };

  const updateBrand = (value) => {
    setBrandId(value);
    setPage(1);
  };

  const updatePageSize = (event) => {
    setPageSize(Number(event.target.value));
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryId("");
    setBrandId("");
    setPage(1);
  };

  const loadProductSupplierSources = async (productId) => {
    const currentState = supplierSourceState[productId];
    if (currentState?.loading || currentState?.loaded) return;

    setSupplierSourceState((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] || {}),
        error: "",
        loading: true,
      },
    }));

    try {
      const response = await axiosClient.get(`/products/${productId}/suppliers`);
      const data = unwrapData(response, {});

      setSupplierSourceState((current) => ({
        ...current,
        [productId]: {
          error: "",
          loaded: true,
          loading: false,
          sources: Array.isArray(data?.sources) ? data.sources : [],
          totalSuppliers: Number(data?.total_suppliers || data?.totalSuppliers || 0),
        },
      }));
    } catch (err) {
      setSupplierSourceState((current) => ({
        ...current,
        [productId]: {
          ...(current[productId] || {}),
          error: errorMessage(err, "Unable to load product supplier sources"),
          loaded: false,
          loading: false,
          sources: [],
        },
      }));
    }
  };

  const toggleProductRow = (product) => {
    const productId = product.id;

    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }

    setExpandedProductId(productId);
    loadProductSupplierSources(productId);
  };

  const columns = useMemo(
    () => [
      {
        header: "Name",
        render: (row) => {
          const isExpanded = expandedProductId === row.id;

          return (
            <div className="product-name-expand">
              <span className="product-row-chevron" aria-hidden="true">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
              <span>{row.name || "-"}</span>
            </div>
          );
        },
      },
      { header: "Part Number", render: (row) => getProductSku(row) || "-" },
      {
        header: "Category",
        render: (row) => getProductCategoryName(row) || "-",
      },
      { header: "Brand", render: (row) => getProductBrandName(row) || "-" },
      { header: "Location", render: (row) => getProductLocation(row) || "-" },
      {
        header: "Cost Price",
        render: (row) => formatCurrency(getProductCost(row)),
      },
      {
        header: "Selling Price",
        render: (row) => formatCurrency(getProductPrice(row)),
      },
      { header: "Stock", render: (row) => getProductStock(row) },
      { header: "Min Stock", render: (row) => getProductMinStock(row) },
      {
        header: "Status",
        render: (row) => {
          const status = productStatus(row);
          return (
            <span className={`badge ${status.className}`}>{status.label}</span>
          );
        },
      },
      {
        header: "Actions",
        render: (row) => (
          <div className="actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => printBarcode(row)}
              aria-label="Print barcode"
            >
              <Barcode size={16} />
            </button>
            <Link
              className="icon-button"
              to={`/products/${row.id}/edit`}
              aria-label="Edit product"
            >
              <Edit size={16} />
            </Link>
            <button
              className="icon-button"
              type="button"
              onClick={() => setDeleteTarget(row)}
              aria-label="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ),
      },
    ],
    [expandedProductId],
  );

  const printBarcode = (product) => {
    const partNumber = getProductSku(product);

    if (!partNumber) {
      setError("Part number is required to print barcode");
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    try {
      JsBarcode(svg, partNumber, {
        format: "CODE128",
        displayValue: true,
        font: "Arial",
        fontSize: 18,
        height: 80,
        margin: 12,
        textMargin: 6,
        width: 2,
      });
    } catch {
      setError("Unable to generate barcode for this part number");
      return;
    }

    const printWindow = window.open("", "_blank", "width=520,height=520");
    if (!printWindow) {
      setError("Allow popups to print the barcode");
      return;
    }

    const productName = escapeHtml(product.name || "Product");
    const safePartNumber = escapeHtml(partNumber);

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Barcode ${safePartNumber}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              color: #111827;
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 24px;
            }
            .label {
              align-items: center;
              border: 1px solid #d1d5db;
              display: flex;
              flex-direction: column;
              gap: 10px;
              justify-content: center;
              min-height: 240px;
              padding: 18px;
              text-align: center;
              width: 360px;
            }
            .product-name {
              font-size: 16px;
              font-weight: 700;
            }
            .part-number {
              font-size: 13px;
              color: #4b5563;
            }
            svg {
              max-width: 100%;
            }
            @media print {
              body { padding: 0; }
              .label { border: 0; width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="product-name">${productName}</div>
            ${svg.outerHTML}
            <div class="part-number">${safePartNumber}</div>
          </div>
          <script>
            window.addEventListener("load", () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axiosClient.delete(`/products/${deleteTarget.id}`);
      setProducts((current) =>
        current.filter((product) => product.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      loadProducts();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete product"));
      setDeleteTarget(null);
    }
  };

  const renderProductDetail = (product) => {
    if (expandedProductId !== product.id) return null;

    const description = getProductDescription(product);
    const sourceState = supplierSourceState[product.id] || {};
    const sources = Array.isArray(sourceState.sources) ? sourceState.sources : [];

    return (
      <div className="product-source-detail">
        {description ? (
          <div className="product-table-description" dir="auto">
            <p>{description}</p>
          </div>
        ) : null}

        <div className="product-source-panel">
          <div className="product-source-header">
            <div>
              <h3>Supplier Sources</h3>
              <p>
                Purchase history grouped by supplier for this product.
              </p>
            </div>
            {sourceState.loaded ? (
              <span className="badge badge-neutral">
                {sourceState.totalSuppliers || sources.length} suppliers
              </span>
            ) : null}
          </div>

          {sourceState.loading ? (
            <div className="product-source-state">Loading supplier sources</div>
          ) : null}

          {sourceState.error ? (
            <p className="error-text product-source-error">{sourceState.error}</p>
          ) : null}

          {!sourceState.loading && !sourceState.error && !sources.length ? (
            <div className="product-source-empty">
              <strong>No supplier purchase history yet</strong>
              <span>
                Opening/imported stock is not linked to supplier invoices.
              </span>
            </div>
          ) : null}

          {sources.length ? (
            <div className="product-source-table-wrapper">
              <table className="product-source-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Last Purchase</th>
                    <th>Last Unit Cost</th>
                    <th>Avg Unit Cost</th>
                    <th>Total Qty</th>
                    <th>Total Value</th>
                    <th>Invoices</th>
                    <th>Latest Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => {
                    const supplierId = source.supplier_id || source.supplierId;
                    const lastInvoiceId = source.last_invoice_id || source.lastInvoiceId;
                    const lastInvoiceNumber =
                      source.last_invoice_number || source.lastInvoiceNumber;

                    return (
                      <tr key={supplierId || source.supplier_name || source.supplierName}>
                        <td>
                          {supplierId ? (
                            <Link className="text-link" to={`/suppliers/${supplierId}`}>
                              {source.supplier_name || source.supplierName}
                            </Link>
                          ) : (
                            source.supplier_name || source.supplierName || "-"
                          )}
                        </td>
                        <td>{formatDate(source.last_purchase_date || source.lastPurchaseDate)}</td>
                        <td>{formatCurrency(source.last_unit_cost || source.lastUnitCost || 0)}</td>
                        <td>
                          {formatCurrency(
                            source.average_unit_cost || source.averageUnitCost || 0,
                          )}
                        </td>
                        <td>{source.total_quantity || source.totalQuantity || 0}</td>
                        <td>
                          {formatCurrency(source.total_value || source.totalValue || 0)}
                        </td>
                        <td>{source.invoice_count || source.invoiceCount || 0}</td>
                        <td>
                          {lastInvoiceId ? (
                            <Link className="text-link" to={`/purchases/${lastInvoiceId}`}>
                              {lastInvoiceNumber || `Purchase #${lastInvoiceId}`}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const totalProducts = Number(pagination.total || 0);
  const pageCount = Math.max(Number(pagination.page_count || 1), 1);
  const firstProduct = totalProducts
    ? Number(pagination.offset || 0) + 1
    : 0;
  const lastProduct = Math.min(
    Number(pagination.offset || 0) + products.length,
    totalProducts,
  );
  const hasFilters = Boolean(search || categoryId || brandId);

  return (
    <div className="page products-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">
            Manage spare parts, pricing, and stock levels.
          </p>
        </div>
        <Link className="btn btn-primary" to="/products/new">
          <Plus size={17} aria-hidden="true" />
          <span>Add Product</span>
        </Link>
      </div>

      <section className="card products-table-card">
        <div className="toolbar products-table-toolbar">
          <div className="filters">
            <SearchInput
              value={search}
              onBlur={() => submitSearch(search)}
              onChange={updateSearch}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;

                event.preventDefault();
                submitSearch(event.currentTarget.value);
              }}
              placeholder="Search product, description, part number, or category"
            />
            <SearchableSelect
              className="filter-searchable-select"
              emptyLabel="All categories"
              getOptionLabel={(category) => category.name}
              onChange={updateCategory}
              options={categories}
              placeholder="Search category"
              value={categoryId}
            />
            <SearchableSelect
              className="filter-searchable-select"
              emptyLabel="All brands"
              getOptionLabel={(brand) => brand.name}
              onChange={updateBrand}
              options={brands}
              placeholder="Search brand"
              value={brandId}
            />
          </div>
          <div className="products-toolbar-actions">
            {hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            ) : null}
            <label className="products-page-size">
              <span>Rows</span>
              <select
                className="select"
                value={pageSize}
                onChange={updatePageSize}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? <p className="error-text table-error">{error}</p> : null}
        <DataTable
          className="products-data-table"
          columns={columns}
          data={products}
          loading={loading}
          emptyMessage="No products found"
          getRowClassName={(product) =>
            expandedProductId === product.id ? "product-row-expanded" : ""
          }
          onRowClick={toggleProductRow}
          renderDetailRow={renderProductDetail}
        />
        <TablePagination
          firstItem={firstProduct}
          itemLabel="products"
          lastItem={lastProduct}
          loading={loading}
          onPageChange={setPage}
          page={page}
          pageCount={pageCount}
          total={totalProducts}
        />
      </section>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete product"
        message={`Delete ${deleteTarget?.name || "this product"}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Products;
