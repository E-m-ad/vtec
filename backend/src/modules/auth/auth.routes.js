import { Router } from 'express';

import { authenticate, authorizeRoles } from '../../middlewares/auth.middleware.js';
import { login, me, register } from './auth.controller.js';

const router = Router();

router.post('/register', authenticate, authorizeRoles('admin'), register);
router.post('/login', login);
router.get('/me', authenticate, me);

export default router;
