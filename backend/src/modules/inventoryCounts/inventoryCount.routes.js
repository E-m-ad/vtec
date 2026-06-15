import { Router } from 'express';

import {
  addItem,
  apply,
  cancel,
  create,
  getInventoryCount,
  getInventoryCounts,
  remove,
  scanItem,
  updateItem,
  updateStatus,
} from './inventoryCount.controller.js';

const router = Router();

router.route('/').get(getInventoryCounts).post(create);
router.route('/:id').get(getInventoryCount).patch(updateStatus).delete(remove);
router.route('/:id/scan').post(scanItem);
router.route('/:id/items').post(addItem);
router.route('/:id/items/:itemId').put(updateItem);
router.route('/:id/apply').post(apply);
router.route('/:id/cancel').post(cancel);

export default router;
