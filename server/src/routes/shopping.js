import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { estimateShoppingPrice, GeminiEstimateError } from '../gemini.js';
import { getSpaceGeminiConfig } from '../geminiKeys.js';
import { lockFund, syncFundTargetsFromBudgets } from '../fund.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import { resolveSpace } from '../spaces.js';
import { id } from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();
const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  message: { message: 'Bạn tra cứu hơi nhiều. Vui lòng thử lại sau một phút.' },
});

router.use(authenticate);
router.use(resolveSpace);

router.get(
  '/',
  [query('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng mua sắm không hợp lệ.')],
  validate,
  async (req, res) => {
    const rows = await getDb().prepare(`
      SELECT s.*, c.name AS linked_category_name, c.icon AS category_icon, c.color AS category_color
      FROM shopping_items s
      LEFT JOIN categories c ON c.id = s.category_id AND c.family_id = s.family_id
      WHERE s.family_id = ? AND s.month = ?
      ORDER BY s.created_at DESC
    `).all(req.space.id, req.query.month);
    res.json({ month: req.query.month, items: rows.map(mapShoppingItem) });
  },
);

router.post(
  '/estimate',
  aiRateLimit,
  [
    body('query').trim().isLength({ min: 1, max: 120 }).withMessage('Vui lòng nhập món cần mua.'),
    body('quantity').isInt({ min: 1, max: 100000 }).withMessage('Số lượng không hợp lệ.'),
    body('unit').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Đơn vị quá dài.'),
  ],
  validate,
  async (req, res) => {
    try {
      const gemini = await getSpaceGeminiConfig(getDb(), req.space.id);
      const estimate = await estimateShoppingPrice({
        query: req.body.query,
        quantity: Number(req.body.quantity),
        unit: req.body.unit,
        currency: req.space.currency,
        apiKey: gemini.apiKey,
        model: gemini.model,
      });
      res.json(estimate);
    } catch (error) {
      if (error instanceof GeminiEstimateError) return res.status(error.status).json({ message: error.message });
      throw error;
    }
  },
);

