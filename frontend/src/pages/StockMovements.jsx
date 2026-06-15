import { useEffect, useState } from "react";

import axiosClient from "../api/axiosClient";
import DataTable from "../components/DataTable";
import formatDate from "../utils/formatDate";
import { firstValue } from "../utils/fields";
import { errorMessage, listFrom, unwrapData } from "../utils/response";

const movementBadge = (type = "") => {
  const normalized = String(type).toLowerCase();
  if (normalized.includes("purchase")) return "badge-success";
  if (normalized.includes("sale")) return "badge-danger";
  if (normalized.includes("adjustment")) return "badge-warning";
  if (normalized.includes("return")) return "badge-info";
  if (normalized.includes("damage")) return "badge-danger";
  return "badge-neutral";
};

const StockMovements = () => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await axiosClient.get("/stock-movements");
        setMovements(listFrom(unwrapData(response, [])));
      } catch (err) {
        setError(errorMessage(err, "Unable to load stock movements"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Movements</h1>
          <p className="page-subtitle">Audit trail for every stock change.</p>
        </div>
      </div>

      <section className="card">
        {error ? <p className="error-text table-error">{error}</p> : null}
        <DataTable
          loading={loading}
          columns={[
            { header: "Product Name", render: (row) => firstValue(row.product_name, row.product?.name, "-") },
            { header: "Part Number", render: (row) => firstValue(row.product_sku, row.product?.sku, "-") },
            {
              header: "Movement Type",
              render: (row) => {
                const type = firstValue(row.movement_type, row.movementType, "");
                return <span className={`badge ${movementBadge(type)}`}>{String(type).replace("_", " ")}</span>;
              },
            },
            { header: "Quantity", render: (row) => firstValue(row.quantity, 0) },
            { header: "Reference Type", render: (row) => firstValue(row.reference_type, row.referenceType, "-") },
            { header: "Reference ID", render: (row) => firstValue(row.reference_id, row.referenceId, "-") },
            { header: "Date", render: (row) => formatDate(firstValue(row.created_at, row.createdAt)) },
          ]}
          data={movements}
          emptyMessage="No stock movements found"
        />
      </section>
    </div>
  );
};

export default StockMovements;
