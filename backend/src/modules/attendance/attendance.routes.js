import { Router } from 'express';

import {
  finalizeDay,
  getDailyAttendance,
  markEmployee,
  scan,
} from './attendance.controller.js';

const router = Router();

router.route('/').get(getDailyAttendance);
router.route('/scan').post(scan);
router.route('/finalize').post(finalizeDay);
router.route('/:employeeId').put(markEmployee);

export default router;
