import { Fragment } from "react";

import EmptyState from "./EmptyState";
import LoadingSpinner from "./LoadingSpinner";

const resolveValue = (row, accessor) => {
  if (typeof accessor === "function") return accessor(row);
  return accessor?.split(".").reduce((value, key) => value?.[key], row);
};

const DataTable = ({
  className = "",
  columns,
  data = [],
  loading = false,
  emptyMessage = "No records found",
  getRowClassName,
  onRowClick,
  renderDetailRow,
}) => {
  const rows = Array.isArray(data) ? data : [];

  const isInteractiveTarget = (target) =>
    target?.closest?.(
      'a, button, input, select, textarea, [role="button"], [data-row-click-ignore="true"]',
    );

  const handleRowClick = (event, row) => {
    if (!onRowClick || isInteractiveTarget(event.target)) return;
    onRowClick(row);
  };

  const handleRowKeyDown = (event, row) => {
    if (!onRowClick || isInteractiveTarget(event.target)) return;
    if (!["Enter", " "].includes(event.key)) return;

    event.preventDefault();
    onRowClick(row);
  };

  if (loading) {
    return (
      <div className="table-state">
        <LoadingSpinner />
      </div>
    );
  }

  if (!rows.length) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="table-wrapper">
      <table className={["data-table", className].filter(Boolean).join(" ")}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowKey = row.id ?? row.sku ?? index;
            const detailRow = renderDetailRow?.(row);

            return (
              <Fragment key={rowKey}>
                <tr
                  className={[
                    "data-table-main-row",
                    detailRow ? "data-table-row-with-detail" : "",
                    onRowClick ? "data-table-clickable-row" : "",
                    getRowClassName?.(row) || "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(event) => handleRowClick(event, row)}
                  onKeyDown={(event) => handleRowKeyDown(event, row)}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.header}>
                      {column.render ? column.render(row) : resolveValue(row, column.accessor) ?? "-"}
                    </td>
                  ))}
                </tr>
                {detailRow ? (
                  <tr className="data-table-detail-row" key={`${rowKey}-detail`}>
                    <td colSpan={columns.length}>{detailRow}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