router.post(
  '/',
  [
    body('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng mua sắm không hợp lệ.'),
    body('name').trim().isLength({ min: 1, max: 120 }).withMessage('Tên món cần từ 1 đến 120 ký tự.'),
    body('quantity').isInt({ min: 1, max: 100000 }).withMessage('Số lượng không hợp lệ.'),
    body('unit').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Đơn vị quá dài.'),
    body('plannedUnitPrice').isInt({ min: 0, max: 999999999999 }).withMessage('Giá dự kiến không hợp lệ.'),
    body('plannedTotal').optional().isInt({ min: 0, max: 999999999999 }).withMessage('Tổng tiền không hợp lệ.'),
    body('categoryId').isUUID().withMessage('Vui lòng chọn danh mục trước khi lưu.'),
    body('categoryName').optional({ nullable: true }).trim().isLength({ max: 80 }).withMessage('Tên danh mục quá dài.'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Ghi chú quá dài.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const category = await resolveCategory(db, req.space.id, req.body.categoryId);
    if (category.error) return res.status(category.error.status).json({ message: category.error.message });
    const item = buildItem(req.body, req.user.id, category.value);
    await db.transaction(async (transaction) => {
      await transaction.prepare(`
        INSERT INTO shopping_items
          (id, family_id, month, name, quantity, unit, category_id, category_name,
           planned_unit_price, planned_total, ai_price_low, ai_price_high, ai_recommended_price,
           sources_json, researched_at, confidence, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.id, req.space.id, item.month, item.name, item.quantity, item.unit, item.categoryId,
        item.categoryName, item.plannedUnitPrice, item.plannedTotal, item.aiPriceLow, item.aiPriceHigh,
        item.aiRecommendedPrice, item.sourcesJson, item.researchedAt, item.confidence, item.notes, req.user.id,
      );
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
    });
    const saved = await db.prepare('SELECT * FROM shopping_items WHERE id = ? AND family_id = ?').get(item.id, req.space.id);
    emitShoppingChanged(req.space.id, 'created', item.id);
    res.status(201).json({ item: mapShoppingItem(saved) });
  },
);

router.post(
  '/apply-budget',
  [
    body('itemId').isUUID().withMessage('Món mua sắm không hợp lệ.'),
    body('categoryId').isUUID().withMessage('Vui lòng chọn danh mục trước khi lưu.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const result = await db.transaction(async (transaction) => {
      await lockFund(transaction, req.space.id);
      const item = await selectShoppingItem(transaction, req.body.itemId, req.space.id, true);
      if (!item) return { status: 404, message: 'Không tìm thấy món mua sắm.' };
      const categoryId = req.body.categoryId || item.category_id;
      const category = await resolveCategory(transaction, req.space.id, categoryId);
      if (category.error) return category.error;
      if (!categoryId) return { status: 422, message: 'Hãy chọn danh mục trước khi đưa vào ngân sách.' };
      await applyBudgetDelta(transaction, req.space, item, item.planned_total, categoryId, req.user.id);
      const updated = await transaction.prepare(`
        UPDATE shopping_items
        SET category_id = ?, category_name = ?, budget_applied_amount = planned_total,
            budget_applied_category_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND family_id = ?
      `).run(categoryId, category.value.name, categoryId, item.id, req.space.id);
      if (!updated.changes) return { status: 404, message: 'Không tìm thấy món mua sắm.' };
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
      return { itemId: item.id };
    });
    if (result.status) return res.status(result.status).json({ message: result.message });
    emitShoppingChanged(req.space.id, 'budget-applied', result.itemId);
    emitFamily(req.space.id, 'budgets:changed', { action: 'shopping-budget-applied', id: result.itemId });
    res.json({ message: 'Đã đưa món vào ngân sách.' });
  },
);

router.post(
  '/:id/refresh',
  aiRateLimit,
  [param('id').isUUID().withMessage('Món mua sắm không hợp lệ.')],
  validate,
  async (req, res) => {
    const db = getDb();
    const item = await db.prepare('SELECT * FROM shopping_items WHERE id = ? AND family_id = ?').get(req.params.id, req.space.id);
    if (!item) return res.status(404).json({ message: 'Không tìm thấy món mua sắm.' });
    let estimate;
    try {
      const gemini = await getSpaceGeminiConfig(db, req.space.id);
      estimate = await estimateShoppingPrice({ query: item.name, quantity: Number(item.quantity), unit: item.unit, currency: req.space.currency, apiKey: gemini.apiKey, model: gemini.model });
    } catch (error) {
      if (error instanceof GeminiEstimateError) return res.status(error.status).json({ message: error.message });
      throw error;
    }
    await db.transaction(async (transaction) => {
      await lockFund(transaction, req.space.id);
      const current = await selectShoppingItem(transaction, item.id, req.space.id, true);
      if (!current) return;
      if (Number(current.budget_applied_amount) > 0) {
        await applyBudgetDelta(transaction, req.space, current, estimate.total, current.budget_applied_category_id, req.user.id);
      }
      await transaction.prepare(`
        UPDATE shopping_items SET
          name = ?, planned_unit_price = ?, planned_total = ?, ai_price_low = ?, ai_price_high = ?,
          ai_recommended_price = ?, sources_json = ?, researched_at = ?, confidence = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND family_id = ?
      `).run(
        estimate.normalizedName, estimate.recommendedPrice, estimate.total, estimate.priceLow, estimate.priceHigh,
        estimate.recommendedPrice, JSON.stringify(estimate.sources), new Date().toISOString(), estimate.confidence,
        estimate.notes || current.notes, current.id, req.space.id,
      );
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
    });
    emitShoppingChanged(req.space.id, 'refreshed', item.id);
    emitFamily(req.space.id, 'budgets:changed', { action: 'shopping-price-refreshed', id: item.id });
    res.json({ message: 'Đã cập nhật giá.', estimate });
  },
);

router.patch(
  '/:id',
  [
    param('id').isUUID().withMessage('Món mua sắm không hợp lệ.'),
    body('month').matches(/^\d{4}-\d{2}$/).withMessage('Tháng mua sắm không hợp lệ.'),
    body('name').trim().isLength({ min: 1, max: 120 }).withMessage('Tên món cần từ 1 đến 120 ký tự.'),
    body('quantity').isInt({ min: 1, max: 100000 }).withMessage('Số lượng không hợp lệ.'),
    body('unit').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Đơn vị quá dài.'),
    body('plannedUnitPrice').isInt({ min: 0, max: 999999999999 }).withMessage('Giá dự kiến không hợp lệ.'),
    body('plannedTotal').optional().isInt({ min: 0, max: 999999999999 }).withMessage('Tổng tiền không hợp lệ.'),
    body('categoryId').optional({ nullable: true }).isUUID().withMessage('Danh mục không hợp lệ.'),
    body('categoryName').optional({ nullable: true }).trim().isLength({ max: 80 }).withMessage('Tên danh mục quá dài.'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Ghi chú quá dài.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const result = await db.transaction(async (transaction) => {
      await lockFund(transaction, req.space.id);
      const existing = await selectShoppingItem(transaction, req.params.id, req.space.id, true);
      if (!existing) return { status: 404, message: 'Không tìm thấy món mua sắm.' };
      const categoryId = req.body.categoryId === undefined ? existing.category_id : req.body.categoryId;
      const category = await resolveCategory(transaction, req.space.id, categoryId);
      if (category.error) return category.error;
      const next = buildItem({ ...req.body, plannedTotal: req.body.plannedTotal }, req.user.id, category.value, existing);
      if (Number(existing.budget_applied_amount) > 0 && !next.categoryId) {
        return { status: 422, message: 'Món đã áp dụng ngân sách cần có danh mục.' };
      }
      if (Number(existing.budget_applied_amount) > 0 && next.month !== existing.month) {
        await applyBudgetDelta(transaction, req.space, existing, 0, null, req.user.id);
        const resetApplied = { ...existing, budget_applied_amount: 0, budget_applied_category_id: null };
        await applyBudgetDelta(transaction, req.space, resetApplied, next.plannedTotal, next.categoryId, req.user.id);
      } else if (Number(existing.budget_applied_amount) > 0) {
        await applyBudgetDelta(transaction, req.space, existing, next.plannedTotal, next.categoryId, req.user.id);
      }
      await transaction.prepare(`
        UPDATE shopping_items SET
          month = ?, name = ?, quantity = ?, unit = ?, category_id = ?, category_name = ?,
          planned_unit_price = ?, planned_total = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
          ${Number(existing.budget_applied_amount) > 0 ? ', budget_applied_amount = ?, budget_applied_category_id = ?' : ''}
        WHERE id = ? AND family_id = ?
      `).run(
        next.month, next.name, next.quantity, next.unit, next.categoryId, next.categoryName,
        next.plannedUnitPrice, next.plannedTotal, next.notes,
        ...(Number(existing.budget_applied_amount) > 0 ? [next.plannedTotal, next.categoryId] : []),
        existing.id, req.space.id,
      );
      await bumpFamilyRevision(transaction, req.space.id, { base: true });
      return { itemId: existing.id };
    });
    if (result.status) return res.status(result.status).json({ message: result.message });
    emitShoppingChanged(req.space.id, 'updated', result.itemId);
    emitFamily(req.space.id, 'budgets:changed', { action: 'shopping-updated', id: result.itemId });
    res.json({ message: 'Đã cập nhật món mua sắm.' });
  },
);

router.delete('/:id', [param('id').isUUID().withMessage('Món mua sắm không hợp lệ.')], validate, async (req, res) => {
  const db = getDb();
  const result = await db.transaction(async (transaction) => {
    await lockFund(transaction, req.space.id);
    const item = await selectShoppingItem(transaction, req.params.id, req.space.id, true);
    if (!item) return { status: 404, message: 'Không tìm thấy món mua sắm.' };
    if (Number(item.budget_applied_amount) > 0) {
      await applyBudgetDelta(transaction, req.space, item, 0, null, req.user.id);
    }
    await transaction.prepare('DELETE FROM shopping_items WHERE id = ? AND family_id = ?').run(item.id, req.space.id);
    await bumpFamilyRevision(transaction, req.space.id, { base: true });
    return null;
  });
  if (result) return res.status(result.status).json({ message: result.message });
  emitShoppingChanged(req.space.id, 'deleted', req.params.id);
  emitFamily(req.space.id, 'budgets:changed', { action: 'shopping-deleted', id: req.params.id });
  res.status(204).end();
});

async function resolveCategory(db, familyId, categoryId) {
  if (!categoryId) return { value: null };
  const category = await db.prepare(`
    SELECT id, name, icon, color FROM categories WHERE id = ? AND family_id = ? AND type = 'expense'
  `).get(categoryId, familyId);
  return category
    ? { value: category }
    : { error: { status: 404, message: 'Không tìm thấy danh mục chi phù hợp.' } };
}

async function selectShoppingItem(db, itemId, familyId, lock = false) {
  return db.prepare(`SELECT * FROM shopping_items WHERE id = ? AND family_id = ?${lock && db.kind === 'postgres' ? ' FOR UPDATE' : ''}`)
    .get(itemId, familyId);
}

function buildItem(data, createdBy, category, existing = {}) {
  const quantity = Number(data.quantity);
  const plannedUnitPrice = Number(data.plannedUnitPrice);
  const plannedTotal = data.plannedTotal === undefined || data.plannedTotal === null
    ? plannedUnitPrice * quantity
    : Number(data.plannedTotal);
  return {
    id: existing.id || id(),
    month: data.month || existing.month,
    name: String(data.name || existing.name).trim(),
    quantity,
    unit: data.unit === undefined ? existing.unit || null : String(data.unit || '').trim() || null,
    categoryId: category?.id || null,
    categoryName: category?.name || data.categoryName?.trim() || existing.category_name || null,
    plannedUnitPrice,
    plannedTotal,
    aiPriceLow: existing.ai_price_low ? Number(existing.ai_price_low) : null,
    aiPriceHigh: existing.ai_price_high ? Number(existing.ai_price_high) : null,
    aiRecommendedPrice: existing.ai_recommended_price ? Number(existing.ai_recommended_price) : null,
    sourcesJson: existing.sources_json || null,
    researchedAt: existing.researched_at || null,
    confidence: existing.confidence || null,
    notes: data.notes === undefined ? existing.notes || null : String(data.notes || '').trim() || null,
    createdBy,
  };
}

async function applyBudgetDelta(db, space, item, nextTotal, nextCategoryId, userId) {
  const oldAmount = Number(item.budget_applied_amount || 0);
  const oldCategoryId = item.budget_applied_category_id || null;
  if (oldAmount && oldCategoryId && oldCategoryId !== nextCategoryId) {
    await adjustCategoryBudget(db, space, oldCategoryId, -oldAmount, item.month, userId);
  } else if (oldAmount && oldCategoryId === nextCategoryId) {
    await adjustCategoryBudget(db, space, nextCategoryId, Number(nextTotal) - oldAmount, item.month, userId);
    return;
  }
  if (nextCategoryId && Number(nextTotal) > 0) {
    await adjustCategoryBudget(db, space, nextCategoryId, Number(nextTotal), item.month, userId);
  }
}

async function adjustCategoryBudget(db, space, categoryId, delta, month, userId) {
  if (!delta) return getEffectiveBudget(db, space.id, categoryId, month);
  const current = await getEffectiveBudget(db, space.id, categoryId, month);
  const next = Math.max(0, current + Number(delta));
  await db.prepare(`
    INSERT INTO budget_month_overrides (id, family_id, category_id, month, amount, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(family_id, category_id, month)
    DO UPDATE SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
  `).run(id(), space.id, categoryId, month, next, userId);
  if (space.type === 'family') await syncFundTargetsFromBudgets(db, space.id, [{ categoryId, amount: next }]);
  return next;
}

async function getEffectiveBudget(db, familyId, categoryId, month) {
  const [override, rule, legacy] = await Promise.all([
    db.prepare('SELECT amount FROM budget_month_overrides WHERE family_id = ? AND category_id = ? AND month = ?').get(familyId, categoryId, month),
    db.prepare('SELECT amount FROM budget_rules WHERE family_id = ? AND category_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1').get(familyId, categoryId, month),
    db.prepare('SELECT amount FROM budgets WHERE family_id = ? AND category_id = ? AND month = ?').get(familyId, categoryId, month),
  ]);
  return Number(override?.amount ?? rule?.amount ?? legacy?.amount ?? 0);
}

function emitShoppingChanged(spaceId, action, itemId) {
  emitFamily(spaceId, 'shopping:changed', { action, id: itemId });
}

function mapShoppingItem(item) {
  return {
    id: item.id,
    month: item.month,
    name: item.name,
    quantity: Number(item.quantity),
    unit: item.unit || null,
    category: item.category_id ? {
      id: item.category_id,
      name: item.linked_category_name || item.category_name,
      icon: item.category_icon || 'ShoppingBasket',
      color: item.category_color || '#3D7060',
    } : (item.category_name ? { id: null, name: item.category_name, icon: 'ShoppingBasket', color: '#3D7060' } : null),
    plannedUnitPrice: Number(item.planned_unit_price),
    plannedTotal: Number(item.planned_total),
    ai: item.ai_recommended_price ? {
      priceLow: Number(item.ai_price_low),
      priceHigh: Number(item.ai_price_high),
      recommendedPrice: Number(item.ai_recommended_price),
      sources: parseSources(item.sources_json),
      researchedAt: item.researched_at,
      confidence: item.confidence,
      notes: item.notes || '',
    } : null,
    notes: item.notes || '',
    budgetAppliedAmount: Number(item.budget_applied_amount || 0),
    budgetAppliedCategoryId: item.budget_applied_category_id || null,
    budgetApplied: Number(item.budget_applied_amount || 0) > 0,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function parseSources(value) {
  try {
    const sources = JSON.parse(value || '[]');
    return Array.isArray(sources) ? sources.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export default router;
