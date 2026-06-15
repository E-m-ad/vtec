import { Router } from 'express';

import {
  cashFlow,
  inventory,
  lowStock,
  outOfStock,
  purchaseSummary,
  salesSummary,
} from './report.controller.js';

const router = Router();

router.get('/inventory', inventory);
router.get('/low-stock', lowStock);
router.get('/out-of-stock', outOfStock);
router.get('/cash-flow', cashFlow);
router.get('/sales-summary', salesSummary);
router.get('/purchase-summary', purchaseSummary);

export default router;
