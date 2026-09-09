import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { clearAllLinkedFundTargets, syncFundTargetsFromBudgets } from '../fund.js';
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
  [
    query('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng kế hoạch không hợp lệ.'),
    query('type').optional().isIn(['expense', 'income']).withMessage('Loại kế hoạch không hợp lệ.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const type = req.query.type || 'expense';
    const range = monthRange(req.query.month);
    const categories = await db.prepare(`
      SELECT c.id AS category_id, c.name AS category_name, c.icon AS category_icon,
        c.color AS category_color, COALESCE(SUM(t.amount), 0) AS spent
      FROM categories c
      LEFT JOIN transactions t
        ON t.category_id = c.id AND t.family_id = c.family_id AND t.type = ?
        AND t.transaction_date >= ? AND t.transaction_date < ?
      WHERE c.family_id = ? AND c.type = ?
      GROUP BY c.id, c.name, c.icon, c.color
      ORDER BY LOWER(c.name)
    `).all(type, range.start, range.end, req.space.id, type);

    const [overrides, rules, legacyBudgets, shoppingItems] = await Promise.all([
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
      type === 'expense'
        ? db.prepare(`
          SELECT id, budget_applied_category_id AS category_id, name, quantity, unit,
            planned_unit_price, planned_total, budget_applied_amount
          FROM shopping_items
          WHERE family_id = ? AND month = ? AND budget_applied_amount > 0
          ORDER BY created_at DESC
        `).all(req.space.id, req.query.month)
        : Promise.resolve([]),
    ]);

    const overridesByCategory = new Map(overrides.map((item) => [item.category_id, item]));
    const rulesByCategory = new Map();
    rules.forEach((item) => {
      if (!rulesByCategory.has(item.category_id)) rulesByCategory.set(item.category_id, item);
    });
    const legacyByCategory = new Map(legacyBudgets.map((item) => [item.category_id, item]));
    const shoppingByCategory = new Map();
    shoppingItems.forEach((item) => {
      const current = shoppingByCategory.get(item.category_id) || [];
      current.push({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        unit: item.unit || null,
        unitPrice: Number(item.planned_unit_price),
        total: Number(item.budget_applied_amount || item.planned_total),
      });
      shoppingByCategory.set(item.category_id, current);
    });

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
        shoppingItems: shoppingByCategory.get(category.category_id) || [],
      };
    });
    const totalTransactions = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE family_id = ? AND type = ?
        AND transaction_date >= ? AND transaction_date < ?
    `).get(req.space.id, type, range.start, range.end);
    const totalActual = Number(totalTransactions?.total || 0);

    const plannedItems = items.filter((item) => item.amount > 0);
    const planned = plannedItems.reduce((total, item) => total + item.amount, 0);
    const categorySpentTotal = items.reduce((total, item) => total + item.spent, 0);
    const spent = type === 'income'
      ? Math.max(totalActual, categorySpentTotal)
      : plannedItems.reduce((total, item) => total + item.spent, 0);

    res.json({
      month: req.query.month,
      type,
      planned,
      spent,
      remaining: planned - spent,
      percentage: planned ? Math.round((spent / planned) * 100) : (type === 'income' && spent > 0 ? 100 : 0),
      items,
    });
  },
);

router.post(
  '/clear-all',
  validate,
  async (req, res) => {
    const db = getDb();
    await db.transaction(async (transaction) => {
      await transaction.prepare('DELETE FROM budget_month_overrides WHERE family_id = ?').run(req.space.id);
      await transaction.prepare('DELETE FROM budget_rules WHERE family_id = ?').run(req.space.id);
      await transaction.prepare('DELETE FROM budgets WHERE family_id = ?').run(req.space.id);
      if (req.space.type === 'family') await clearAllLinkedFundTargets(transaction, req.space.id);
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
    });
    emitFamily(req.space.id, 'budgets:changed', { action: 'cleared' });
    res.json({ message: req.space.type === 'family'
      ? 'Đã xóa toàn bộ kế hoạch chi tiêu và kế hoạch nạp quỹ.'
      : 'Đã xóa toàn bộ kế hoạch chi tiêu.' });
  },
);

router.post(
  '/batch',
  [
    body('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng kế hoạch không hợp lệ.'),
    body('scope').isIn(['month', 'future']).withMessage('Cách lưu ngân sách không hợp lệ.'),
    body('type').optional().isIn(['expense', 'income']).withMessage('Loại kế hoạch không hợp lệ.'),
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
      SELECT id, type FROM categories WHERE family_id = ?
    `).all(req.space.id);
    const categoryMap = new Map(validCategories.map((category) => [category.id, category.type]));
    const targetType = req.body.type || (categoryIds.length ? categoryMap.get(categoryIds[0]) : 'expense') || 'expense';

    if (categoryIds.some((categoryId) => !categoryMap.has(categoryId) || (req.body.type && categoryMap.get(categoryId) !== req.body.type))) {
      return res.status(404).json({ message: targetType === 'income' ? 'Không tìm thấy danh mục thu phù hợp.' : 'Không tìm thấy danh mục chi phù hợp.' });
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
      if (req.space.type === 'family') {
        const expenseItems = req.body.items.filter((item) => categoryMap.get(item.categoryId) === 'expense');
        if (expenseItems.length) {
          await syncFundTargetsFromBudgets(transaction, req.space.id, expenseItems);
        }
      }
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
    });

    emitFamily(req.space.id, 'budgets:changed');
    const isIncome = targetType === 'income';
    const message = req.body.scope === 'month'
      ? (isIncome ? 'Đã lưu kế hoạch thu nhập cho tháng này.' : 'Đã lưu ngân sách cho tháng này.')
      : (isIncome ? 'Đã áp dụng kế hoạch thu nhập cho tháng này và các tháng sau.' : 'Đã áp dụng ngân sách cho tháng này và các tháng sau.');
    res.json({ message: !isIncome && req.space.type === 'family'
      ? `${message} Kế hoạch nạp quỹ đã được chia đều cho các thành viên.`
      : message });
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
      SELECT id, type FROM categories WHERE id = ? AND family_id = ?
    `).get(req.body.categoryId, req.space.id);
    if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục phù hợp.' });

    await db.transaction(async (transaction) => {
      await transaction.prepare(`
        INSERT INTO budgets (id, family_id, category_id, month, amount, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(family_id, category_id, month)
        DO UPDATE SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
      `).run(id(), req.space.id, req.body.categoryId, req.body.month, req.body.amount, req.user.id);
      if (req.space.type === 'family' && category.type === 'expense') {
        await syncFundTargetsFromBudgets(transaction, req.space.id, [{ categoryId: req.body.categoryId, amount: req.body.amount }]);
      }
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
    });
    const budget = await db.prepare(`
      SELECT id FROM budgets WHERE family_id = ? AND category_id = ? AND month = ?
    `).get(req.space.id, req.body.categoryId, req.body.month);
    emitFamily(req.space.id, 'budgets:changed');
    const isIncome = category.type === 'income';
    res.status(201).json({
      id: budget.id,
      message: isIncome
        ? 'Đã lưu kế hoạch thu nhập.'
        : (req.space.type === 'family'
          ? 'Đã lưu kế hoạch chi tiêu và chia đều kế hoạch nạp quỹ cho các thành viên.'
          : 'Đã lưu kế hoạch chi tiêu.'),
    });
  },
);

router.delete('/:id', [param('id').isUUID()], validate, async (req, res) => {
  const db = getDb();
  const result = await db.transaction(async (transaction) => {
    const budget = await transaction.prepare(`
      SELECT b.category_id, b.month, c.type AS category_type
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      WHERE b.id = ? AND b.family_id = ?
    `).get(req.params.id, req.space.id);
    if (!budget) return { status: 404 };

    await transaction.prepare('DELETE FROM budgets WHERE id = ? AND family_id = ?')
      .run(req.params.id, req.space.id);
    if (req.space.type === 'family' && budget.category_type === 'expense') {
      // A monthly override or recurring rule may still be the effective plan.
      const [override, rule] = await Promise.all([
        transaction.prepare(`
          SELECT amount FROM budget_month_overrides
          WHERE family_id = ? AND category_id = ? AND month = ?
        `).get(req.space.id, budget.category_id, budget.month),
        transaction.prepare(`
          SELECT amount FROM budget_rules
          WHERE family_id = ? AND category_id = ? AND effective_from <= ?
          ORDER BY effective_from DESC LIMIT 1
        `).get(req.space.id, budget.category_id, budget.month),
      ]);
      await syncFundTargetsFromBudgets(transaction, req.space.id, [{
        categoryId: budget.category_id,
        amount: Number(override?.amount ?? rule?.amount ?? 0),
      }]);
    }
    await bumpFamilyRevision(transaction, req.space.id, { base: true });
    return { status: 204 };
  });
  if (result.status === 404) return res.status(404).json({ message: 'Không tìm thấy kế hoạch.' });

  emitFamily(req.space.id, 'budgets:changed');
  res.status(204).end();
});

export default router;
