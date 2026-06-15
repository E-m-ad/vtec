import asyncHandler from '../../utils/asyncHandler.js';
import {
  getCashFlowReport,
  getInventoryReport,
  getLowStockReport,
  getOutOfStockReport,
  getPurchaseSummaryReport,
  getSalesSummaryReport,
} from './report.service.js';

export const inventory = asyncHandler(async (_req, res) => {
  const report = await getInventoryReport();

  res.json({
    success: true,
    data: report,
  });
});

export const lowStock = asyncHandler(async (req, res) => {
  const report = await getLowStockReport(req.query);

  res.json({
    success: true,
    data: report,
  });
});

export const outOfStock = asyncHandler(async (req, res) => {
  const report = await getOutOfStockReport(req.query);

  res.json({
    success: true,
    data: report,
  });
});

export const cashFlow = asyncHandler(async (req, res) => {
  const report = await getCashFlowReport(req.query);

  res.json({
    success: true,
    data: report,
  });
});

export const salesSummary = asyncHandler(async (req, res) => {
  const report = await getSalesSummaryReport(req.query);

  res.json({
    success: true,
    data: report,
  });
});

export const purchaseSummary = asyncHandler(async (req, res) => {
  const report = await getPurchaseSummaryReport(req.query);

  res.json({
    success: true,
    data: report,
  });
});
