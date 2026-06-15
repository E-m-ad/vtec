import asyncHandler from '../../utils/asyncHandler.js';
import {
  createEmployee,
  createEmployeeSalaryTransaction,
  deleteEmployee,
  deleteEmployeeSalaryTransaction,
  getEmployeeAttendanceHistory,
  getEmployeeById,
  getEmployeeDetails,
  listEmployees,
  updateEmployee,
  updateEmployeeSalaryTransaction,
} from './employee.service.js';

export const getEmployees = asyncHandler(async (req, res) => {
  const employees = await listEmployees(req.query);

  res.json({
    success: true,
    data: employees,
  });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const employee = await getEmployeeById(req.params.id);

  res.json({
    success: true,
    data: employee,
  });
});

export const getDetails = asyncHandler(async (req, res) => {
  const employee = await getEmployeeDetails(req.params.id);

  res.json({
    success: true,
    data: employee,
  });
});

export const getAttendanceHistory = asyncHandler(async (req, res) => {
  const attendance = await getEmployeeAttendanceHistory(req.params.id, req.query);

  res.json({
    success: true,
    data: attendance,
  });
});

export const create = asyncHandler(async (req, res) => {
  const employee = await createEmployee(req.body);

  res.status(201).json({
    success: true,
    data: employee,
  });
});

export const update = asyncHandler(async (req, res) => {
  const employee = await updateEmployee(req.params.id, req.body);

  res.json({
    success: true,
    data: employee,
  });
});

export const createSalaryTransaction = asyncHandler(async (req, res) => {
  const employee = await createEmployeeSalaryTransaction(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: employee,
  });
});

export const updateSalaryTransaction = asyncHandler(async (req, res) => {
  const employee = await updateEmployeeSalaryTransaction(
    req.params.id,
    req.params.transactionId,
    req.body,
  );

  res.json({
    success: true,
    data: employee,
  });
});

export const removeSalaryTransaction = asyncHandler(async (req, res) => {
  const employee = await deleteEmployeeSalaryTransaction(req.params.id, req.params.transactionId);

  res.json({
    success: true,
    data: employee,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const employee = await deleteEmployee(req.params.id);

  res.json({
    success: true,
    data: employee,
  });
});
