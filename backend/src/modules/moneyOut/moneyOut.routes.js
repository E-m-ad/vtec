import { Router } from 'express';

import { create, getMoneyOut } from './moneyOut.controller.js';

const router = Router();

router.route('/').get(getMoneyOut).post(create);

export default router;
