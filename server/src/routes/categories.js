import express from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import { id } from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const categories = await getDb().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS transaction_count
    FROM categories c
    WHERE c.family_id = ?
    ORDER BY c.type DESC, c.is_default DESC, LOWER(c.name)
  `).all(req.user.familyId);
  res.json(categories.map(mapCategory));
});

router.post(
  '/',
  [
    body('name').trim().isLength({ min: 1, max: 40 }).withMessage('Tên danh mục cần từ 1 đến 40 ký tự.'),
    body('type').isIn(['expense', 'income']).withMessage('Loại danh mục không hợp lệ.'),
    body('icon').trim().notEmpty().withMessage('Vui lòng chọn biểu tượng.'),
    body('color').matches(/^#[0-9A-F]{6}$/i).withMessage('Màu sắc không hợp lệ.'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const category = { id: id(), ...req.body };
      await getDb().prepare(`
        INSERT INTO categories (id, family_id, name, type, icon, color)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(category.id, req.user.familyId, category.name.trim(), category.type, category.icon, category.color);
      await bumpFamilyRevision(getDb(), req.user.familyId, { base: true, transactions: true });
      emitFamily(req.user.familyId, 'categories:changed');
      res.status(201).json({ ...category, isDefault: false, transactionCount: 0 });
    } catch (error) {
      if (isUniqueError(error)) return res.status(409).json({ message: 'Danh mục này đã tồn tại.' });
      next(error);
    }
  },
);

router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('name').trim().isLength({ min: 1, max: 40 }),
    body('icon').trim().notEmpty(),
    body('color').matches(/^#[0-9A-F]{6}$/i),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await getDb().prepare(`
        UPDATE categories SET name = ?, icon = ?, color = ?
        WHERE id = ? AND family_id = ?
      `).run(req.body.name.trim(), req.body.icon, req.body.color, req.params.id, req.user.familyId);
      if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy danh mục.' });
      await bumpFamilyRevision(getDb(), req.user.familyId, { base: true, transactions: true });
      emitFamily(req.user.familyId, 'categories:changed');
      res.json({ message: 'Đã cập nhật danh mục.' });
    } catch (error) {
      if (isUniqueError(error)) return res.status(409).json({ message: 'Tên danh mục này đã tồn tại.' });
      next(error);
    }
  },
);

router.delete('/:id', [param('id').isUUID()], validate, async (req, res) => {
  const db = getDb();
  const category = await db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS transaction_count
    FROM categories c WHERE c.id = ? AND c.family_id = ?
  `).get(req.params.id, req.user.familyId);
  if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục.' });
  if (Number(category.transaction_count) > 0) {
    return res.status(409).json({ message: `Danh mục đang có ${category.transaction_count} giao dịch và chưa thể xóa.` });
  }
  await db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
  await bumpFamilyRevision(db, req.user.familyId, { base: true, transactions: true });
  emitFamily(req.user.familyId, 'categories:changed');
  res.status(204).end();
});

function mapCategory(category) {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    isDefault: Boolean(category.is_default),
    transactionCount: Number(category.transaction_count),
  };
}

function isUniqueError(error) {
  return error.code === '23505' || /unique/i.test(error.message);
}

export default router;
