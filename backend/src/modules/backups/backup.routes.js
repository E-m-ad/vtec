import { Router } from 'express';

const router = Router();

router.route('/').get((_req, res) => {
  res.json({ success: true, message: 'List backups', data: [] });
});

router.route('/').post((_req, res) => {
  res.json({ success: true, message: 'Backup created' });
});

router.route('/:id').delete((_req, res) => {
  res.json({ success: true, message: 'Backup deleted' });
});

export default router;
