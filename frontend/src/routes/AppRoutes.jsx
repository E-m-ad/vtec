import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import LoadingSpinner from "../components/LoadingSpinner";
import DashboardLayout from "../layouts/DashboardLayout";
import Accounts from "../pages/Accounts";
import Attendance from "../pages/Attendance";
import Backups from "../pages/Backups";
import Brands from "../pages/Brands";
import CarDetails from "../pages/CarDetails";
import Cars from "../pages/Cars";
import Categories from "../pages/Categories";
import CreatePurchase from "../pages/CreatePurchase";
import CreateSale from "../pages/CreateSale";
import CustomerDetails from "../pages/CustomerDetails";
import Customers from "../pages/Customers";
import Dashboard from "../pages/Dashboard";
import EmployeeDetails from "../pages/EmployeeDetails";
import Employees from "../pages/Employees";
import InventoryCounts from "../pages/InventoryCounts";
import Login from "../pages/Login";
import MoneyOut from "../pages/MoneyOut";
import ProductForm from "../pages/ProductForm";
import Products from "../pages/Products";
import PurchaseDetails from "../pages/PurchaseDetails";
import Purchases from "../pages/Purchases";
import Reports from "../pages/Reports";
import SaleDetails from "../pages/SaleDetails";
import Sales from "../pages/Sales";
import ServiceJobDetails from "../pages/ServiceJobDetails";
import ServiceJobs from "../pages/ServiceJobs";
import StockMovements from "../pages/StockMovements";
import SupplierDetails from "../pages/SupplierDetails";
import Suppliers from "../pages/Suppliers";
import { canAccessPath, firstAllowedPath } from "../utils/permissions";
import { clearStorage, getToken, getUser, setUser } from "../utils/storage";

const ProtectedRoute = () => {
  const location = useLocation();
  const token = getToken();
  const [user, setCurrentUser] = useState(getUser());
  const [checkingUser, setCheckingUser] = useState(Boolean(token));

  useEffect(() => {
    let isMounted = true;

    const syncUser = async () => {
      if (!token) {
        setCheckingUser(false);
        return;
      }

      try {
        const response = await axiosClient.get("/auth/me");
        const freshUser = response?.data?.data || response?.data?.user || response?.data;

        if (freshUser && isMounted) {
          setUser(freshUser);
          setCurrentUser(freshUser);
        }
      } catch {
        clearStorage();
      } finally {
        if (isMounted) setCheckingUser(false);
      }
    };

    syncUser();

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (!token) return <Navigate to="/login" replace />;

  if (checkingUser) {
    return (
      <div className="table-state">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canAccessPath(user, location.pathname)) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }

  return <DashboardLayout />;
};

const GuestRoute = ({ children }) => {
  return getToken() ? <Navigate to="/" replace /> : children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/new" element={<ProductForm />} />
        <Route path="/products/:id/edit" element={<ProductForm />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/brands" element={<Brands />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/suppliers/:id" element={<SupplierDetails />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetails />} />
        <Route path="/cars" element={<Cars />} />
        <Route path="/cars/:id" element={<CarDetails />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/employees/:id" element={<EmployeeDetails />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/inventory-counts" element={<InventoryCounts />} />
        <Route path="/inventory-counts/:id" element={<InventoryCounts />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/purchases/new" element={<CreatePurchase />} />
        <Route path="/purchases/:id" element={<PurchaseDetails />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/sales/new" element={<CreateSale />} />
        <Route path="/sales/:id" element={<SaleDetails />} />
        <Route path="/service-jobs" element={<ServiceJobs />} />
        <Route path="/service-jobs/:id" element={<ServiceJobDetails />} />
        <Route path="/money-out" element={<MoneyOut />} />
        <Route path="/stock-movements" element={<StockMovements />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/backups" element={<Backups />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
