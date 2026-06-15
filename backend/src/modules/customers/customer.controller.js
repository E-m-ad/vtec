import asyncHandler from "../../utils/asyncHandler.js";
import {
  createCustomer,
  createCustomerOpeningBalance,
  createCustomerPayment,
  createCustomerRefund,
  deleteCustomer,
  getCustomerById,
  getCustomerDetails,
  listCustomers,
  updateCustomer,
} from "./customer.service.js";

export const getCustomers = asyncHandler(async (req, res) => {
  const customers = await listCustomers(req.query);

  res.json({
    success: true,
    data: customers,
  });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await getCustomerById(req.params.id);

  res.json({
    success: true,
    data: customer,
  });
});

export const getDetails = asyncHandler(async (req, res) => {
  const customer = await getCustomerDetails(req.params.id);

  res.json({
    success: true,
    data: customer,
  });
});

export const create = asyncHandler(async (req, res) => {
  const customer = await createCustomer(req.body);

  res.status(201).json({
    success: true,
    data: customer,
  });
});

export const addOpeningBalance = asyncHandler(async (req, res) => {
  const customer = await createCustomerOpeningBalance(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: customer,
  });
});

export const pay = asyncHandler(async (req, res) => {
  const customer = await createCustomerPayment(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: customer,
  });
});

export const refund = asyncHandler(async (req, res) => {
  const customer = await createCustomerRefund(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: customer,
  });
});

export const update = asyncHandler(async (req, res) => {
  const customer = await updateCustomer(req.params.id, req.body);

  res.json({
    success: true,
    data: customer,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const customer = await deleteCustomer(req.params.id);

  res.json({
    success: true,
    data: customer,
  });
});
