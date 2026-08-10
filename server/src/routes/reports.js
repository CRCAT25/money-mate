import express from 'express';
import { query } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { monthRange } from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();
router.use(authenticate);

router.get(
  '/summary',
  [query('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng báo cáo không hợp lệ.'), query('memberId').optional().isUUID()],
  validate,
  async (req, res) => {
    const db = getDb();
    const range = monthRange(req.query.month);
    const memberFilter = req.query.memberId ? ' AND t.assigned_to = ?' : '';
    const params = [req.user.familyId, range.start, range.end];
    if (req.query.memberId) params.push(req.query.memberId);

    const totals = await db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
        COUNT(*) AS transaction_count
      FROM transactions t
      WHERE t.family_id = ? AND t.transaction_date >= ? AND t.transaction_date < ?${memberFilter}
    `).get(...params);

    const categories = await db.prepare(`
      SELECT c.id, c.name, c.icon, c.color, t.type, SUM(t.amount) AS amount, COUNT(*) AS count
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.family_id = ? AND t.transaction_date >= ? AND t.transaction_date < ?${memberFilter}
      GROUP BY c.id, t.type
      ORDER BY amount DESC
    `).all(...params);

    const income = Number(totals.income);
    const expense = Number(totals.expense);
    res.json({
      income,
      expense,
      balance: income - expense,
      transactionCount: Number(totals.transaction_count),
      categories: categories.map((category) => ({
        ...category,
        amount: Number(category.amount),
        count: Number(category.count),
      })),
    });
  },
);

router.get(
  '/trend',
  [query('months').optional().isInt({ min: 3, max: 12 }), query('endMonth').matches(/^\d{4}-\d{2}$/)],
  validate,
  async (req, res) => {
    const count = Number(req.query.months || 6);
    const [year, month] = req.query.endMonth.split('-').map(Number);
    const endExclusive = new Date(Date.UTC(year, month, 1));
    const start = new Date(Date.UTC(year, month - count, 1));
    const rows = await getDb().prepare(`
      SELECT substr(transaction_date, 1, 7) AS month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
      FROM transactions
      WHERE family_id = ? AND transaction_date >= ? AND transaction_date < ?
      GROUP BY substr(transaction_date, 1, 7)
      ORDER BY month
    `).all(req.user.familyId, start.toISOString().slice(0, 10), endExclusive.toISOString().slice(0, 10));

    const byMonth = new Map(rows.map((row) => [row.month, {
      ...row,
      income: Number(row.income),
      expense: Number(row.expense),
    }]));
    const result = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(year, month - 1 - offset, 1));
      const key = date.toISOString().slice(0, 7);
      result.push(byMonth.get(key) || { month: key, income: 0, expense: 0 });
    }
    res.json(result);
  },
);

router.get('/export', [query('month').matches(/^\d{4}-\d{2}$/)], validate, async (req, res) => {
  const range = monthRange(req.query.month);
  const rows = await getDb().prepare(`
    SELECT t.transaction_date, t.type, t.amount, c.name AS category,
      u.display_name AS member, COALESCE(t.note, '') AS note
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    JOIN users u ON u.id = t.assigned_to
    WHERE t.family_id = ? AND t.transaction_date >= ? AND t.transaction_date < ?
    ORDER BY t.transaction_date DESC
  `).all(req.user.familyId, range.start, range.end);

  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [
    ['Ngày', 'Loại', 'Số tiền', 'Danh mục', 'Người nhập', 'Ghi chú'],
    ...rows.map((row) => [row.transaction_date, row.type === 'income' ? 'Thu' : 'Chi', row.amount, row.category, row.member, row.note]),
  ].map((row) => row.map(escape).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="moneymate-${req.query.month}.csv"`);
  res.send(`\uFEFF${csv}`);
});

export default router;
