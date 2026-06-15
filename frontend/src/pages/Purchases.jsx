import { CalendarDays, Eye, PackagePlus, Plus, ReceiptText, Truck, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import SearchInput from "../components/SearchInput";
import StatCard from "../components/StatCard";
import formatCurrency from "../utils/formatCurrency";
import formatDate from "../utils/formatDate";
import { firstValue, getPartnerName } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const getDayParams = (date) => {
  if (!date) return {};

  return {
    from: `${date}T00:00:00.000`,
    to: `${date}T23:59:59.999`,
  };
};

const Purchases = () => {
  const [purchases, setPurchases] = useState([]);
  const [summary, setSummary] = useState({});
  const [purchaseDate, setPurchaseDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const dateParams = getDayParams(purchaseDate);
        const query = search.trim();
        const params = {
          ...dateParams,
          ...(query ? { search: query } : {}),
        };
        const [purchasesResponse, summaryResponse] = await Promise.all([
          axiosClient.get("/purchases", {
            params: {
              ...params,
              limit: 200,
            },
          }),
          axiosClient.get("/reports/purchase-summary", {
            params,
          }),
        ]);

        setPurchases(listFrom(unwrapData(purchasesResponse, [])));
        setSummary(unwrapData(summaryResponse, {})?.summary || {});
      } catch (err) {
        setError(errorMessage(err, "Unable to load purchases"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [purchaseDate, search]);

  const summaryCards = useMemo(
    () => [
      {
        title: purchaseDate ? "Filtered Purchases" : "Purchases",
        value: summary.purchase_count ?? purchases.length,
        icon: ReceiptText,
        tone: "neutral",
        subtitle: purchaseDate ? formatDate(purchaseDate) : "Current purchase view",
      },
      {
        title: "Purchase Total",
        value: formatCurrency(summary.total_purchase_amount ?? 0),
        icon: PackagePlus,
        tone: "info",
      },
      {
        title: "Paid",
        value: formatCurrency(summary.total_paid_amount ?? 0),
        icon: WalletCards,
        tone: "success",
      },
      {
        title: "Remaining",
        value: formatCurrency(summary.total_remaining_amount ?? 0),
        icon: WalletCards,
        tone: "warning",
      },
    ],
    [purchaseDate, purchases.length, summary],
  );

  const clearFilters = () => {
    setPurchaseDate("");
    setSearch("");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchases</h1>
          <p className="page-subtitle">Supplier purchase records and payable balances.</p>
        </div>
        <div className="page-actions">
          <div className="filters compact-table-filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Search purchases" />
            <input
              className="input filter-select"
              type="date"
              aria-label="Purchase date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          </div>
          {purchaseDate || search ? (
            <Button variant="secondary" onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : null}
          <Link className="btn btn-primary" to="/purchases/new">
            <Plus size={17} aria-hidden="true" />
            <span>Create Purchase</span>
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
            <h2>{purchaseDate || search ? "Filtered Purchases" : "Purchase List"}</h2>
            <CalendarDays size={18} aria-hidden="true" />
          </div>
          <Truck size={18} aria-hidden="true" />
        </div>
        {error ? <p className="error-text table-error">{error}</p> : null}
        <DataTable
          loading={loading}
          columns={[
            { header: "ID", accessor: "id" },
            { header: "Supplier", render: (row) => getPartnerName(row, "supplier") },
            { header: "Total Amount", render: (row) => formatCurrency(firstValue(row.total_amount, row.totalAmount)) },
            { header: "Paid Amount", render: (row) => formatCurrency(firstValue(row.paid_amount, row.paidAmount, 0)) },
            {
              header: "Remaining Amount",
              render: (row) => formatCurrency(firstValue(row.remaining_amount, row.remainingAmount, 0)),
            },
            { header: "Purchase Date", render: (row) => formatDate(firstValue(row.purchase_date, row.purchaseDate)) },
            {
              header: "Actions",
              render: (row) => (
                <Link className="btn btn-secondary btn-small" to={`/purchases/${row.id}`}>
                  <Eye size={15} aria-hidden="true" />
                  <span>View</span>
                </Link>
              ),
            },
          ]}
          data={purchases}
          emptyMessage="No purchases found"
        />
      </section>
    </div>
  );
};

export default Purchases;
