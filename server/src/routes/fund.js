import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { ensureDefaultFundPocket, ensureExpenseFundPockets, getFundTotals, lockFund } from '../fund.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import { requireFamilySpace, resolveSpace } from '../spaces.js';
import { id, monthRange } from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();
router.use(authenticate);
router.use(resolveSpace);
router.use(requireFamilySpace);

router.get(
  '/',
  [query('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('Tháng không hợp lệ.')],
  validate,
  async (req, res) => {
    await ensureDefaultFundPocket(getDb(), req.space.id);
    await ensureExpenseFundPockets(getDb(), req.space.id);
    res.json(await buildFundSummary(getDb(), req.space.id, req.query.month || new Date().toISOString().slice(0, 7)));
  },
);

router.post(
  '/pockets',
  [
    body('name').trim().isLength({ min: 2, max: 30 }).withMessage('Tên quỹ nhỏ cần từ 2 đến 30 ký tự.'),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Màu quỹ không hợp lệ.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    await ensureDefaultFundPocket(db, req.space.id);
    const count = await db.prepare('SELECT COUNT(*) AS total FROM fund_pockets WHERE family_id = ?').get(req.space.id);
    if (Number(count.total) >= 30) return res.status(422).json({ message: 'Mỗi gia đình có tối đa 30 quỹ.' });
    const existing = await db.prepare('SELECT id FROM fund_pockets WHERE family_id = ? AND LOWER(name) = LOWER(?)')
      .get(req.space.id, req.body.name.trim());
    if (existing) return res.status(409).json({ message: 'Tên quỹ này đã tồn tại.' });
    const pocket = {
      id: id(),
      name: req.body.name.trim(),
      color: req.body.color || '#D47A61',
    };
    await db.prepare(`
      INSERT INTO fund_pockets (id, family_id, name, color)
      VALUES (?, ?, ?, ?)
    `).run(pocket.id, req.space.id, pocket.name, pocket.color);
    await bumpFamilyRevision(db, req.space.id, { transactions: true });
    emitFamily(req.space.id, 'transactions:changed', { action: 'fund-pocket-created', id: pocket.id });
    res.status(201).json({ pocket: { ...pocket, category: null, balance: 0, totalContributed: 0, totalSpent: 0 }, message: 'Đã tạo quỹ.' });
  },
);

router.post(
  '/pockets/:pocketId/target',
  [
    param('pocketId').isUUID().withMessage('Quỹ nhỏ không hợp lệ.'),
    body('monthlyTarget').isInt({ min: 0, max: 999999999999 }).withMessage('Mục tiêu tháng không hợp lệ.'),
    body('members').isArray({ min: 0, max: 50 }).withMessage('Chỉ tiêu thành viên không hợp lệ.'),
    body('members.*.userId').isUUID().withMessage('Thành viên không hợp lệ.'),
    body('members.*.amount').isInt({ min: 0, max: 999999999999 }).withMessage('Chỉ tiêu đóng góp không hợp lệ.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const pocket = await db.prepare('SELECT id, name FROM fund_pockets WHERE id = ? AND family_id = ?')
      .get(req.params.pocketId, req.space.id);
    if (!pocket) return res.status(404).json({ message: 'Không tìm thấy quỹ nhỏ.' });
    const memberTargets = req.body.members.map((member) => ({ userId: member.userId, amount: Number(member.amount) }));
    const uniqueIds = new Set(memberTargets.map((member) => member.userId));
    if (uniqueIds.size !== memberTargets.length) return res.status(422).json({ message: 'Mỗi thành viên chỉ được đặt chỉ tiêu một lần.' });
    const monthlyTarget = Number(req.body.monthlyTarget);
    const allocated = memberTargets.reduce((sum, member) => sum + member.amount, 0);
    if (allocated !== monthlyTarget) return res.status(422).json({ message: 'Tổng chỉ tiêu từng người phải bằng mục tiêu của quỹ.' });
    if (memberTargets.length) {
      const placeholders = memberTargets.map(() => '?').join(', ');
      const members = await db.prepare(`
        SELECT user_id FROM family_members
        WHERE family_id = ? AND user_id IN (${placeholders})
      `).all(req.space.id, ...uniqueIds);
      if (members.length !== memberTargets.length) return res.status(422).json({ message: 'Có người không còn thuộc gia đình này.' });
    }
    await db.transaction(async (transaction) => {
      await transaction.prepare('UPDATE fund_pockets SET monthly_target = ? WHERE id = ? AND family_id = ?')
        .run(monthlyTarget, pocket.id, req.space.id);
      await transaction.prepare('DELETE FROM fund_pocket_member_targets WHERE pocket_id = ?').run(pocket.id);
      for (const member of memberTargets) {
        if (!member.amount) continue;
        await transaction.prepare(`
          INSERT INTO fund_pocket_member_targets (pocket_id, user_id, target_amount)
          VALUES (?, ?, ?)
        `).run(pocket.id, member.userId, member.amount);
      }
      await bumpFamilyRevision(transaction, req.space.id, { transactions: true });
    });
    emitFamily(req.space.id, 'transactions:changed', { action: 'fund-target-updated', id: pocket.id });
    res.json({ message: monthlyTarget ? `Đã cập nhật mục tiêu tháng cho ${pocket.name}.` : `Đã xóa mục tiêu tháng của ${pocket.name}.` });
  },
);

router.post(
  '/contributions',
  [
    body('contributionDate').isISO8601({ strict: true }).withMessage('Ngày nạp quỹ không hợp lệ.'),
    body('pocketId').isUUID().withMessage('Vui lòng chọn quỹ nhận tiền.'),
    body('note').optional({ nullable: true }).trim().isLength({ max: 240 }).withMessage('Ghi chú tối đa 240 ký tự.'),
    body('contributions').isArray({ min: 1, max: 50 }).withMessage('Cần chọn ít nhất một người góp quỹ.'),
    body('contributions.*.userId').isUUID().withMessage('Thành viên góp quỹ không hợp lệ.'),
    body('contributions.*.amount').isInt({ min: 1, max: 999999999999 }).withMessage('Số tiền góp cần lớn hơn 0.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const pocket = await db.prepare('SELECT id, name FROM fund_pockets WHERE id = ? AND family_id = ?')
      .get(req.body.pocketId, req.space.id);
    if (!pocket) return res.status(404).json({ message: 'Không tìm thấy quỹ nhận tiền.' });
    const contributions = req.body.contributions.map((item) => ({
      userId: item.userId,
      amount: Number(item.amount),
    }));
    const userIds = new Set(contributions.map((item) => item.userId));
    if (userIds.size !== contributions.length) {
      return res.status(422).json({ message: 'Mỗi thành viên chỉ được xuất hiện một lần.' });
    }
    const total = contributions.reduce((sum, item) => sum + item.amount, 0);
    if (!Number.isSafeInteger(total) || total > 999999999999) {
      return res.status(422).json({ message: 'Tổng số tiền góp không hợp lệ.' });
    }

    const placeholders = contributions.map(() => '?').join(', ');
    const members = await db.prepare(`
      SELECT u.id, u.display_name
      FROM family_members fm
      JOIN users u ON u.id = fm.user_id
      WHERE fm.family_id = ? AND u.id IN (${placeholders})
    `).all(req.space.id, ...userIds);
    if (members.length !== contributions.length) {
      return res.status(422).json({ message: 'Có người góp không còn thuộc gia đình này.' });
    }
    const names = new Map(members.map((member) => [member.id, member.display_name]));
    const batchId = id();
    await db.transaction(async (transaction) => {
      await lockFund(transaction, req.space.id);
      for (const contribution of contributions) {
        await transaction.prepare(`
          INSERT INTO fund_contributions
            (id, batch_id, family_id, fund_pocket_id, contributor_user_id, contributor_name, amount, contribution_date, note, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id(),
          batchId,
          req.space.id,
          pocket.id,
          contribution.userId,
          names.get(contribution.userId),
          contribution.amount,
          req.body.contributionDate.slice(0, 10),
          req.body.note?.trim() || null,
          req.user.id,
        );
      }
      await bumpFamilyRevision(transaction, req.space.id, { transactions: true });
    });
    emitFamily(req.space.id, 'transactions:changed', { action: 'fund-contributed', batchId });
    res.status(201).json({ batchId, total, message: `Đã nạp tiền vào ${pocket.name}.` });
  },
);

async function buildFundSummary(db, familyId, month) {
  const totals = await getFundTotals(db, familyId);
  const range = monthRange(month);
  const [members, contributorTotals, pockets, memberTargets, monthlyContributions, contributionRows, dailyActivity] = await Promise.all([
    db.prepare(`
      SELECT u.id, u.display_name, u.avatar_url
      FROM family_members fm
      JOIN users u ON u.id = fm.user_id
      WHERE fm.family_id = ?
      ORDER BY fm.role DESC, fm.joined_at
    `).all(familyId),
    db.prepare(`
      SELECT contributor_user_id, contributor_name, SUM(amount) AS contributed
      FROM fund_contributions
      WHERE family_id = ?
      GROUP BY contributor_user_id, contributor_name
    `).all(familyId),
    db.prepare(`
      SELECT fp.*, c.id AS linked_category_id, c.name AS category_name,
        c.icon AS category_icon, c.color AS category_color,
        COALESCE(fc.total_contributed, 0) AS total_contributed,
        COALESCE(ft.total_spent, 0) AS total_spent
      FROM fund_pockets fp
      LEFT JOIN (
        SELECT fund_pocket_id, SUM(amount) AS total_contributed
        FROM fund_contributions WHERE family_id = ? GROUP BY fund_pocket_id
      ) fc ON fc.fund_pocket_id = fp.id
      LEFT JOIN (
        SELECT fund_pocket_id, SUM(amount) AS total_spent
        FROM transactions
        WHERE family_id = ? AND type = 'expense' AND paid_from_fund = 1
        GROUP BY fund_pocket_id
      ) ft ON ft.fund_pocket_id = fp.id
      LEFT JOIN categories c ON c.id = fp.category_id
      WHERE fp.family_id = ?
      ORDER BY CASE WHEN fp.category_id IS NOT NULL THEN 0 ELSE 1 END,
        LOWER(COALESCE(c.name, fp.name)), fp.is_default DESC, fp.created_at
    `).all(familyId, familyId, familyId),
    db.prepare(`
      SELECT fmt.pocket_id, fmt.user_id, fmt.target_amount
      FROM fund_pocket_member_targets fmt
      JOIN fund_pockets fp ON fp.id = fmt.pocket_id
      WHERE fp.family_id = ?
    `).all(familyId),
    db.prepare(`
      SELECT fund_pocket_id, contributor_user_id, SUM(amount) AS contributed
      FROM fund_contributions
      WHERE family_id = ? AND contribution_date >= ? AND contribution_date < ?
      GROUP BY fund_pocket_id, contributor_user_id
    `).all(familyId, range.start, range.end),
    db.prepare(`
      SELECT fc.batch_id, fc.fund_pocket_id, fp.name AS pocket_name,
        fc.contributor_user_id, fc.contributor_name, fc.amount,
        fc.contribution_date, fc.note, fc.created_at
      FROM fund_contributions fc
      JOIN fund_pockets fp ON fp.id = fc.fund_pocket_id
      WHERE fc.family_id = ?
      ORDER BY fc.contribution_date DESC, fc.created_at DESC
      LIMIT 120
    `).all(familyId),
    db.prepare(`
      SELECT activity_date, SUM(contributed) AS contributed, SUM(spent) AS spent
      FROM (
        SELECT contribution_date AS activity_date, amount AS contributed, 0 AS spent
        FROM fund_contributions
        WHERE family_id = ? AND contribution_date >= ? AND contribution_date < ?
        UNION ALL
        SELECT transaction_date AS activity_date, 0 AS contributed, amount AS spent
        FROM transactions
        WHERE family_id = ? AND type = 'expense' AND paid_from_fund = 1
          AND transaction_date >= ? AND transaction_date < ?
      ) activity
      GROUP BY activity_date
      ORDER BY activity_date
    `).all(familyId, range.start, range.end, familyId, range.start, range.end),
  ]);

  const contributedByUser = new Map();
  for (const row of contributorTotals) {
    const key = row.contributor_user_id || `former:${row.contributor_name}`;
    contributedByUser.set(key, (contributedByUser.get(key) || 0) + Number(row.contributed));
  }
  const memberIds = new Set(members.map((member) => member.id));
  const memberSummaries = members.map((member) => ({
    id: member.id,
    displayName: member.display_name,
    avatarUrl: member.avatar_url,
    contributed: contributedByUser.get(member.id) || 0,
  }));
  for (const row of contributorTotals) {
    if (row.contributor_user_id && memberIds.has(row.contributor_user_id)) continue;
    const key = row.contributor_user_id || `former:${row.contributor_name}`;
    if (memberSummaries.some((member) => member.key === key)) continue;
    memberSummaries.push({ key, id: row.contributor_user_id, displayName: row.contributor_name, avatarUrl: null, contributed: contributedByUser.get(key) || 0 });
  }

  const targetByPocketMember = new Map(memberTargets.map((target) => [`${target.pocket_id}:${target.user_id}`, Number(target.target_amount)]));
  const contributedByPocketMember = new Map();
  const monthlyByPocket = new Map();
  for (const contribution of monthlyContributions) {
    const amount = Number(contribution.contributed || 0);
    monthlyByPocket.set(contribution.fund_pocket_id, (monthlyByPocket.get(contribution.fund_pocket_id) || 0) + amount);
    if (contribution.contributor_user_id) contributedByPocketMember.set(`${contribution.fund_pocket_id}:${contribution.contributor_user_id}`, amount);
  }

  const batches = [];
  const batchesById = new Map();
  for (const row of contributionRows) {
    let batch = batchesById.get(row.batch_id);
    if (!batch) {
      if (batches.length >= 10) continue;
      batch = {
        id: row.batch_id,
        contributionDate: row.contribution_date,
        note: row.note,
        pocket: { id: row.fund_pocket_id, name: row.pocket_name },
        total: 0,
        contributors: [],
      };
      batchesById.set(row.batch_id, batch);
      batches.push(batch);
    }
    batch.total += Number(row.amount);
    batch.contributors.push({
      userId: row.contributor_user_id,
      displayName: row.contributor_name,
      amount: Number(row.amount),
    });
  }

  return {
    ...totals,
    month,
    pockets: pockets.map((pocket) => {
      const monthlyTarget = Number(pocket.monthly_target || 0);
      const monthlyContributed = monthlyByPocket.get(pocket.id) || 0;
      return {
        id: pocket.id,
        name: pocket.name,
        color: pocket.color,
        isDefault: Boolean(pocket.is_default),
        category: pocket.linked_category_id ? {
          id: pocket.linked_category_id,
          name: pocket.category_name,
          icon: pocket.category_icon,
          color: pocket.category_color,
        } : null,
        totalContributed: Number(pocket.total_contributed || 0),
        totalSpent: Number(pocket.total_spent || 0),
        balance: Number(pocket.total_contributed || 0) - Number(pocket.total_spent || 0),
        monthlyTarget,
        monthlyContributed,
        monthlyRemaining: Math.max(0, monthlyTarget - monthlyContributed),
        monthlyPercentage: monthlyTarget > 0 ? Math.min(100, Math.round((monthlyContributed / monthlyTarget) * 100)) : 0,
        memberTargets: members.map((member) => {
          const target = targetByPocketMember.get(`${pocket.id}:${member.id}`) || 0;
          const contributed = contributedByPocketMember.get(`${pocket.id}:${member.id}`) || 0;
          return {
            id: member.id,
            displayName: member.display_name,
            avatarUrl: member.avatar_url,
            target,
            contributed,
            remaining: Math.max(0, target - contributed),
          };
        }).filter((member) => member.target > 0 || member.contributed > 0),
      };
    }),
    members: memberSummaries,
    recentContributions: batches,
    dailyActivity: dailyActivity.map((activity) => ({
      date: activity.activity_date,
      contributed: Number(activity.contributed || 0),
      spent: Number(activity.spent || 0),
    })),
  };
}

export default router;
