import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CarFront,
  ClipboardList,
  PackagePlus,
  ReceiptText,
  ShoppingCart,
  Store,
  Truck,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import DataTable from "../components/DataTable";
import LineChart from "../components/LineChart";
import { getCurrentLocale } from "../i18n/language";
import formatCurrency from "../utils/formatCurrency";
import { canAccessPermission } from "../utils/permissions";
import {
  getProductLocation,
  getProductMinStock,
  getProductSku,
} from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import { getUser } from "../utils/storage";

const emptyStats = {
  totalProducts: 0,
  totalCustomers: 0,
  totalCars: 0,
  totalEmployees: 0,
  totalSuppliers: 0,
  lowStock: 0,
  outOfStock: 0,
  periodCashIn: 0,
  periodCashOut: 0,
  periodNetCash: 0,
  periodSaleInvoiceTotal: 0,
  periodPurchaseInvoiceTotal: 0,
  periodSaleCount: 0,
  periodPurchaseCount: 0,
  periodCashInCount: 0,
  periodCashOutCount: 0,
  periodSalesRemaining: 0,
  periodPurchasesRemaining: 0,
};

const emptyTrend = [];
const formatDashboardDate = (date, options) =>
  new Intl.DateTimeFormat(getCurrentLocale(), options).format(date);
const dashboardDateOptions = {
  day: "numeric",
  month: "short",
  weekday: "long",
};
const compactDateOptions = {
  day: "numeric",
  month: "short",
};
const rangeDateOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};
const dayInMs = 24 * 60 * 60 * 1000;
const trendDayLimit = 31;

const periodOptions = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "custom", label: "Custom" },
];

const formatCount = (value) =>
  new Intl.NumberFormat(getCurrentLocale()).format(Number(value ?? 0));
const toDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return today;
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
};

const parseDateInput = (value) => {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  date.setHours(0, 0, 0, 0);

  return date;
};

const getPresetRange = (preset) => {
  const today = startOfToday();
  const yesterday = addDays(today, -1);
  const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstDayLastMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1,
  );
  const lastDayLastMonth = addDays(firstDayThisMonth, -1);

  if (preset === "yesterday") {
    return {
      startDate: toDateInput(yesterday),
      endDate: toDateInput(yesterday),
    };
  }

  if (preset === "this-month") {
    return {
      startDate: toDateInput(firstDayThisMonth),
      endDate: toDateInput(today),
    };
  }

  if (preset === "last-month") {
    return {
      startDate: toDateInput(firstDayLastMonth),
      endDate: toDateInput(lastDayLastMonth),
    };
  }

  return {
    startDate: toDateInput(today),
    endDate: toDateInput(today),
  };
};

const getSummaryParams = ({ startDate, endDate }) => {
  const start = parseDateInput(startDate) || startOfToday();
  const end = parseDateInput(endDate) || start;
  const normalizedStart = start <= end ? start : end;
  const normalizedEnd = start <= end ? end : start;

  return {
    from: toDateInput(normalizedStart),
    to: toDateInput(addDays(normalizedEnd, 1)),
  };
};

const getTrendDays = ({ startDate, endDate }) => {
  const start = parseDateInput(startDate) || startOfToday();
  const end = parseDateInput(endDate) || start;
  const normalizedStart = start <= end ? start : end;
  const normalizedEnd = start <= end ? end : start;
  const totalDays =
    Math.floor((normalizedEnd.getTime() - normalizedStart.getTime()) / dayInMs) +
    1;
  const firstTrendDay =
    totalDays > trendDayLimit
      ? addDays(normalizedEnd, -(trendDayLimit - 1))
      : normalizedStart;
  const trendDays = [];

  for (
    let current = firstTrendDay;
    current <= normalizedEnd;
    current = addDays(current, 1)
  ) {
    trendDays.push(current);
  }

  return trendDays;
};

