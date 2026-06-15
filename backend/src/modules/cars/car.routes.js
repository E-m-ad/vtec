import { Router } from 'express';

import { create, getCar, getCars, getDetails, remove, update } from './car.controller.js';

const router = Router();

router.route('/').get(getCars).post(create);
router.route('/:id/details').get(getDetails);
router.route('/:id').get(getCar).put(update).delete(remove);

export default router;
