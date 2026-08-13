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

router.get(
  '/',
  [query('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng kế hoạch không hợp lệ.')],
  validate,
  async (req, res) => {
    const db = getDb();
    const range = monthRange(req.query.month);
    const categories = await db.prepare(`
      SELECT c.id AS category_id, c.name AS category_name, c.icon AS category_icon,
        c.color AS category_color, COALESCE(SUM(t.amount), 0) AS spent
      FROM categories c
      LEFT JOIN transactions t
        ON t.category_id = c.id AND t.family_id = c.family_id AND t.type = 'expense'
        AND t.transaction_date >= ? AND t.transaction_date < ?
      WHERE c.family_id = ? AND c.type = 'expense'
      GROUP BY c.id, c.name, c.icon, c.color
      ORDER BY LOWER(c.name)
    `).all(range.start, range.end, req.space.id);

    const [overrides, rules, legacyBudgets] = await Promise.all([
      db.prepare(`
        SELECT id, category_id, amount FROM budget_month_overrides
        WHERE family_id = ? AND month = ?
      `).all(req.space.id, req.query.month),
      db.prepare(`
        SELECT id, category_id, amount, effective_from FROM budget_rules
        WHERE family_id = ? AND effective_from <= ?
        ORDER BY effective_from DESC
      `).all(req.space.id, req.query.month),
      db.prepare(`
        SELECT id, category_id, amount FROM budgets
        WHERE family_id = ? AND month = ?
      `).all(req.space.id, req.query.month),
    ]);

    const overridesByCategory = new Map(overrides.map((item) => [item.category_id, item]));
    const rulesByCategory = new Map();
    rules.forEach((item) => {
      if (!rulesByCategory.has(item.category_id)) rulesByCategory.set(item.category_id, item);
    });
    const legacyByCategory = new Map(legacyBudgets.map((item) => [item.category_id, item]));

    const items = categories.map((category) => {
      const source = overridesByCategory.get(category.category_id)
        || rulesByCategory.get(category.category_id)
        || legacyByCategory.get(category.category_id);
      const amount = Number(source?.amount || 0);
      const spent = Number(category.spent);
      return {
        id: source?.id || null,
        month: req.query.month,
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
    const plannedItems = items.filter((item) => item.amount > 0);
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
  '/batch',
  [
    body('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng kế hoạch không hợp lệ.'),
    body('scope').isIn(['month', 'future']).withMessage('Cách lưu ngân sách không hợp lệ.'),
    body('items').isArray({ min: 1, max: 100 }).withMessage('Danh sách ngân sách không hợp lệ.'),
    body('items.*.categoryId').isUUID().withMessage('Danh mục không hợp lệ.'),
    body('items.*.amount').isInt({ min: 0, max: 999999999999 }).withMessage('Ngân sách không hợp lệ.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const categoryIds = [...new Set(req.body.items.map((item) => item.categoryId))];
    if (categoryIds.length !== req.body.items.length) {
      return res.status(400).json({ message: 'Danh sách ngân sách bị trùng danh mục.' });
    }

    const validCategories = await db.prepare(`
      SELECT id FROM categories WHERE family_id = ? AND type = 'expense'
    `).all(req.space.id);
    const validIds = new Set(validCategories.map((category) => category.id));
    if (categoryIds.some((categoryId) => !validIds.has(categoryId))) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục chi phù hợp.' });
    }

    await db.transaction(async (transaction) => {
      for (const item of req.body.items) {
        if (req.body.scope === 'month') {
          await transaction.prepare(`
            INSERT INTO budget_month_overrides (id, family_id, category_id, month, amount, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(family_id, category_id, month)
            DO UPDATE SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
          `).run(id(), req.space.id, item.categoryId, req.body.month, item.amount, req.user.id);
        } else {
          await transaction.prepare(`
            INSERT INTO budget_rules (id, family_id, category_id, effective_from, amount, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(family_id, category_id, effective_from)
            DO UPDATE SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
          `).run(id(), req.space.id, item.categoryId, req.body.month, item.amount, req.user.id);
          await transaction.prepare(`
            DELETE FROM budget_month_overrides
            WHERE family_id = ? AND category_id = ? AND month = ?
          `).run(req.space.id, item.categoryId, req.body.month);
        }
      }
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
    });

    emitFamily(req.space.id, 'budgets:changed');
    res.json({ message: req.body.scope === 'month'
      ? 'Đã lưu ngân sách cho tháng này.'
      : 'Đã áp dụng ngân sách cho tháng này và các tháng sau.' });
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
    `).get(req.body.categoryId, req.space.id);
    if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục chi phù hợp.' });

    await db.prepare(`
      INSERT INTO budgets (id, family_id, category_id, month, amount, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(family_id, category_id, month)
      DO UPDATE SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
    `).run(id(), req.space.id, req.body.categoryId, req.body.month, req.body.amount, req.user.id);
    const budget = await db.prepare(`
      SELECT id FROM budgets WHERE family_id = ? AND category_id = ? AND month = ?
    `).get(req.space.id, req.body.categoryId, req.body.month);

    await bumpFamilyRevision(db, req.space.id, { base: true });
    emitFamily(req.space.id, 'budgets:changed');
    res.status(201).json({ id: budget.id, message: 'Đã lưu kế hoạch chi tiêu.' });
  },
);

router.delete('/:id', [param('id').isUUID()], validate, async (req, res) => {
  const db = getDb();
  const result = await db.prepare('DELETE FROM budgets WHERE id = ? AND family_id = ?')
    .run(req.params.id, req.space.id);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy kế hoạch chi tiêu.' });

  await bumpFamilyRevision(db, req.space.id, { base: true });
  emitFamily(req.space.id, 'budgets:changed');
  res.status(204).end();
});

export default router;
