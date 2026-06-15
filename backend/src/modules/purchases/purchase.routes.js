import { Router } from 'express';

import { create, getPurchase, getPurchases, returnItems } from './purchase.controller.js';

const router = Router();

router.route('/').get(getPurchases).post(create);
router.route('/:id/returns').post(returnItems);
router.route('/:id').get(getPurchase);

export default router;
