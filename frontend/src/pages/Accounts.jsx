import { Edit, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import FormInput from "../components/FormInput";
import SearchInput from "../components/SearchInput";
import formatDate from "../utils/formatDate";
import { canAccessPermission } from "../utils/permissions";
import { errorMessage, listFrom, unwrapData } from "../utils/response";
import { getUser } from "../utils/storage";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "cashier",
  is_active: "true",
  permissions: [],
};

const fallbackRoleOptions = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "inventory", label: "Inventory" },
  { value: "service_receptionist", label: "Service Receptionist" },
  { value: "service_advisor", label: "Service Advisor" },
  { value: "service_technician", label: "Service Technician" },
  { value: "parts_clerk", label: "Parts Clerk" },
  { value: "qc_inspector", label: "QC Inspector" },
  { value: "delivery_coordinator", label: "Delivery Coordinator" },
];

const Accounts = () => {
  const currentUser = getUser();
  const [accounts, setAccounts] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [roleOptions, setRoleOptions] = useState(fallbackRoleOptions);
  const [roleDefaults, setRoleDefaults] = useState({});
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canManageAccounts = canAccessPermission(currentUser, "accounts.manage");

  const roleMeta = useMemo(
    () =>
      roleOptions.reduce((meta, roleOption) => {
        meta[roleOption.value] = {
          label: roleOption.label,
          className: roleOption.className || "badge-neutral",
        };
        return meta;
      }, {}),
    [roleOptions],
  );

  const groupedPermissions = useMemo(() => {
    return permissionCatalog.reduce((groups, permission) => {
      const group = permission.group || "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(permission);
      return groups;
    }, {});
  }, [permissionCatalog]);

  const loadAccounts = useCallback(async () => {
    if (!canManageAccounts) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axiosClient.get("/users", {
        params: {
          search: search.trim() || undefined,
          role: role || undefined,
          is_active: activeFilter || undefined,
        },
      });
      setAccounts(listFrom(unwrapData(response, [])));
    } catch (err) {
      setError(errorMessage(err, "Unable to load user accounts"));
    } finally {
      setLoading(false);
    }
  }, [activeFilter, canManageAccounts, role, search]);

  useEffect(() => {
    const timer = window.setTimeout(loadAccounts, 220);
    return () => window.clearTimeout(timer);
  }, [loadAccounts]);

  useEffect(() => {
    if (!canManageAccounts) return;

    const loadPermissionCatalog = async () => {
      try {
        const response = await axiosClient.get("/users/permissions/catalog");
        const data = unwrapData(response, {});
        const permissions = Array.isArray(data) ? data : data?.permissions || [];
        const roles = Array.isArray(data?.roles) && data.roles.length ? data.roles : fallbackRoleOptions;

        setPermissionCatalog(listFrom(permissions));
        setRoleOptions(roles);
        setRoleDefaults(data?.role_defaults || roles.reduce((defaults, roleOption) => {
          defaults[roleOption.value] = roleOption.default_permissions || [];
          return defaults;
        }, {}));
      } catch (err) {
        setError(errorMessage(err, "Unable to load permissions"));
      }
    };

    loadPermissionCatalog();
  }, [canManageAccounts]);

  useEffect(() => {
    if (editing || !Object.keys(roleDefaults).length) return;
    setForm((current) =>
      current.permissions?.length ? current : { ...current, permissions: roleDefaults[current.role] || [] },
    );
  }, [editing, roleDefaults]);

  const activeCount = useMemo(
    () => accounts.filter((account) => account.isActive).length,
    [accounts],
  );

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "role" ? { permissions: roleDefaults[value] || [] } : {}),
    }));
  };

  const resetForm = () => {
    setForm({ ...initialForm, permissions: roleDefaults.cashier || [] });
    setEditing(null);
  };

  const applyRoleDefaults = () => {
    setForm((current) => ({ ...current, permissions: roleDefaults[current.role] || [] }));
  };

  const togglePermission = (permission) => {
    setForm((current) => {
      const permissions = new Set(current.permissions || []);
      if (permissions.has(permission)) {
        permissions.delete(permission);
      } else {
        permissions.add(permission);
      }

      return { ...current, permissions: [...permissions] };
    });
  };

  const startEdit = (account) => {
    setEditing(account);
    setForm({
      name: account.name || "",
      email: account.email || "",
      password: "",
      role: account.role || "cashier",
      is_active: account.isActive ? "true" : "false",
      permissions: account.permissions || roleDefaults[account.role] || [],
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address");
      return;
    }

    if (!editing && form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (editing && form.password && form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: form.name,
      email: form.email,
      role: form.role,
      is_active: form.is_active === "true",
    };

    if (form.role !== "admin") {
      payload.permissions = form.permissions || [];
    }

    if (form.password) {
      payload.password = form.password;
    }

    try {
      if (editing) {
        await axiosClient.put(`/users/${editing.id}`, payload);
      } else {
        await axiosClient.post("/users", payload);
      }

      resetForm();
      await loadAccounts();
    } catch (err) {
      setError(errorMessage(err, "Unable to save user account"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await axiosClient.delete(`/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadAccounts();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete user account"));
      setDeleteTarget(null);
    }
  };

  if (!canManageAccounts) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Accounts</h1>
            <p className="page-subtitle">Only permitted accounts can manage login accounts and access.</p>
          </div>
        </div>
        <section className="card error-text">You do not have permission to manage accounts.</section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">
            Create login emails, set passwords, and choose the role used when each user signs in.
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-success">{activeCount} active</span>
          <span className="badge badge-neutral">{accounts.length} shown</span>
        </div>
      </div>

      <section className="card">
        <form className="form partner-form" onSubmit={submit}>
          <div className="form-row">
            <FormInput label="Name" name="name" value={form.name} onChange={updateField} />
            <FormInput label="Email" name="email" type="email" value={form.email} onChange={updateField} />
          </div>
          <div className="form-row">
            <FormInput
              label={editing ? "New password" : "Password"}
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              placeholder={editing ? "Leave blank to keep current password" : ""}
            />
            <label className="form-field">
              <span>Role</span>
              <select className="select" name="role" value={form.role} onChange={updateField}>
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-field">
            <span>Status</span>
            <select className="select" name="is_active" value={form.is_active} onChange={updateField}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <div className="permission-editor">
            <div className="section-header">
              <div>
                <h2>Allowed Access</h2>
                <p className="muted-text">
                  Use the role as a template, then choose exactly which pages and service actions this account can use.
                </p>
              </div>
              {form.role === "admin" ? (
                <span className="badge badge-danger">Full access</span>
              ) : (
                <Button variant="secondary" type="button" onClick={applyRoleDefaults}>
                  Apply Role Defaults
                </Button>
              )}
            </div>
            {form.role === "admin" ? (
              <p className="muted-text">Admin accounts always keep full system access so the system cannot be locked.</p>
            ) : (
              <div className="permission-groups">
                {Object.entries(groupedPermissions).map(([group, permissions]) => (
                  <fieldset className="permission-group" key={group}>
                    <legend>{group}</legend>
                    <div className="permission-grid">
                      {permissions.map((permission) => (
                        <label className="checkbox-field" key={permission.key}>
                          <input
                            type="checkbox"
                            checked={(form.permissions || []).includes(permission.key)}
                            onChange={() => togglePermission(permission.key)}
                          />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </div>
          <div className="form-actions">
            <Button type="submit" icon={editing ? Edit : Plus} disabled={saving}>
              {saving ? "Saving" : editing ? "Update Account" : "Create Account"}
            </Button>
            {editing ? (
              <Button variant="secondary" icon={X} onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>

        <div className="toolbar">
          <div className="filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Search accounts" />
            <select className="select filter-select" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="select filter-select" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        {error ? <p className="error-text table-error">{error}</p> : null}

        <DataTable
          loading={loading}
          columns={[
            { header: "Name", accessor: "name" },
            { header: "Email", accessor: "email" },
            {
              header: "Role",
              render: (row) => {
                const meta = roleMeta[row.role] || roleMeta.cashier;
                return <span className={`badge ${meta.className}`}>{meta.label}</span>;
              },
            },
            {
              header: "Status",
              render: (row) => (
                <span className={`badge ${row.isActive ? "badge-success" : "badge-neutral"}`}>
                  {row.isActive ? "Active" : "Inactive"}
                </span>
              ),
            },
            {
              header: "Permissions",
              render: (row) =>
                row.role === "admin" ? (
                  <span className="badge badge-danger">Full access</span>
                ) : (
                  <span className={`badge ${row.permissions_customized ? "badge-warning" : "badge-neutral"}`}>
                    {row.permissions_customized ? "Custom" : "Role default"}
                  </span>
                ),
            },
            { header: "Created", render: (row) => formatDate(row.createdAt) },
            {
              header: "Actions",
              render: (row) => (
                <div className="actions">
                  <button className="icon-button" type="button" aria-label="Edit account" onClick={() => startEdit(row)}>
                    <Edit size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Delete account"
                    onClick={() => setDeleteTarget(row)}
                    disabled={row.id === currentUser?.id}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
          data={accounts}
          emptyMessage="No user accounts found"
        />
      </section>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete account"
        message={`Delete ${deleteTarget?.email || "this account"}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Accounts;
