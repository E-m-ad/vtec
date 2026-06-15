import {
  BarChart3,
  Archive,
  Boxes,
  Building2,
  CalendarCheck,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  FolderTree,
  Home,
  LogOut,
  Menu,
  Package,
  Receipt,
  ShoppingCart,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import LanguageToggle from "../components/LanguageToggle";
import logoUrl from "../img/logo.png";
import { useLanguage } from "../i18n/LanguageProvider";
import { canAccessPermission } from "../utils/permissions";
import { clearStorage, getUser, setUser } from "../utils/storage";

const navItems = [
  { to: "/", label: "Dashboard", icon: Home, permission: "dashboard" },
  { to: "/products", label: "Products", icon: Package, permission: "products" },
  { to: "/categories", label: "Categories", icon: FolderTree, permission: "categories" },
  { to: "/brands", label: "Brands", icon: Tags, permission: "brands" },
  { to: "/suppliers", label: "Suppliers", icon: Building2, permission: "suppliers" },
  { to: "/customers", label: "Customers", icon: Users, permission: "customers" },
  { to: "/cars", label: "Cars", icon: CarFront, permission: "cars" },
  { to: "/employees", label: "Employees", icon: UserRound, permission: "employees" },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, permission: "attendance" },
  { to: "/inventory-counts", label: "Inventory Counts", icon: ClipboardCheck, permission: "inventory-counts" },
  { to: "/purchases", label: "Purchases", icon: ClipboardList, permission: "purchases" },
  { to: "/sales", label: "Sales", icon: ShoppingCart, permission: "sales" },
  { to: "/service-jobs", label: "Service Jobs", icon: Wrench, permission: "service-jobs" },
  { to: "/money-out", label: "Money Out", icon: Receipt, permission: "money-out" },
  { to: "/stock-movements", label: "Stock Movements", icon: Boxes, permission: "stock-movements" },
  { to: "/reports", label: "Reports", icon: BarChart3, permission: "reports" },
  { to: "/accounts", label: "Accounts", icon: ShieldCheck, permission: "accounts" },
  { to: "/backups", label: "Backups", icon: Archive, permission: "backups" },
];

const DashboardLayout = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [user, setCurrentUser] = useState(getUser());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const visibleNavItems = navItems.filter(
    (item) => canAccessPermission(user, item.permission),
  );

  useEffect(() => {
    let isMounted = true;

    const syncUser = async () => {
      try {
        const response = await axiosClient.get("/auth/me");
        const freshUser = response?.data?.data || response?.data?.user || response?.data;

        if (freshUser && isMounted) {
          setUser(freshUser);
          setCurrentUser(freshUser);
        }
      } catch {
        clearStorage();
        navigate("/login", { replace: true });
      }
    };

    syncUser();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const logout = () => {
    clearStorage();
    navigate("/login", { replace: true });
  };

  return (
    <div className="dashboard-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">
              <img src={logoUrl} alt="VTEC logo" />
            </div>
            <div className="sidebar-brand-copy">
              <strong>VTEC</strong>
              <span>{t("Spare Parts ERP")}</span>
            </div>
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label={t("Close menu")}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
            >
              <item.icon size={18} aria-hidden="true" />
              <span>{t(item.label)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {sidebarOpen ? (
        <button
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="dashboard-main">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            type="button"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="topbar-user">
            <span>{user?.name || "Vtec User"}</span>
            <small>{t(user?.role || "staff")}</small>
          </div>
          <LanguageToggle />
          <Button variant="secondary" icon={LogOut} onClick={logout}>
            {t("Logout")}
          </Button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
