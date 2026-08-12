import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getDb } from './db.js';
import { publicUser } from './utils.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id }, config.accessSecret, {
    expiresIn: config.accessTtl,
  });
}

export function signRefreshToken(user, tokenId) {
  return jwt.sign({ sub: user.id, tokenId }, config.refreshSecret, {
    expiresIn: config.refreshTtl,
  });
}

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Bạn cần đăng nhập để tiếp tục.' });

  try {
    const payload = jwt.verify(token, config.accessSecret);
    const user = await getDb().prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);

    if (!user) return res.status(401).json({ message: 'Tài khoản không còn khả dụng.' });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn.' });
  }
}

export function requireOwner(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ message: 'Chỉ chủ gia đình mới có thể thực hiện thao tác này.' });
  }
  next();
}
