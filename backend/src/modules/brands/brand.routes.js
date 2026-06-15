import { Router } from 'express';

import { create, getBrand, getBrands, remove, update } from './brand.controller.js';

const router = Router();

router.route('/').get(getBrands).post(create);
router.route('/:id').get(getBrand).put(update).delete(remove);

export default router;
