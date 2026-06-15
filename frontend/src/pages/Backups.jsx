import {
  Archive,
  Download,
  FileCode,
  FileSpreadsheet,
  HardDrive,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import StatCard from "../components/StatCard";
import formatDate from "../utils/formatDate";
import { canAccessPermission } from "../utils/permissions";
import { errorMessage, unwrapData } from "../utils/response";
import { getUser } from "../utils/storage";

const formatBytes = (value) => {
  const bytes = Number(value || 0);

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const excelExportFileName = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return `vtec_emergency_excel_export_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.xlsx`;
};

const fileNameFromResponse = (response, fallback) => {
  const contentDisposition = response.headers?.["content-disposition"] || "";

  return contentDisposition.match(/filename="?([^"]+)"?/)?.[1] || fallback;
};

const Backups = () => {
  const user = getUser();
  const canManageBackups = canAccessPermission(user, "backups.manage");
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [exportingExcel, setExportingExcel] = useState(false);
  const [downloadingVba, setDownloadingVba] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBackups = async () => {
    if (!canManageBackups) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get("/backups");
      const data = unwrapData(response, {});

      setBackups(Array.isArray(data?.backups) ? data.backups : []);
    } catch (err) {
      setError(errorMessage(err, "Unable to load backups"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const latestBackup = backups[0];
  const totalSize = useMemo(
    () => backups.reduce((sum, backup) => sum + Number(backup.size_bytes || 0), 0),
    [backups],
  );

  const createBackup = async () => {
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const response = await axiosClient.post("/backups");
      const backup = unwrapData(response, {});

      setSuccess(`${backup.file_name || "Backup"} created`);
      await loadBackups();
    } catch (err) {
      setError(errorMessage(err, "Unable to create backup"));
    } finally {
      setCreating(false);
    }
  };

  const downloadBackup = async (fileName) => {
    setDownloading(fileName);
    setError("");

    try {
      const response = await axiosClient.get(
        `/backups/${encodeURIComponent(fileName)}/download`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err, "Unable to download backup"));
    } finally {
      setDownloading("");
    }
  };

  const downloadExcelExport = async () => {
    setExportingExcel(true);
    setError("");
    setSuccess("");

    try {
      const response = await axiosClient.get("/backups/excel-export", {
        responseType: "blob",
      });
      const fileName = fileNameFromResponse(response, excelExportFileName());
      const url = window.URL.createObjectURL(
        new Blob([response.data], {
          type:
            response.headers?.["content-type"] ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess(`${fileName} downloaded`);
    } catch (err) {
      setError(errorMessage(err, "Unable to export Excel workbook"));
    } finally {
      setExportingExcel(false);
    }
  };

  const downloadVbaModule = async () => {
    setDownloadingVba(true);
    setError("");
    setSuccess("");

    try {
      const response = await axiosClient.get("/backups/excel-vba", {
        responseType: "blob",
      });
      const fileName = fileNameFromResponse(response, "vtec_emergency_excel_macros.bas");
      const url = window.URL.createObjectURL(
        new Blob([response.data], {
          type: response.headers?.["content-type"] || "text/plain;charset=utf-8",
        }),
      );
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess(`${fileName} downloaded`);
    } catch (err) {
      setError(errorMessage(err, "Unable to download VBA module"));
    } finally {
      setDownloadingVba(false);
    }
  };

  if (!canManageBackups) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Backups</h1>
            <p className="page-subtitle">Only permitted accounts can create and download database backups.</p>
          </div>
        </div>
        <section className="card error-text">You do not have permission to manage backups.</section>
      </div>
    );
  }

  return (
    <div className="page backups-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Backups</h1>
          <p className="page-subtitle">Create and download PostgreSQL database backups.</p>
        </div>
        <div className="page-actions">
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={loadBackups}
            disabled={loading || creating || exportingExcel || downloadingVba}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            icon={FileSpreadsheet}
            onClick={downloadExcelExport}
            disabled={exportingExcel}
          >
            {exportingExcel ? "Exporting" : "Export Excel"}
          </Button>
          <Button
            variant="secondary"
            icon={FileCode}
            onClick={downloadVbaModule}
            disabled={downloadingVba}
          >
            {downloadingVba ? "Downloading" : "Download VBA"}
          </Button>
          <Button icon={Archive} onClick={createBackup} disabled={creating}>
            {creating ? "Creating" : "Backup Now"}
          </Button>
        </div>
      </div>

      {error ? <section className="card error-text">{error}</section> : null}
      {success ? <section className="card success-text">{success}</section> : null}

      <section className="grid grid-3">
        <StatCard title="Backup Files" value={backups.length} icon={Archive} tone="info" />
        <StatCard title="Stored Size" value={formatBytes(totalSize)} icon={HardDrive} tone="neutral" />
        <StatCard
          title="Latest Backup"
          value={latestBackup ? formatDate(latestBackup.created_at) : "-"}
          icon={ShieldCheck}
          tone={latestBackup ? "success" : "warning"}
        />
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Backup Files</h2>
          <span className="badge badge-neutral">{backups.length} files</span>
        </div>

        <DataTable
          loading={loading}
          columns={[
            { header: "File", accessor: "file_name" },
            { header: "Created", render: (row) => formatDate(row.created_at) },
            { header: "Database", render: (row) => row.database_name || "-" },
            { header: "Size", render: (row) => formatBytes(row.size_bytes) },
            {
              header: "Checksum",
              render: (row) => (
                <code className="backup-checksum">
                  {row.checksum_sha256 ? row.checksum_sha256.slice(0, 16) : "-"}
                </code>
              ),
            },
            {
              header: "Created By",
              render: (row) => row.created_by?.name || "-",
            },
            {
              header: "Actions",
              render: (row) => (
                <Button
                  className="btn-small"
                  icon={Download}
                  onClick={() => downloadBackup(row.file_name)}
                  variant="secondary"
                  disabled={downloading === row.file_name}
                >
                  {downloading === row.file_name ? "Downloading" : "Download"}
                </Button>
              ),
            },
          ]}
          data={backups}
          emptyMessage="No backups created yet"
        />
      </section>
    </div>
  );
};

export default Backups;
