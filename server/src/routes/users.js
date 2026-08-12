import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { authenticate } from '../auth.js';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import { addDays, hashToken, id, randomToken } from '../utils.js';
import { validate } from '../validation.js';
import { listUserSpaces } from '../spaces.js';

const router = express.Router();
router.use(authenticate);

router.patch(
  '/me',
  [
    body('displayName').trim().isLength({ min: 2, max: 60 }).withMessage('Tên hiển thị cần từ 2 đến 60 ký tự.'),
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ.'),
    body('avatarUrl').optional({ nullable: true }).custom((value) => {
      if (!value) return true;
      if (value.length > 300000) throw new Error('Ảnh đại diện quá lớn.');
      if (/^https?:\/\//i.test(value) || /^data:image\/(png|jpe?g|webp);base64,/i.test(value)) return true;
      throw new Error('Ảnh đại diện không hợp lệ.');
    }),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const existing = await db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
    const emailChanged = existing.email !== req.body.email;
    if (emailChanged && await db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(req.body.email, req.user.id)) {
      return res.status(409).json({ message: 'Email này đã được sử dụng.' });
    }

    let previewVerificationUrl;
    await db.transaction(async (transaction) => {
      await transaction.prepare(`
        UPDATE users SET display_name = ?, email = ?, avatar_url = ?,
          email_verified = CASE WHEN email = ? THEN email_verified ELSE 0 END
        WHERE id = ?
      `).run(
        req.body.displayName.trim(),
        req.body.email,
        req.body.avatarUrl?.trim() || null,
        req.body.email,
        req.user.id,
      );

      if (emailChanged) {
        const verificationToken = randomToken();
        await transaction.prepare("DELETE FROM action_tokens WHERE user_id = ? AND type = 'verify_email' AND used_at IS NULL")
          .run(req.user.id);
        await transaction.prepare(`
          INSERT INTO action_tokens (id, user_id, type, token_hash, expires_at)
          VALUES (?, ?, 'verify_email', ?, ?)
        `).run(id(), req.user.id, hashToken(verificationToken), addDays(new Date(), 1).toISOString());
        previewVerificationUrl = `${config.clientUrl}/verify-email?token=${verificationToken}`;
        console.info(`[MoneyMate] Verify ${req.body.email}: ${previewVerificationUrl}`);
      }
    });
    const spaces = await listUserSpaces(db, req.user.id);
    await Promise.all(spaces.map(async (space) => {
      await bumpFamilyRevision(db, space.id, { base: true, transactions: true });
      emitFamily(space.id, 'space:changed');
    }));
    res.json({
      message: emailChanged ? 'Đã cập nhật hồ sơ. Hãy xác nhận email mới.' : 'Đã cập nhật hồ sơ.',
      previewVerificationUrl: config.previewAuthLinks ? previewVerificationUrl : undefined,
    });
  },
);

router.patch(
  '/me/password',
  [
    body('currentPassword').notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại.'),
    body('newPassword').isLength({ min: 8 }).withMessage('Mật khẩu mới cần ít nhất 8 ký tự.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!(await bcrypt.compare(req.body.currentPassword, user.password_hash))) {
      return res.status(401).json({ message: 'Mật khẩu hiện tại chưa đúng.' });
    }
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    await db.transaction(async (transaction) => {
      await transaction.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
      await transaction.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);
    });
    res.json({ message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
  },
);

router.delete('/me', async (req, res) => {
  const db = getDb();
  const member = await db.prepare('SELECT role, family_id FROM family_members WHERE user_id = ?').get(req.user.id);
  if (member?.role === 'owner') {
    const count = await db.prepare('SELECT COUNT(*) AS count FROM family_members WHERE family_id = ?').get(member.family_id);
    if (Number(count.count) > 1) {
      return res.status(409).json({ message: 'Hãy xóa thành viên còn lại trước khi xóa tài khoản chủ gia đình.' });
    }
    await db.transaction(async (transaction) => {
      await transaction.prepare('DELETE FROM families WHERE id = ?').run(member.family_id);
      await transaction.prepare("DELETE FROM families WHERE space_type = 'personal' AND owner_user_id = ?").run(req.user.id);
      await transaction.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    });
  } else if (member) {
    await db.transaction(async (transaction) => {
      await transaction.prepare('DELETE FROM family_members WHERE user_id = ?').run(req.user.id);
      await transaction.prepare("DELETE FROM families WHERE space_type = 'personal' AND owner_user_id = ?").run(req.user.id);
      await transaction.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);
      await transaction.prepare('DELETE FROM action_tokens WHERE user_id = ?').run(req.user.id);
      await transaction.prepare(`
        UPDATE users SET email = ?, display_name = 'Thành viên đã xóa', avatar_url = NULL,
          email_verified = 0
        WHERE id = ?
      `).run(`deleted-${req.user.id}@moneymate.local`, req.user.id);
    });
  } else {
    await db.transaction(async (transaction) => {
      await transaction.prepare("DELETE FROM families WHERE space_type = 'personal' AND owner_user_id = ?").run(req.user.id);
      await transaction.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    });
  }
  res.status(204).end();
});

export default router;
