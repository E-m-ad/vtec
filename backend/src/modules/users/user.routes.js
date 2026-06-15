import { Router } from 'express';

import { create, getUsers, permissionsCatalog, remove, update } from './user.controller.js';

const router = Router();

router.get('/permissions/catalog', permissionsCatalog);
router.route('/').get(getUsers).post(create);
router.route('/:id').put(update).delete(remove);

export default router;
