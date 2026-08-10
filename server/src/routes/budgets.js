import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import { id, monthRange } from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  [query('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng kế hoạch không hợp lệ.')],
  validate,
  async (req, res) => {
    const db = getDb();
    const range = monthRange(req.query.month);
    const categories = await db.prepare(`
      SELECT c.id AS category_id, c.name AS category_name, c.icon AS category_icon,
        c.color AS category_color, b.id, b.month, COALESCE(b.amount, 0) AS amount,
        COALESCE(SUM(t.amount), 0) AS spent
      FROM categories c
      LEFT JOIN budgets b
        ON b.category_id = c.id AND b.family_id = c.family_id AND b.month = ?
      LEFT JOIN transactions t
        ON t.category_id = c.id AND t.family_id = c.family_id AND t.type = 'expense'
        AND t.transaction_date >= ? AND t.transaction_date < ?
      WHERE c.family_id = ? AND c.type = 'expense'
      GROUP BY c.id, c.name, c.icon, c.color, b.id, b.month, b.amount
      ORDER BY LOWER(c.name)
    `).all(req.query.month, range.start, range.end, req.user.familyId);

    const items = categories.map((category) => {
      const amount = Number(category.amount);
      const spent = Number(category.spent);
      return {
        id: category.id || null,
        month: category.month || req.query.month,
        amount,
        spent,
        remaining: amount - spent,
        percentage: amount ? Math.round((spent / amount) * 100) : 0,
        category: {
          id: category.category_id,
          name: category.category_name,
          icon: category.category_icon,
          color: category.category_color,
        },
      };
    });
    const plannedItems = items.filter((item) => item.id);
    const planned = plannedItems.reduce((total, item) => total + item.amount, 0);
    const spent = plannedItems.reduce((total, item) => total + item.spent, 0);

    res.json({
      month: req.query.month,
      planned,
      spent,
      remaining: planned - spent,
      percentage: planned ? Math.round((spent / planned) * 100) : 0,
      items,
    });
  },
);

router.post(
  '/',
  [
    body('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng kế hoạch không hợp lệ.'),
    body('categoryId').isUUID().withMessage('Danh mục không hợp lệ.'),
    body('amount').isInt({ min: 1, max: 999999999999 }).withMessage('Ngân sách cần lớn hơn 0.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const category = await db.prepare(`
      SELECT id FROM categories WHERE id = ? AND family_id = ? AND type = 'expense'
    `).get(req.body.categoryId, req.user.familyId);
    if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục chi phù hợp.' });

    await db.prepare(`
      INSERT INTO budgets (id, family_id, category_id, month, amount, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(family_id, category_id, month)
      DO UPDATE SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
    `).run(id(), req.user.familyId, req.body.categoryId, req.body.month, req.body.amount, req.user.id);
    const budget = await db.prepare(`
      SELECT id FROM budgets WHERE family_id = ? AND category_id = ? AND month = ?
    `).get(req.user.familyId, req.body.categoryId, req.body.month);

    await bumpFamilyRevision(db, req.user.familyId, { base: true });
    emitFamily(req.user.familyId, 'budgets:changed');
    res.status(201).json({ id: budget.id, message: 'Đã lưu kế hoạch chi tiêu.' });
  },
);

router.delete('/:id', [param('id').isUUID()], validate, async (req, res) => {
  const db = getDb();
  const result = await db.prepare('DELETE FROM budgets WHERE id = ? AND family_id = ?')
    .run(req.params.id, req.user.familyId);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy kế hoạch chi tiêu.' });

  await bumpFamilyRevision(db, req.user.familyId, { base: true });
  emitFamily(req.user.familyId, 'budgets:changed');
  res.status(204).end();
});

export default router;
