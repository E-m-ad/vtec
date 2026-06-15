import express, { Router } from 'express';

import { authorizeRoles } from '../../middlewares/auth.middleware.js';
import {
  addOpeningBalance,
  create,
  getDetails,
  getPurchasedProducts,
  getSupplier,
  getSuppliers,
  pay,
  refund,
  remove,
  settleWithProduct,
  update,
} from './supplier.controller.js';
import {
  getLegacyWorkbook,
  getLegacyWorkbooks,
  removeLegacyWorkbook,
  uploadLegacyWorkbook,
} from './supplierLegacyWorkbook.controller.js';

const router = Router();
const legacyWorkbookBody = express.raw({
  limit: '25mb',
  type: [
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
});

router.route('/').get(getSuppliers).post(create);
router.route('/:id/details').get(getDetails);
router.route('/:id/products').get(getPurchasedProducts);
router.route('/:id/opening-balances').post(authorizeRoles('admin', 'manager'), addOpeningBalance);
router
  .route('/:id/legacy-workbooks')
  .get(getLegacyWorkbooks)
  .post(authorizeRoles('admin', 'manager'), legacyWorkbookBody, uploadLegacyWorkbook);
router
  .route('/:id/legacy-workbooks/:workbookId')
  .get(getLegacyWorkbook)
  .delete(authorizeRoles('admin', 'manager'), removeLegacyWorkbook);
router.route('/:id/payments').post(pay);
router.route('/:id/refunds').post(refund);
router.route('/:id/product-settlements').post(settleWithProduct);
router.route('/:id').get(getSupplier).put(update).delete(remove);

export default router;
