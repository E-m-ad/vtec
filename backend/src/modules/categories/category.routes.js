import { Router } from 'express';

import { create, getCategories, getCategory, remove, update } from './category.controller.js';

const router = Router();

router.route('/').get(getCategories).post(create);
router.route('/:id').get(getCategory).put(update).delete(remove);

export default router;
