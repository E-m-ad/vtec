import {
  AlertTriangle,
  BarChart3,
  CarFront,
  PackageX,
  PhoneCall,
  Printer,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import StatCard from "../components/StatCard";
import TablePagination from "../components/TablePagination";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import {
  getCarLabel,
  getProductBrandName,
  getProductCategoryName,
  getProductLocation,
  getProductMinStock,
  getProductSku,
  getProductStock,
} from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const settleData = (result, fallback = []) => {
  if (result.status !== "fulfilled") return fallback;
  return unwrapData(result.value, fallback);
};

const reportDateFormatter = new Intl.DateTimeFormat("en-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});

const getProductName = (product) => product?.name || product?.product_name || product?.product?.name || "-";
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
const reportTabs = [
  { id: "performance", label: "Performance" },
  { id: "inventory", label: "Inventory" },
  { id: "customer-cars", label: "Customer Cars" },
];

const getCustomerContact = (row) => row.customer_phone || row.customerPhone || row.customer_email || row.customerEmail || "";

const defaultWhatsappMessage =
  "أهلاً {customerName}، معك فريق VTEC. لأنك من عملائنا المميزين، حضّرنا لك عرض خاص وخصم على قطع الغيار لسيارتك {car}. يسعدنا تواصلك معنا للاستفادة من العرض.";

const getCustomerName = (row) => row.customer_name || row.customerName || "عميلنا العزيز";

const buildWhatsappMessage = (template, row) => {
  const message = String(template || "").trim();
  if (!message) return "";

  const replacements = {
    customerName: getCustomerName(row),
    name: getCustomerName(row),
    car: getCarLabel(row, "سيارتك"),
    totalSpend: formatCurrency(row.sales_amount ?? row.salesAmount ?? 0),
    lastVisit: formatDate(row.last_sale_date ?? row.lastSaleDate),
  };

  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, value),
    message,
  );
};

