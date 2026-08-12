import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import { id, monthRange } from '../utils.js';
import { validate } from '../validation.js';
import { resolveSpace } from '../spaces.js';

const router = express.Router();
router.use(authenticate);
router.use(resolveSpace);

const transactionRules = [
  body('type').isIn(['expense', 'income']).withMessage('Loại giao dịch không hợp lệ.'),
  body('amount').isInt({ min: 1, max: 999999999999 }).withMessage('Số tiền cần lớn hơn 0.'),
  body('categoryId').isUUID().withMessage('Danh mục không hợp lệ.'),
  body('transactionDate').isISO8601({ strict: true }).withMessage('Ngày giao dịch không hợp lệ.'),
  body('note').optional({ nullable: true }).trim().isLength({ max: 240 }).withMessage('Ghi chú tối đa 240 ký tự.'),
];

router.get(
  '/',
  [
    query('month').optional().matches(/^\d{4}-\d{2}$/),
    query('categoryId').optional().isUUID(),
    query('memberId').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  validate,
  async (req, res) => {
    const where = ['t.family_id = ?'];
    const params = [req.space.id];
    if (req.query.month) {
      const range = monthRange(req.query.month);
      where.push('t.transaction_date >= ? AND t.transaction_date < ?');
      params.push(range.start, range.end);
    }
    if (req.query.categoryId) {
      where.push('t.category_id = ?');
      params.push(req.query.categoryId);
    }
    if (req.query.memberId) {
      where.push('t.assigned_to = ?');
      params.push(req.query.memberId);
    }
    params.push(Number(req.query.limit || 100));

    const transactions = await getDb().prepare(`
      SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
        u.display_name AS assigned_name, u.avatar_url AS assigned_avatar
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      JOIN users u ON u.id = t.assigned_to
      WHERE ${where.join(' AND ')}
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ?
    `).all(...params);
    res.json(transactions.map(mapTransaction));
  },
);

router.get('/:id', [param('id').isUUID()], validate, async (req, res) => {
  const transaction = await getDb().prepare(`
    SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
      u.display_name AS assigned_name, u.avatar_url AS assigned_avatar
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    JOIN users u ON u.id = t.assigned_to
    WHERE t.id = ? AND t.family_id = ?
  `).get(req.params.id, req.space.id);
  if (!transaction) return res.status(404).json({ message: 'Không tìm thấy giao dịch.' });
  res.json(mapTransaction(transaction));
});

router.post('/', transactionRules, validate, async (req, res) => {
  const db = getDb();
  const check = await validateRelations(db, req.space.id, req.body);
  if (check) return res.status(check.status).json({ message: check.message });

  const transactionId = id();
  await db.prepare(`
    INSERT INTO transactions
      (id, family_id, category_id, created_by, assigned_to, type, amount, transaction_date, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transactionId,
    req.space.id,
    req.body.categoryId,
    req.user.id,
    req.user.id,
    req.body.type,
    req.body.amount,
    req.body.transactionDate.slice(0, 10),
    req.body.note?.trim() || null,
  );
  await bumpFamilyRevision(db, req.space.id, { transactions: true });
  emitFamily(req.space.id, 'transactions:changed', { action: 'created', id: transactionId });
  res.status(201).json({ id: transactionId, message: 'Đã lưu giao dịch.' });
});

router.patch('/:id', [param('id').isUUID(), ...transactionRules], validate, async (req, res) => {
  const db = getDb();
  const check = await validateRelations(db, req.space.id, req.body);
  if (check) return res.status(check.status).json({ message: check.message });

  const result = await db.prepare(`
    UPDATE transactions SET
      category_id = ?, type = ?, amount = ?, transaction_date = ?,
      note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND family_id = ?
  `).run(
    req.body.categoryId,
    req.body.type,
    req.body.amount,
    req.body.transactionDate.slice(0, 10),
    req.body.note?.trim() || null,
    req.params.id,
    req.space.id,
  );
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy giao dịch.' });
  await bumpFamilyRevision(db, req.space.id, { transactions: true });
  emitFamily(req.space.id, 'transactions:changed', { action: 'updated', id: req.params.id });
  res.json({ message: 'Đã cập nhật giao dịch.' });
});

router.delete('/:id', [param('id').isUUID()], validate, async (req, res) => {
  const db = getDb();
  const result = await db.prepare('DELETE FROM transactions WHERE id = ? AND family_id = ?')
    .run(req.params.id, req.space.id);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy giao dịch.' });
  await bumpFamilyRevision(db, req.space.id, { transactions: true });
  emitFamily(req.space.id, 'transactions:changed', { action: 'deleted', id: req.params.id });
  res.status(204).end();
});

async function validateRelations(db, familyId, data) {
  const category = await db.prepare('SELECT type FROM categories WHERE id = ? AND family_id = ?').get(data.categoryId, familyId);
  if (!category) return { status: 404, message: 'Không tìm thấy danh mục.' };
  if (category.type !== data.type) return { status: 422, message: 'Danh mục không phù hợp với loại giao dịch.' };
  return null;
}

function mapTransaction(transaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: Number(transaction.amount),
    transactionDate: transaction.transaction_date,
    note: transaction.note,
    category: {
      id: transaction.category_id,
      name: transaction.category_name,
      icon: transaction.category_icon,
      color: transaction.category_color,
    },
    assignedTo: {
      id: transaction.assigned_to,
      displayName: transaction.assigned_name,
      avatarUrl: transaction.assigned_avatar,
    },
    createdBy: transaction.created_by,
    createdAt: normalizeTimestamp(transaction.created_at),
    updatedAt: normalizeTimestamp(transaction.updated_at),
  };
}

// Normalize SQLite and PostgreSQL timestamp text into one browser-safe ISO format.
function normalizeTimestamp(value) {
  if (!value) return null;
  let text = String(value).trim().replace(' ', 'T');
  text = text.replace(/(\.\d{3})\d+/, '$1');
  if (/([+-]\d{4})$/.test(text)) {
    text = `${text.slice(0, -2)}:${text.slice(-2)}`;
  } else if (/([+-]\d{2})$/.test(text)) {
    text = `${text}:00`;
  } else if (!/(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    text += 'Z';
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default router;
