import { Router } from 'express';

import { create, getSale, getSales, pay, returnItems } from './sale.controller.js';

const router = Router();

router.route('/').get(getSales).post(create);
router.route('/:id/payments').post(pay);
router.route('/:id/returns').post(returnItems);
router.route('/:id').get(getSale);

export default router;
