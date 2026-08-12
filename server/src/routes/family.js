import express from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireOwner } from '../auth.js';
import { getDb } from '../db.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision, familyRevisions } from '../revisions.js';
import { inviteCode } from '../utils.js';
import { validate } from '../validation.js';
import { getAccessibleSpace } from '../spaces.js';

const router = express.Router();
router.use(authenticate);

router.use(async (req, res, next) => {
  const space = await getAccessibleSpace(getDb(), req.user.id, req.get('X-MoneyMate-Space-Id'));
  if (!space || space.type !== 'family') return res.status(404).json({ message: 'Bạn chưa thuộc gia đình nào.' });
  req.space = space;
  req.user.familyId = space.id;
  req.user.role = space.role;
  next();
});

router.get('/', async (req, res) => {
  const db = getDb();
  const family = await db.prepare('SELECT * FROM families WHERE id = ?').get(req.user.familyId);
  const members = await db.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url, fm.role, fm.joined_at
    FROM family_members fm JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ? ORDER BY fm.role DESC, fm.joined_at
  `).all(req.user.familyId);
  res.json({
    id: family.id,
    name: family.name,
    inviteCode: family.invite_code,
    currency: family.currency,
    language: family.language,
    revisions: familyRevisions(family),
    members: members.map((member) => ({
      id: member.id,
      email: member.email,
      displayName: member.display_name,
      avatarUrl: member.avatar_url,
      role: member.role,
      joinedAt: member.joined_at,
    })),
  });
});

router.get('/sync', async (req, res) => {
  const family = await getDb().prepare('SELECT base_revision, transactions_revision FROM families WHERE id = ?')
    .get(req.user.familyId);
  res.json(familyRevisions(family));
});

router.patch(
  '/',
  [
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Tên gia đình cần từ 2 đến 60 ký tự.'),
    body('currency').isIn(['VND', 'USD', 'EUR']).withMessage('Loại tiền chưa được hỗ trợ.'),
    body('language').isIn(['vi', 'en']).withMessage('Ngôn ngữ chưa được hỗ trợ.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    await db.prepare('UPDATE families SET name = ?, currency = ?, language = ? WHERE id = ?')
      .run(req.body.name.trim(), req.body.currency, req.body.language, req.user.familyId);
    await bumpFamilyRevision(db, req.user.familyId, { base: true });
    emitFamily(req.user.familyId, 'family:changed');
    res.json({ message: 'Đã cập nhật thông tin gia đình.' });
  },
);

router.post('/invite-code', requireOwner, async (req, res) => {
  const db = getDb();
  let code;
  do code = inviteCode(); while (await db.prepare('SELECT 1 FROM families WHERE invite_code = ?').get(code));
  await db.prepare('UPDATE families SET invite_code = ? WHERE id = ?').run(code, req.user.familyId);
  await bumpFamilyRevision(db, req.user.familyId, { base: true });
  emitFamily(req.user.familyId, 'family:changed');
  res.json({ inviteCode: code, message: 'Đã tạo mã mời mới.' });
});

router.delete('/members/:memberId', requireOwner, [param('memberId').isUUID()], validate, async (req, res) => {
  if (req.params.memberId === req.user.id) {
    return res.status(422).json({ message: 'Chủ gia đình không thể tự xóa mình.' });
  }
  const db = getDb();
  const result = await db.prepare(`
    DELETE FROM family_members WHERE family_id = ? AND user_id = ? AND role = 'member'
  `).run(req.user.familyId, req.params.memberId);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy thành viên.' });
  await bumpFamilyRevision(db, req.user.familyId, { base: true });
  emitFamily(req.user.familyId, 'family:changed');
  res.status(204).end();
});

router.post('/leave', async (req, res) => {
  if (req.user.role === 'owner') return res.status(409).json({ message: 'Hãy chuyển quyền chủ gia đình trước khi rời.' });
  await getDb().prepare('DELETE FROM family_members WHERE family_id = ? AND user_id = ?')
    .run(req.user.familyId, req.user.id);
  await bumpFamilyRevision(getDb(), req.user.familyId, { base: true });
  emitFamily(req.user.familyId, 'family:changed');
  res.status(204).end();
});

export default router;