const formatRange = ({ startDate, endDate }) => {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);

  if (!start || !end) return "Select dates";
  if (toDateInput(start) === toDateInput(end)) {
    return formatDashboardDate(start, rangeDateOptions);
  }

  return `${formatDashboardDate(start, rangeDateOptions)} to ${formatDashboardDate(end, rangeDateOptions)}`;
};

const summaryValue = (result, key) => {
  if (result.status !== "fulfilled") return 0;

  const summary = unwrapData(result.value, {})?.summary || {};

  return Number(summary[key] ?? 0);
};

const Dashboard = () => {
  const [stats, setStats] = useState(emptyStats);
  const [trend, setTrend] = useState(emptyTrend);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [periodPreset, setPeriodPreset] = useState("today");
  const [dateRange, setDateRange] = useState(() => getPresetRange("today"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const user = getUser();

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const dateParams = getSummaryParams(dateRange);
        const trendDays = getTrendDays(dateRange);
        const trendRequests = trendDays.map((day) =>
          axiosClient.get("/reports/cash-flow", {
            params: getSummaryParams({
              startDate: toDateInput(day),
              endDate: toDateInput(day),
            }),
          }),
        );

        const [dashboardResults, trendResults] = await Promise.all([
          Promise.allSettled([
            axiosClient.get("/reports/inventory"),
            axiosClient.get("/customers"),
            axiosClient.get("/cars"),
            axiosClient.get("/employees"),
            axiosClient.get("/suppliers"),
            axiosClient.get("/reports/low-stock"),
            axiosClient.get("/reports/sales-summary", { params: dateParams }),
            axiosClient.get("/reports/purchase-summary", {
              params: dateParams,
            }),
            axiosClient.get("/reports/cash-flow", { params: dateParams }),
          ]),
          Promise.allSettled(trendRequests),
        ]);
        const [
          inventoryRes,
          customersRes,
          carsRes,
          employeesRes,
          suppliersRes,
          lowStockRes,
          salesRes,
          purchasesRes,
          cashFlowRes,
        ] = dashboardResults;

        if (
          [inventoryRes, customersRes, carsRes, employeesRes, suppliersRes, lowStockRes].every(
            (result) => result.status === "rejected",
          )
        ) {
          throw inventoryRes.reason;
        }

        const inventoryReport =
          inventoryRes.status === "fulfilled"
            ? unwrapData(inventoryRes.value, {})
            : {};
        const products = listFrom(inventoryReport);
        const inventorySummary = inventoryReport?.summary || {};
        const customers =
          customersRes.status === "fulfilled"
            ? listFrom(unwrapData(customersRes.value, []))
            : [];
        const cars =
          carsRes.status === "fulfilled"
            ? listFrom(unwrapData(carsRes.value, []))
            : [];
        const employees =
          employeesRes.status === "fulfilled"
            ? listFrom(unwrapData(employeesRes.value, []))
            : [];
        const suppliers =
          suppliersRes.status === "fulfilled"
            ? listFrom(unwrapData(suppliersRes.value, []))
            : [];
        const lowStock =
          lowStockRes.status === "fulfilled"
            ? listFrom(unwrapData(lowStockRes.value, []))
            : [];
        const salesSummary =
          salesRes.status === "fulfilled"
            ? unwrapData(salesRes.value, {})?.summary || {}
            : {};
        const purchaseSummary =
          purchasesRes.status === "fulfilled"
            ? unwrapData(purchasesRes.value, {})?.summary || {}
            : {};
        const cashFlowSummary =
          cashFlowRes.status === "fulfilled"
            ? unwrapData(cashFlowRes.value, {})?.summary || {}
            : {};
        const weeklyTrend = trendDays.map((day, index) => {
          const sales = summaryValue(
            trendResults[index],
            "total_cash_in",
          );
          const purchases = summaryValue(
            trendResults[index],
            "total_cash_out",
          );

          return {
            label: formatDashboardDate(day, compactDateOptions),
            sales,
            purchases,
            net: summaryValue(trendResults[index], "net_cash"),
          };
        });

        setStats({
          totalProducts: Number(inventorySummary.product_count ?? products.length),
          totalCustomers: customers.length,
          totalCars: cars.length,
          totalEmployees: employees.length,
          totalSuppliers: suppliers.length,
          lowStock: lowStock.length,
          outOfStock: products.filter(
            (product) =>
              Number(product.stock_quantity ?? product.stockQuantity) === 0,
          ).length,
          periodCashIn: cashFlowSummary.total_cash_in ?? 0,
          periodCashOut: cashFlowSummary.total_cash_out ?? 0,
          periodNetCash: cashFlowSummary.net_cash ?? 0,
          periodSaleInvoiceTotal: salesSummary.total_sales_amount ?? 0,
          periodPurchaseInvoiceTotal:
            purchaseSummary.total_purchase_amount ?? 0,
          periodSaleCount: salesSummary.sale_count ?? 0,
          periodPurchaseCount: purchaseSummary.purchase_count ?? 0,
          periodCashInCount: cashFlowSummary.cash_in_count ?? 0,
          periodCashOutCount: cashFlowSummary.cash_out_count ?? 0,
          periodSalesRemaining: salesSummary.total_remaining_amount ?? 0,
          periodPurchasesRemaining:
            purchaseSummary.total_remaining_amount ?? 0,
        });
        setTrend(weeklyTrend);
        setLowStockProducts(lowStock.slice(0, 6));
      } catch (err) {
        setError(errorMessage(err, "Unable to load dashboard"));
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [dateRange]);

  const selectedPeriod =
    periodOptions.find((option) => option.value === periodPreset) ||
    periodOptions[0];
  const selectedRangeLabel = formatRange(dateRange);
  const chartRangeLabel =
    trend.length >= trendDayLimit
      ? `Last ${trendDayLimit} days in selected range`
      : selectedRangeLabel;
  const periodBalance = Number(stats.periodNetCash || 0);
  const cashInTrend = trend.map((day) => day.sales);
  const cashOutTrend = trend.map((day) => day.purchases);
  const netTrend = trend.map((day) => day.net);
  const stockTrend = [
    stats.totalProducts,
    Math.max(stats.totalProducts - stats.lowStock, 0),
    stats.lowStock,
    stats.outOfStock,
  ];
  const chartLabels = trend.map((day) => day.label);
  const stockTone = stats.outOfStock
    ? "danger"
    : stats.lowStock
      ? "warning"
      : "success";
  const stockTitle = loading
    ? "Checking stock levels"
    : stats.lowStock
      ? "Restock needed"
      : "Stock looks healthy";
  const stockMessage = loading
    ? "Loading the latest product quantities."
    : stats.lowStock
      ? `${formatCount(stats.lowStock)} products are at or below minimum stock. ${formatCount(stats.outOfStock)} are out of stock.`
      : "All tracked products are above their minimum stock levels.";

  const handlePresetChange = (preset) => {
    setPeriodPreset(preset);

    if (preset !== "custom") {
      setDateRange(getPresetRange(preset));
    }
  };

  const handleRangeChange = (field) => (event) => {
    setPeriodPreset("custom");
    setDateRange((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const kpiCards = [
    {
      title: "Money In",
      value: formatCurrency(stats.periodCashIn),
      detail: `${formatCount(stats.periodCashInCount)} cash entries; invoices ${formatCurrency(stats.periodSaleInvoiceTotal)}, receivable ${formatCurrency(stats.periodSalesRemaining)}`,
      icon: ShoppingCart,
      tone: "success",
      chartData: cashInTrend,
      chartLabel: "Money in trend for the selected period",
    },
    {
      title: "Money Out",
      value: formatCurrency(stats.periodCashOut),
      detail: `${formatCount(stats.periodCashOutCount)} cash entries; invoices ${formatCurrency(stats.periodPurchaseInvoiceTotal)}, payable ${formatCurrency(stats.periodPurchasesRemaining)}`,
      icon: ReceiptText,
      tone: "info",
      chartData: cashOutTrend,
      chartLabel: "Money out trend for the selected period",
    },
    {
      title: "Net Cash",
      value: formatCurrency(periodBalance),
      detail: "Real money in minus real money out",
      icon: WalletCards,
      tone: periodBalance >= 0 ? "success" : "danger",
      chartData: netTrend,
      chartLabel: "Net cash trend for the selected period",
    },
    {
      title: "Stock Alerts",
      value: formatCount(stats.lowStock),
      detail: `${formatCount(stats.outOfStock)} products out of stock`,
      icon: AlertTriangle,
      tone: stockTone,
      chartData: stockTrend,
      chartLabel: "Inventory risk line",
    },
  ];

  const quickActions = [
    {
      label: "Create Sale",
      caption: "Customer invoice",
      to: "/sales/new",
      icon: ShoppingCart,
      tone: "sale",
      permission: "sales",
    },
    {
      label: "Create Purchase",
      caption: "Supplier invoice",
      to: "/purchases/new",
      icon: ReceiptText,
      tone: "purchase",
      permission: "purchases",
    },
    {
      label: "Add Product",
      caption: "Inventory item",
      to: "/products/new",
      icon: PackagePlus,
      tone: "product",
      permission: "products",
    },
    {
      label: "Stock Movements",
      caption: "Inventory log",
      to: "/stock-movements",
      icon: ClipboardList,
      tone: "report",
      permission: "stock-movements",
    },
  ].filter((action) => canAccessPermission(user, action.permission));

  const records = [
    {
      label: "Products",
      value: stats.totalProducts,
      to: "/products",
      icon: Store,
      tone: "info",
      permission: "products",
    },
    {
      label: "Customers",
      value: stats.totalCustomers,
      to: "/customers",
      icon: Users,
      tone: "success",
      permission: "customers",
    },
    {
      label: "Cars",
      value: stats.totalCars,
      to: "/cars",
      icon: CarFront,
      tone: "info",
      permission: "cars",
    },
    {
      label: "Employees",
      value: stats.totalEmployees,
      to: "/employees",
      icon: UserRound,
      tone: "warning",
      permission: "employees",
    },
    {
      label: "Suppliers",
      value: stats.totalSuppliers,
      to: "/suppliers",
      icon: Truck,
      tone: "neutral",
      permission: "suppliers",
    },
  ].filter((record) => canAccessPermission(user, record.permission));

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">Vtec Dashboard</span>
          <h1 className="page-title">Dashboard overview</h1>
          <p className="page-subtitle">
            Real cash movement and inventory signals for {selectedRangeLabel}.
          </p>
        </div>
        <div className="dashboard-date">
          <CalendarDays size={18} aria-hidden="true" />
          <span>{formatDashboardDate(new Date(), dashboardDateOptions)}</span>
        </div>
      </div>

      <section className="dashboard-period-panel">
        <div className="dashboard-period-summary">
          <span>Reporting Period</span>
          <strong>{selectedPeriod.label}</strong>
          <small>{selectedRangeLabel}</small>
        </div>
        <div className="dashboard-period-controls">
          <div
            aria-label="Dashboard reporting period"
            className="dashboard-period-presets"
            role="group"
          >
            {periodOptions.map((option) => (
              <button
                aria-pressed={periodPreset === option.value}
                className={`dashboard-period-button ${
                  periodPreset === option.value
                    ? "dashboard-period-button-active"
                    : ""
                }`}
                key={option.value}
                onClick={() => handlePresetChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="dashboard-date-range-fields">
            <label className="form-field dashboard-date-field">
              <span>Start Date</span>
              <input
                className="input"
                max={dateRange.endDate}
                onChange={handleRangeChange("startDate")}
                type="date"
                value={dateRange.startDate}
              />
            </label>
            <label className="form-field dashboard-date-field">
              <span>End Date</span>
              <input
                className="input"
                min={dateRange.startDate}
                onChange={handleRangeChange("endDate")}
                type="date"
                value={dateRange.endDate}
              />
            </label>
          </div>
        </div>
      </section>

      {error ? <div className="card error-text">{error}</div> : null}

      <section className="dashboard-kpi-grid">
        {kpiCards.map((card) => (
          <article
            className={`dashboard-kpi dashboard-kpi-${card.tone}`}
            key={card.title}
          >
            <div className="dashboard-kpi-main">
              <div>
                <span>{card.title}</span>
                <strong>{card.value}</strong>
              </div>
              <div className="dashboard-kpi-icon">
                <card.icon size={20} aria-hidden="true" />
              </div>
            </div>
            <LineChart
              ariaLabel={card.chartLabel}
              className="dashboard-kpi-chart"
              series={[
                {
                  name: card.title,
                  tone: card.tone,
                  values: card.chartData,
                },
              ]}
              variant="sparkline"
            />
            <small>{card.detail}</small>
          </article>
        ))}
      </section>
      <section className="card   dashboard-panel">
        <div className="section-header">
          <h2>Quick Actions</h2>
        </div>
        <div className="dashboard-action-list">
          {quickActions.map((action) => (
            <Link
              className={`dashboard-action-row dashboard-action-${action.tone}`}
              to={action.to}
              key={action.label}
            >
              <span className="dashboard-action-icon">
                <action.icon size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>{action.label}</strong>
                <small>{action.caption}</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <section className="card dashboard-panel">
        <div className="section-header">
          <h2>Business Records</h2>
        </div>
        <div className="dashboard-record-list">
          {records.map((record) => (
            <Link
              className="dashboard-record-row"
              to={record.to}
              key={record.label}
            >
              <span className={`dashboard-record-icon stat-${record.tone}`}>
                <record.icon size={18} aria-hidden="true" />
              </span>
              <span>{record.label}</span>
              <strong>{formatCount(record.value)}</strong>
            </Link>
          ))}
        </div>
      </section>
      <div className="dashboard-main-grid">
        <section className="card dashboard-panel">
          <div className="section-header">
            <h2>Inventory Attention</h2>
            <Link className="section-link" to="/reports">
              <span>Reports</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className={`dashboard-stock-alert stock-alert-${stockTone}`}>
            <div className="dashboard-stock-alert-icon">
              <AlertTriangle size={20} aria-hidden="true" />
            </div>
            <div>
              <strong>{stockTitle}</strong>
              <p>{stockMessage}</p>
            </div>
          </div>

          <DataTable
            loading={loading}
            columns={[
              { header: "Product", accessor: "name" },
              {
                header: "Part Number",
                render: (row) => getProductSku(row) || "-",
              },
              {
                header: "Location",
                render: (row) => getProductLocation(row) || "-",
              },
              {
                header: "Stock",
                render: (row) => row.stock_quantity ?? row.stockQuantity ?? 0,
              },
              { header: "Min Stock", render: (row) => getProductMinStock(row) },
            ]}
            data={lowStockProducts}
            emptyMessage="No products need restock"
          />
        </section>

        <aside className="dashboard-side-column">
          <section className="card dashboard-panel dashboard-chart-panel">
            <div className="section-header">
              <h2>Period Performance</h2>
              <span className="dashboard-chart-range">{chartRangeLabel}</span>
            </div>
            <LineChart
              ariaLabel="Selected period cash in, cash out, and net performance"
              labels={chartLabels}
              series={[
                {
                  name: "Money In",
                  tone: "success",
                  values: cashInTrend,
                },
                {
                  name: "Money Out",
                  tone: "info",
                  values: cashOutTrend,
                },
                {
                  name: "Net Cash",
                  tone: periodBalance >= 0 ? "neutral" : "danger",
                  values: netTrend,
                },
              ]}
              showAxis
              showGrid
              showLegend
            />
          </section>
        </aside>
      </div>
    </div>
  );
};

export default Dashboard;
