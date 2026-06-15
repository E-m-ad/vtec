import { CalendarDays, Eye, Plus, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import SearchInput from "../components/SearchInput";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue, getCarLabel, getPartnerName } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const getDayParams = (date) => {
  if (!date) return {};

  return {
    from: `${date}T00:00:00.000`,
    to: `${date}T23:59:59.999`,
  };
};

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({});
  const [saleDate, setSaleDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const dateParams = getDayParams(saleDate);
        const query = search.trim();
        const params = {
          ...dateParams,
          ...(query ? { search: query } : {}),
        };
        const [salesResponse, summaryResponse] = await Promise.all([
          axiosClient.get("/sales", {
            params: {
              ...params,
              limit: 200,
            },
          }),
          axiosClient.get("/reports/sales-summary", {
            params,
          }),
        ]);

        setSales(listFrom(unwrapData(salesResponse, [])));
        setSummary(unwrapData(summaryResponse, {})?.summary || {});
      } catch (err) {
        setError(errorMessage(err, "Unable to load sales"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [saleDate, search]);

  const summaryCards = useMemo(
    () => [
      {
        title: saleDate ? "Filtered Invoices" : "Invoices",
        value: summary.sale_count ?? sales.length,
        icon: ReceiptText,
        tone: "neutral",
        subtitle: saleDate ? formatDate(saleDate) : "Current sales view",
      },
      {
        title: "Revenue",
        value: formatCurrency(summary.total_sales_amount ?? 0),
        icon: TrendingUp,
        tone: "success",
      },
      {
        title: "Paid",
        value: formatCurrency(summary.total_paid_amount ?? 0),
        icon: WalletCards,
        tone: "info",
      },
      {
        title: "Remaining",
        value: formatCurrency(summary.total_remaining_amount ?? 0),
        icon: WalletCards,
        tone: "warning",
      },
    ],
    [saleDate, sales.length, summary],
  );

  const clearFilters = () => {
    setSaleDate("");
    setSearch("");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="page-subtitle">Customer sales and receivable balances.</p>
        </div>
        <div className="page-actions">
          <div className="filters compact-table-filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Search sales" />
            <input
              className="input filter-select"
              type="date"
              aria-label="Sale date"
              value={saleDate}
              onChange={(event) => setSaleDate(event.target.value)}
            />
          </div>
          {saleDate || search ? (
            <Button variant="secondary" onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : null}
          <Link className="btn btn-primary" to="/sales/new">
            <Plus size={17} aria-hidden="true" />
            <span>Create Sale</span>
          </Link>
        </div>
      </div>

      <section className="grid grid-4">
        {summaryCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section className="card">
        <div className="section-header">
          <div className="section-title-with-icon">
            <h2>{saleDate ? "Filtered Sales" : "Sales List"}</h2>
            <CalendarDays size={18} aria-hidden="true" />
          </div>
        </div>
        {error ? <p className="error-text table-error">{error}</p> : null}
        <DataTable
          loading={loading}
          columns={[
            { header: "ID", accessor: "id" },
            { header: "Customer", render: (row) => getPartnerName(row, "customer") },
            { header: "Car", render: (row) => getCarLabel(row.car) },
            { header: "Invoice Total", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount)) },
            { header: "Returned", render: (row) => formatCurrency(firstValue(row.returned_amount, row.returnedAmount, 0)) },
            { header: "Net Amount", render: (row) => formatCurrency(firstValue(row.net_total_amount, row.netTotalAmount, row.total_amount, row.totalAmount, 0)) },
            { header: "Paid Amount", render: (row) => formatCurrency(firstValue(row.paid_amount, row.paidAmount, 0)) },
            {
              header: "Remaining Amount",
              render: (row) => formatCurrency(firstValue(row.remaining_amount, row.remainingAmount, 0)),
            },
            { header: "Sale Date", render: (row) => formatDate(firstValue(row.sale_date, row.saleDate)) },
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
          emptyMessage="No sales found"
        />
      </section>
    </div>
  );
};

export default Sales;
