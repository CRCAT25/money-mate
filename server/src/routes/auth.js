import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { getDb } from '../db.js';
import { config } from '../config.js';
import { authenticate, signAccessToken, signRefreshToken } from '../auth.js';
import { insertDefaultCategories } from '../defaultCategories.js';
import {
  addDays,
  hashToken,
  id,
  inviteCode,
  publicUser,
  randomToken,
} from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();

async function userWithFamily(db, userId) {
  return db.prepare(`
    SELECT u.*, fm.family_id, fm.role, f.name AS family_name, f.currency, f.language
    FROM users u
    JOIN family_members fm ON fm.user_id = u.id
    JOIN families f ON f.id = fm.family_id
    WHERE u.id = ?
  `).get(userId);
}

async function createSession(db, user) {
  const refreshId = id();
  const refreshToken = signRefreshToken(user, refreshId);
  await db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(refreshId, user.id, hashToken(refreshToken), addDays(new Date(), 7).toISOString());
  return { accessToken: signAccessToken(user), refreshToken };
}

router.post(
  '/register',
  [
    body('displayName').trim().isLength({ min: 2, max: 60 }).withMessage('Tên hiển thị cần từ 2 đến 60 ký tự.'),
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ.'),
    body('password').isLength({ min: 8 }).withMessage('Mật khẩu cần ít nhất 8 ký tự.'),
    body('mode').isIn(['create', 'join']).withMessage('Hình thức tạo tài khoản không hợp lệ.'),
  ],
  validate,
  async (req, res, next) => {
    const db = getDb();
    const { displayName, email, password, mode, familyName, inviteCode: code } = req.body;

    try {
      if (await db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        return res.status(409).json({ message: 'Email này đã được sử dụng.' });
      }

      let family;
      if (mode === 'join') {
        family = await db.prepare('SELECT * FROM families WHERE invite_code = ?').get(String(code || '').trim().toUpperCase());
        if (!family) return res.status(404).json({ message: 'Mã mời không đúng hoặc đã thay đổi.' });
        const memberCount = await db.prepare('SELECT COUNT(*) AS count FROM family_members WHERE family_id = ?').get(family.id);
        if (Number(memberCount.count) >= 2) return res.status(409).json({ message: 'Gia đình này đã đủ hai thành viên.' });
      } else if (!String(familyName || '').trim()) {
        return res.status(422).json({ message: 'Vui lòng nhập tên gia đình.' });
      }

      const userId = id();
      const verificationToken = randomToken();
      const passwordHash = await bcrypt.hash(password, 12);

      await db.transaction(async (transaction) => {
        await transaction.prepare(`
          INSERT INTO users (id, email, password_hash, display_name)
          VALUES (?, ?, ?, ?)
        `).run(userId, email, passwordHash, displayName.trim());

        if (mode === 'create') {
          family = { id: id(), name: familyName.trim(), invite_code: inviteCode() };
          await transaction.prepare('INSERT INTO families (id, name, invite_code) VALUES (?, ?, ?)')
            .run(family.id, family.name, family.invite_code);
          await insertDefaultCategories(transaction, family.id, id);
        }

        await transaction.prepare('INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)')
          .run(family.id, userId, mode === 'create' ? 'owner' : 'member');
        await transaction.prepare(`
          INSERT INTO action_tokens (id, user_id, type, token_hash, expires_at)
          VALUES (?, ?, 'verify_email', ?, ?)
        `).run(id(), userId, hashToken(verificationToken), addDays(new Date(), 1).toISOString());
      });

      const verifyUrl = `${config.clientUrl}/verify-email?token=${verificationToken}`;
      console.info(`[MoneyMate] Verify ${email}: ${verifyUrl}`);
      return res.status(201).json({
        message: 'Tài khoản đã được tạo. Hãy xác nhận email để đăng nhập.',
        previewVerificationUrl: config.previewAuthLinks ? verifyUrl : undefined,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/verify-email', [body('token').notEmpty().withMessage('Thiếu mã xác nhận.')], validate, async (req, res) => {
  const db = getDb();
  const token = await db.prepare(`
    SELECT * FROM action_tokens
    WHERE token_hash = ? AND type = 'verify_email' AND used_at IS NULL AND expires_at > ?
  `).get(hashToken(req.body.token), new Date().toISOString());
  if (!token) return res.status(400).json({ message: 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.' });

  await db.transaction(async (transaction) => {
    await transaction.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(token.user_id);
    await transaction.prepare('UPDATE action_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(token.id);
  });
  return res.json({ message: 'Email đã được xác nhận. Bạn có thể đăng nhập.' });
});

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ.'), body('password').notEmpty().withMessage('Vui lòng nhập mật khẩu.')],
  validate,
  async (req, res) => {
    const db = getDb();
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu chưa đúng.' });
    }
    if (!user.email_verified) {
      return res.status(403).json({ message: 'Vui lòng xác nhận email trước khi đăng nhập.', code: 'EMAIL_NOT_VERIFIED' });
    }

    const fullUser = await userWithFamily(db, user.id);
    if (!fullUser) {
      return res.status(403).json({ message: 'Tài khoản này hiện chưa thuộc gia đình nào.' });
    }
    const session = await createSession(db, fullUser);
    return res.json({
      ...session,
      user: publicUser(fullUser),
      family: {
        id: fullUser.family_id,
        name: fullUser.family_name,
        currency: fullUser.currency,
        language: fullUser.language,
      },
    });
  },
);

router.post('/refresh', [body('refreshToken').notEmpty()], validate, async (req, res) => {
  const db = getDb();
  try {
    const payload = jwt.verify(req.body.refreshToken, config.refreshSecret);
    const stored = await db.prepare('SELECT * FROM refresh_tokens WHERE id = ? AND user_id = ?').get(payload.tokenId, payload.sub);
    if (!stored || stored.token_hash !== hashToken(req.body.refreshToken) || stored.expires_at <= new Date().toISOString()) {
      return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' });
    }
    const user = await userWithFamily(db, payload.sub);
    if (!user) return res.status(401).json({ message: 'Tài khoản không còn khả dụng.' });

    await db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);
    return res.json(await createSession(db, user));
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn.' });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  const token = req.body.refreshToken;
  if (token) await getDb().prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(token));
  res.status(204).end();
});

router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], validate, async (req, res) => {
  const db = getDb();
  const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').get(req.body.email);
  let resetUrl;
  if (user) {
    const token = randomToken();
    await db.prepare(`
      INSERT INTO action_tokens (id, user_id, type, token_hash, expires_at)
      VALUES (?, ?, 'reset_password', ?, ?)
    `).run(id(), user.id, hashToken(token), new Date(Date.now() + 60 * 60 * 1000).toISOString());
    resetUrl = `${config.clientUrl}/reset-password?token=${token}`;
    console.info(`[MoneyMate] Reset ${user.email}: ${resetUrl}`);
  }
  res.json({
    message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.',
    previewResetUrl: config.previewAuthLinks ? resetUrl : undefined,
  });
});

router.post(
  '/reset-password',
  [body('token').notEmpty(), body('password').isLength({ min: 8 }).withMessage('Mật khẩu cần ít nhất 8 ký tự.')],
  validate,
  async (req, res) => {
    const db = getDb();
    const token = await db.prepare(`
      SELECT * FROM action_tokens
      WHERE token_hash = ? AND type = 'reset_password' AND used_at IS NULL AND expires_at > ?
    `).get(hashToken(req.body.token), new Date().toISOString());
    if (!token) return res.status(400).json({ message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await db.transaction(async (transaction) => {
      await transaction.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, token.user_id);
      await transaction.prepare('UPDATE action_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(token.id);
      await transaction.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(token.user_id);
    });
    res.json({ message: 'Mật khẩu đã được cập nhật.' });
  },
);

router.get('/me', authenticate, async (req, res) => {
  const db = getDb();
  const user = await userWithFamily(db, req.user.id);
  res.json({
    user: publicUser(user),
    family: {
      id: user.family_id,
      name: user.family_name,
      currency: user.currency,
      language: user.language,
    },
  });
});

export default router;