const getWhatsappUrl = (phone, message = "") => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";

  const normalizedPhone = digits.startsWith("00")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? `20${digits.slice(1)}`
      : /^1[0125]\d{8}$/.test(digits)
        ? `20${digits}`
        : digits;
  const text = String(message || "").trim();

  return `https://wa.me/${normalizedPhone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

const getRequiredQuantity = (product) => {
  const stock = getProductStock(product);
  const minStock = getProductMinStock(product);

  if (stock === 0) return Math.max(minStock, 1);

  return Math.max(minStock - stock, 1);
};

const getReportRows = (products) =>
  products.map((product) => ({
    id: product.id ?? getProductSku(product) ?? getProductName(product),
    name: getProductName(product),
    sku: getProductSku(product) || "-",
    brand: getProductBrandName(product) || "-",
    category: getProductCategoryName(product) || "-",
    location: getProductLocation(product) || "-",
    stock: getProductStock(product),
    minStock: getProductMinStock(product),
    buyQuantity: getRequiredQuantity(product),
  }));

const PrintInventoryReport = ({ active, generatedAt, rows, title }) => {
  const totalQuantity = rows.reduce((sum, row) => sum + row.buyQuantity, 0);

  return (
    <section className={`print-report ${active ? "print-report-active" : ""}`}>
      <header className="print-report-header">
        <div>
          <span>VTEC Spare Parts ERP</span>
          <h1>{title}</h1>
        </div>
        <div className="print-report-meta">
          <strong>{generatedAt}</strong>
          <span>{rows.length} products</span>
          <span>{totalQuantity} units to buy</span>
        </div>
      </header>

      <table className="print-report-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Part Number</th>
            <th>Brand</th>
            <th>Category</th>
            <th>Location</th>
            <th>Stock</th>
            <th>Min</th>
            <th>Qty to Buy</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.sku}</td>
                <td>{row.brand}</td>
                <td>{row.category}</td>
                <td>{row.location}</td>
                <td>{row.stock}</td>
                <td>{row.minStock}</td>
                <td className="print-report-buy-qty">{row.buyQuantity}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8">No products need purchase.</td>
            </tr>
          )}
        </tbody>
      </table>

      <footer className="print-report-footer">
        <span>Prepared for purchasing review</span>
        <span>Manager signature: ____________________</span>
      </footer>
    </section>
  );
};

const ReportPagination = ({ loading, onPageChange, page, pagination }) => {
  const total = Number(pagination.total || 0);
  const pageCount = Math.max(Number(pagination.page_count || 1), 1);
  const firstRow = total ? Number(pagination.offset || 0) + 1 : 0;
  const lastRow = Math.min(Number(pagination.offset || 0) + Number(pagination.limit || 0), total);

  return (
    <TablePagination
      firstItem={firstRow}
      itemLabel="products"
      lastItem={lastRow}
      loading={loading}
      onPageChange={onPageChange}
      page={page}
      pageCount={pageCount}
      total={total}
    />
  );
};

const Reports = () => {
  const [lowStock, setLowStock] = useState([]);
  const [outOfStock, setOutOfStock] = useState([]);
  const [lowStockPage, setLowStockPage] = useState(1);
  const [outOfStockPage, setOutOfStockPage] = useState(1);
  const [stockAlertPageSize, setStockAlertPageSize] = useState(50);
  const [lowStockPagination, setLowStockPagination] = useState(emptyPagination);
  const [outOfStockPagination, setOutOfStockPagination] = useState(emptyPagination);
  const [profit, setProfit] = useState({});
  const [topSelling, setTopSelling] = useState([]);
  const [topCars, setTopCars] = useState([]);
  const [whatsappMessage, setWhatsappMessage] = useState(defaultWhatsappMessage);
  const [printRows, setPrintRows] = useState({ lowStock: null, outOfStock: null });
  const [printMode, setPrintMode] = useState("");
  const [activeTab, setActiveTab] = useState("performance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      const [lowStockResult, outOfStockResult, salesSummaryResult, purchaseSummaryResult] = await Promise.allSettled([
        axiosClient.get("/reports/low-stock", {
          params: {
            limit: stockAlertPageSize,
            offset: (lowStockPage - 1) * stockAlertPageSize,
          },
        }),
        axiosClient.get("/reports/out-of-stock", {
          params: {
            limit: stockAlertPageSize,
            offset: (outOfStockPage - 1) * stockAlertPageSize,
          },
        }),
        axiosClient.get("/reports/sales-summary"),
        axiosClient.get("/reports/purchase-summary"),
      ]);

      if (
        [lowStockResult, outOfStockResult, salesSummaryResult, purchaseSummaryResult].every(
          (result) => result.status === "rejected",
        )
      ) {
        setError(errorMessage(lowStockResult.reason, "Unable to load reports"));
      }

      const lowStockData = settleData(lowStockResult, {});
      const outOfStockData = settleData(outOfStockResult, {});
      const salesSummary = salesSummaryResult.status === "fulfilled" ? unwrapData(salesSummaryResult.value, {}) : {};
      const purchaseSummary =
        purchaseSummaryResult.status === "fulfilled" ? unwrapData(purchaseSummaryResult.value, {}) : {};
      const revenue = Number(salesSummary?.summary?.total_sales_amount ?? 0);
      const cost = Number(purchaseSummary?.summary?.total_purchase_amount ?? 0);
      const nextLowStockPagination = {
        ...emptyPagination,
        limit: stockAlertPageSize,
        ...lowStockData?.pagination,
      };
      const nextOutOfStockPagination = {
        ...emptyPagination,
        limit: stockAlertPageSize,
        ...outOfStockData?.pagination,
      };

      setLowStock(listFrom(lowStockData));
      setOutOfStock(listFrom(outOfStockData));
      setLowStockPagination(nextLowStockPagination);
      setOutOfStockPagination(nextOutOfStockPagination);
      if (lowStockPage > nextLowStockPagination.page_count) {
        setLowStockPage(nextLowStockPagination.page_count);
      }
      if (outOfStockPage > nextOutOfStockPagination.page_count) {
        setOutOfStockPage(nextOutOfStockPagination.page_count);
      }
      setProfit({
        total_revenue: revenue,
        total_cost: cost,
        profit: revenue - cost,
      });
      setTopSelling(listFrom(salesSummary?.top_products ?? []));
      setTopCars(listFrom(salesSummary?.top_cars ?? []));
      setLoading(false);
    };

    load();
  }, [lowStockPage, outOfStockPage, stockAlertPageSize]);

  useEffect(() => {
    const clearPrintMode = () => setPrintMode("");

    window.addEventListener("afterprint", clearPrintMode);

    return () => window.removeEventListener("afterprint", clearPrintMode);
  }, []);

  const profitCards = useMemo(
    () => [
      {
        title: "Net Revenue",
        value: formatCurrency(profit.total_revenue ?? profit.revenue ?? profit.totalSales ?? 0),
        icon: TrendingUp,
        tone: "success",
      },
      {
        title: "Cost",
        value: formatCurrency(profit.total_cost ?? profit.cost ?? 0),
        icon: BarChart3,
        tone: "neutral",
      },
      {
        title: "Profit",
        value: formatCurrency(profit.profit ?? profit.gross_profit ?? 0),
        icon: TrendingUp,
        tone: "info",
      },
    ],
    [profit],
  );
  const lowStockRows = useMemo(() => getReportRows(lowStock), [lowStock]);
  const outOfStockRows = useMemo(() => getReportRows(outOfStock), [outOfStock]);
  const generatedAt = reportDateFormatter.format(new Date());

  const updateStockAlertPageSize = (event) => {
    setStockAlertPageSize(Number(event.target.value));
    setLowStockPage(1);
    setOutOfStockPage(1);
  };

  const printReport = async (mode) => {
    const isLowStock = mode === "low-stock";
    const endpoint = isLowStock ? "/reports/low-stock" : "/reports/out-of-stock";

    try {
      const response = await axiosClient.get(endpoint);
      setPrintRows((current) => ({
        ...current,
        [isLowStock ? "lowStock" : "outOfStock"]: getReportRows(listFrom(unwrapData(response, []))),
      }));
    } catch (err) {
      setPrintRows((current) => ({
        ...current,
        [isLowStock ? "lowStock" : "outOfStock"]: isLowStock ? lowStockRows : outOfStockRows,
      }));
      setError(errorMessage(err, "Unable to load full print report"));
    }

    setPrintMode(mode);
    window.setTimeout(() => window.print(), 80);
  };

  return (
    <div className={`page reports-page ${printMode ? "reports-printing" : ""}`}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Inventory risk and sales performance summaries.</p>
        </div>
      </div>

      {error ? <div className="card error-text">{error}</div> : null}

      <nav className="page-tabs reports-tabs" aria-label="Report sections">
        {reportTabs.map((tab) => (
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

      {activeTab === "performance" ? (
        <>
          <section className="grid grid-3">
            {profitCards.map((card) => (
              <StatCard key={card.title} {...card} />
            ))}
          </section>

          <section className="card">
            <div className="section-header">
              <h2>Top Selling Products</h2>
              <TrendingUp size={18} aria-hidden="true" />
            </div>
            <DataTable
              loading={loading}
              columns={[
                { header: "Product", render: (row) => row.name || row.product_name || row.product?.name || "-" },
                { header: "Part Number", render: (row) => row.sku || row.product_sku || row.product?.sku || "-" },
                { header: "Units Sold", render: (row) => row.units_sold ?? row.quantity ?? row.total_quantity ?? 0 },
                { header: "Sales Amount", render: (row) => formatCurrency(row.sales_amount ?? row.total_sales ?? 0) },
              ]}
              data={topSelling}
              emptyMessage="No top selling data"
            />
          </section>
        </>
      ) : null}

      {activeTab === "inventory" ? (
        <>
          <section className="card report-alert-card">
            <div className="section-header report-alert-header">
              <div className="section-title-with-icon">
                <h2>Low Stock Products</h2>
                <AlertTriangle size={18} aria-hidden="true" />
              </div>
              <div className="report-alert-actions no-print">
                <span className="badge badge-warning">{lowStockPagination.total} products</span>
                <label className="products-page-size">
                  <span>Rows</span>
                  <select className="select" value={stockAlertPageSize} onChange={updateStockAlertPageSize}>
                    {pageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  icon={Printer}
                  onClick={() => printReport("low-stock")}
                  variant="secondary"
                  disabled={loading}
                >
                  Print
                </Button>
              </div>
            </div>
            <DataTable
              loading={loading}
              columns={[
                { header: "Product", accessor: "name" },
                { header: "Part Number", render: (row) => getProductSku(row) || "-" },
                { header: "Brand", render: (row) => getProductBrandName(row) || "-" },
                { header: "Location", render: (row) => getProductLocation(row) || "-" },
                { header: "Stock", render: (row) => row.stock_quantity ?? row.stockQuantity ?? 0 },
                { header: "Min Stock", render: (row) => row.min_stock ?? row.min_stock_level ?? row.minStockLevel ?? 0 },
                { header: "Qty to Buy", render: (row) => getRequiredQuantity(row) },
              ]}
              data={lowStock}
              emptyMessage="No low stock products"
            />
            <ReportPagination
              loading={loading}
              onPageChange={setLowStockPage}
              page={lowStockPage}
              pagination={lowStockPagination}
            />
          </section>

          <section className="card report-alert-card">
            <div className="section-header report-alert-header">
              <div className="section-title-with-icon">
                <h2>Out of Stock Products</h2>
                <PackageX size={18} aria-hidden="true" />
              </div>
              <div className="report-alert-actions no-print">
                <span className="badge badge-danger">{outOfStockPagination.total} products</span>
                <label className="products-page-size">
                  <span>Rows</span>
                  <select className="select" value={stockAlertPageSize} onChange={updateStockAlertPageSize}>
                    {pageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  icon={Printer}
                  onClick={() => printReport("out-of-stock")}
                  variant="secondary"
                  disabled={loading}
                >
                  Print
                </Button>
              </div>
            </div>
            <DataTable
              loading={loading}
              columns={[
                { header: "Product", accessor: "name" },
                { header: "Part Number", render: (row) => getProductSku(row) || "-" },
                { header: "Brand", render: (row) => row.brand_name || row.brand?.name || "-" },
                { header: "Category", render: (row) => getProductCategoryName(row) || "-" },
                { header: "Location", render: (row) => getProductLocation(row) || "-" },
                { header: "Min Stock", render: (row) => getProductMinStock(row) },
                { header: "Qty to Buy", render: (row) => getRequiredQuantity(row) },
              ]}
              data={outOfStock}
              emptyMessage="No out of stock products"
            />
            <ReportPagination
              loading={loading}
              onPageChange={setOutOfStockPage}
              page={outOfStockPage}
              pagination={outOfStockPagination}
            />
          </section>
        </>
      ) : null}

      {activeTab === "customer-cars" ? (
        <section className="card">
          <div className="section-header">
            <div className="section-title-with-icon">
              <h2>Top Customer Cars</h2>
              <CarFront size={18} aria-hidden="true" />
            </div>
            <PhoneCall size={18} aria-hidden="true" />
          </div>
          <label className="form-field whatsapp-message-field">
            <span>WhatsApp Message</span>
            <textarea
              className="textarea"
              dir="rtl"
              rows="3"
              value={whatsappMessage}
              onChange={(event) => setWhatsappMessage(event.target.value)}
            />
          </label>
          <DataTable
            loading={loading}
            columns={[
              {
                header: "Car",
                render: (row) =>
                  row.id ? (
                    <Link className="text-link" to={`/cars/${row.id}`}>
                      {getCarLabel(row)}
                    </Link>
                  ) : (
                    getCarLabel(row)
                  ),
              },
              { header: "Customer", render: (row) => getCustomerName(row) },
              {
                header: "Contact",
                render: (row) => {
                  const contact = getCustomerContact(row);
                  if (!contact) return "-";

                  const whatsappUrl = getWhatsappUrl(
                    row.customer_phone || row.customerPhone,
                    buildWhatsappMessage(whatsappMessage, row),
                  );

                  return whatsappUrl ? (
                    <a className="text-link" href={whatsappUrl} target="_blank" rel="noreferrer">
                      {contact}
                    </a>
                  ) : (
                    <a className="text-link" href={`mailto:${contact}`}>
                      {contact}
                    </a>
                  );
                },
              },
              { header: "Invoices", render: (row) => row.sale_count ?? row.saleCount ?? 0 },
              { header: "Total Spend", render: (row) => formatCurrency(row.sales_amount ?? row.salesAmount ?? 0) },
              { header: "Paid", render: (row) => formatCurrency(row.paid_amount ?? row.paidAmount ?? 0) },
              { header: "Last Visit", render: (row) => formatDate(row.last_sale_date ?? row.lastSaleDate) },
            ]}
            data={topCars}
            emptyMessage="No customer car sales yet"
          />
        </section>
      ) : null}

      <PrintInventoryReport
        active={printMode === "low-stock"}
        generatedAt={generatedAt}
        rows={printRows.lowStock ?? lowStockRows}
        title="Low Stock Purchase Report"
      />
      <PrintInventoryReport
        active={printMode === "out-of-stock"}
        generatedAt={generatedAt}
        rows={printRows.outOfStock ?? outOfStockRows}
        title="Out of Stock Purchase Report"
      />
    </div>
  );
};

export default Reports;
