import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { pushConfigured, pushPublicConfig } from '../push.js';
import { id } from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();
router.use(authenticate);

router.get('/config', (_req, res) => {
  res.json(pushPublicConfig());
});

router.post(
  '/subscriptions',
  [
    body('endpoint').isURL({ protocols: ['https'], require_protocol: true }).withMessage('Thiết bị thông báo không hợp lệ.'),
    body('keys.p256dh').isString().isLength({ min: 20, max: 512 }).withMessage('Khóa thiết bị không hợp lệ.'),
    body('keys.auth').isString().isLength({ min: 8, max: 256 }).withMessage('Khóa xác thực thiết bị không hợp lệ.'),
  ],
  validate,
  async (req, res) => {
    if (!pushConfigured()) return res.status(503).json({ message: 'Thông báo chưa được cấu hình trên máy chủ.' });
    await getDb().prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      id(),
      req.user.id,
      req.body.endpoint,
      req.body.keys.p256dh,
      req.body.keys.auth,
      req.get('user-agent')?.slice(0, 500) || null,
    );
    res.status(201).json({ message: 'Đã bật thông báo trên thiết bị này.' });
  },
);

router.delete(
  '/subscriptions',
  [body('endpoint').isURL({ protocols: ['https'], require_protocol: true }).withMessage('Thiết bị thông báo không hợp lệ.')],
  validate,
  async (req, res) => {
    await getDb().prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
      .run(req.user.id, req.body.endpoint);
    res.status(204).end();
  },
);

export default router;
