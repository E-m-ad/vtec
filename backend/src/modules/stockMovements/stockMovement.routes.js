import { Router } from 'express';

import {
  createAdjustment,
  getStockMovement,
  getStockMovements,
} from './stockMovement.controller.js';

const router = Router();

router.get('/', getStockMovements);
router.post('/adjustments', createAdjustment);
router.get('/:id', getStockMovement);

export default router;
