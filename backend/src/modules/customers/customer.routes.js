import { Router } from 'express';

import { authorizeRoles } from '../../middlewares/auth.middleware.js';
import {
  addOpeningBalance,
  create,
  getCustomer,
  getCustomers,
  getDetails,
  pay,
  refund,
  remove,
  update,
} from './customer.controller.js';

const router = Router();

router.route('/').get(getCustomers).post(create);
router.route('/:id/details').get(getDetails);
router.route('/:id/opening-balances').post(authorizeRoles('admin', 'manager'), addOpeningBalance);
router.route('/:id/payments').post(pay);
router.route('/:id/refunds').post(refund);
router.route('/:id').get(getCustomer).put(update).delete(remove);

export default router;
