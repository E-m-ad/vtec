import { Router } from 'express';

import {
  create,
  createSalaryTransaction,
  getAttendanceHistory,
  getDetails,
  getEmployee,
  getEmployees,
  remove,
  removeSalaryTransaction,
  update,
  updateSalaryTransaction,
} from './employee.controller.js';

const router = Router();

router.route('/').get(getEmployees).post(create);
router.route('/:id/details').get(getDetails);
router.route('/:id/attendance').get(getAttendanceHistory);
router.route('/:id/salary-transactions').post(createSalaryTransaction);
router
  .route('/:id/salary-transactions/:transactionId')
  .put(updateSalaryTransaction)
  .delete(removeSalaryTransaction);
router.route('/:id').get(getEmployee).put(update).delete(remove);

export default router;
