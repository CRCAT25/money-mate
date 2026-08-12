import express from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../auth.js';
import { getDb } from '../db.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import {
  createFamilySpace,
  getAccessibleSpace,
  joinFamilySpace,
  listUserSpaces,
} from '../spaces.js';
import { validate } from '../validation.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const spaces = await listUserSpaces(getDb(), req.user.id);
  res.json({
    spaces,
    defaultSpaceId: spaces.find((space) => space.type === 'family')?.id || spaces[0]?.id || null,
  });
});

router.get('/:spaceId', [param('spaceId').isUUID()], validate, async (req, res) => {
  const db = getDb();
  const space = await getAccessibleSpace(db, req.user.id, req.params.spaceId);
  if (!space) return res.status(404).json({ message: 'Không tìm thấy không gian.' });
  const members = space.type === 'family'
    ? await db.prepare(`
      SELECT u.id, u.email, u.display_name, u.avatar_url, fm.role, fm.joined_at
      FROM family_members fm JOIN users u ON u.id = fm.user_id
      WHERE fm.family_id = ? ORDER BY fm.role DESC, fm.joined_at
    `).all(space.id)
    : await db.prepare('SELECT id, email, display_name, avatar_url FROM users WHERE id = ?').all(req.user.id);
  const raw = await db.prepare('SELECT invite_code FROM families WHERE id = ?').get(space.id);
  res.json({
    ...space,
    inviteCode: space.type === 'family' ? raw.invite_code : null,
    members: members.map((member) => ({
      id: member.id,
      email: member.email,
      displayName: member.display_name,
      avatarUrl: member.avatar_url,
      role: space.type === 'personal' ? 'owner' : member.role,
      joinedAt: member.joined_at || null,
    })),
  });
});

router.patch(
  '/:spaceId',
  [
    param('spaceId').isUUID(),
    body('name').optional().trim().isLength({ min: 2, max: 60 }),
    body('currency').isIn(['VND', 'USD', 'EUR']),
    body('language').isIn(['vi', 'en']),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const space = await getAccessibleSpace(db, req.user.id, req.params.spaceId);
    if (!space) return res.status(404).json({ message: 'Không tìm thấy không gian.' });
    if (space.type === 'family' && space.role !== 'owner') {
      return res.status(403).json({ message: 'Chỉ chủ gia đình mới có thể thay đổi thông tin chung.' });
    }
    const name = space.type === 'personal' ? 'Cá nhân' : req.body.name;
    await db.prepare('UPDATE families SET name = ?, currency = ?, language = ? WHERE id = ?')
      .run(name, req.body.currency, req.body.language, space.id);
    await bumpFamilyRevision(db, space.id, { base: true });
    emitFamily(space.id, 'space:changed');
    res.json({ message: space.type === 'personal' ? 'Đã cập nhật thiết lập cá nhân.' : 'Đã cập nhật thông tin gia đình.' });
  },
);

router.post(
  '/family',
  [
    body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Tên gia đình cần từ 2 đến 60 ký tự.'),
    body('currency').optional().isIn(['VND', 'USD', 'EUR']),
    body('language').optional().isIn(['vi', 'en']),
  ],
  validate,
  async (req, res) => {
    const result = await createFamilySpace(getDb(), req.user.id, req.body);
    if (result.error) return res.status(409).json({ message: result.error });
    res.status(201).json({ space: result, message: 'Đã tạo không gian gia đình.' });
  },
);

router.post('/family/join', [body('inviteCode').trim().notEmpty()], validate, async (req, res) => {
  const result = await joinFamilySpace(getDb(), req.user.id, req.body.inviteCode);
  if (result.error) return res.status(result.status || 409).json({ message: result.error });
  emitFamily(result.id, 'family:changed');
  res.json({ space: result, message: 'Đã tham gia gia đình.' });
});

router.post(
  '/family/transfer-owner',
  [body('memberId').isUUID().withMessage('Thành viên không hợp lệ.')],
  validate,
  async (req, res) => {
    const db = getDb();
    const current = await db.prepare('SELECT family_id, role FROM family_members WHERE user_id = ?').get(req.user.id);
    if (!current || current.role !== 'owner') return res.status(403).json({ message: 'Chỉ chủ gia đình mới có thể chuyển quyền.' });
    const target = await db.prepare(`
      SELECT user_id FROM family_members WHERE family_id = ? AND user_id = ? AND role = 'member'
    `).get(current.family_id, req.body.memberId);
    if (!target) return res.status(404).json({ message: 'Không tìm thấy thành viên nhận quyền.' });
    await db.transaction(async (transaction) => {
      await transaction.prepare("UPDATE family_members SET role = 'member' WHERE family_id = ? AND user_id = ?")
        .run(current.family_id, req.user.id);
      await transaction.prepare("UPDATE family_members SET role = 'owner' WHERE family_id = ? AND user_id = ?")
        .run(current.family_id, req.body.memberId);
      await bumpFamilyRevision(transaction, current.family_id, { base: true });
    });
    emitFamily(current.family_id, 'family:changed');
    res.json({ message: 'Đã chuyển quyền chủ gia đình.' });
  },
);

router.post('/family/leave', async (req, res) => {
  const db = getDb();
  const membership = await db.prepare('SELECT family_id, role FROM family_members WHERE user_id = ?').get(req.user.id);
  if (!membership) return res.status(404).json({ message: 'Bạn chưa thuộc gia đình nào.' });
  if (membership.role === 'owner') {
    return res.status(409).json({ message: 'Hãy chuyển quyền chủ gia đình trước khi rời.' });
  }
  await db.prepare('DELETE FROM family_members WHERE family_id = ? AND user_id = ?').run(membership.family_id, req.user.id);
  await bumpFamilyRevision(db, membership.family_id, { base: true });
  emitFamily(membership.family_id, 'family:changed');
  res.status(204).end();
});

router.delete('/family', async (req, res) => {
  const db = getDb();
  const membership = await db.prepare('SELECT family_id, role FROM family_members WHERE user_id = ?').get(req.user.id);
  if (!membership || membership.role !== 'owner') return res.status(403).json({ message: 'Chỉ chủ gia đình mới có thể giải tán.' });
  const count = await db.prepare('SELECT COUNT(*) AS count FROM family_members WHERE family_id = ?').get(membership.family_id);
  if (Number(count.count) > 1) return res.status(409).json({ message: 'Hãy chuyển quyền chủ gia đình nếu vẫn còn thành viên.' });
  await db.prepare("DELETE FROM families WHERE id = ? AND space_type = 'family'").run(membership.family_id);
  res.status(204).end();
});

export default router;
