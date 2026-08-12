import { getDb } from './db.js';
import { insertDefaultCategories } from './defaultCategories.js';
import { id, inviteCode } from './utils.js';

export async function ensurePersonalSpace(db, userId) {
  const existing = await db.prepare(`
    SELECT * FROM families WHERE space_type = 'personal' AND owner_user_id = ?
  `).get(userId);
  if (existing) return existing;

  const user = await db.prepare(`
    SELECT u.display_name, f.currency, f.language
    FROM users u
    LEFT JOIN family_members fm ON fm.user_id = u.id
    LEFT JOIN families f ON f.id = fm.family_id AND f.space_type = 'family'
    WHERE u.id = ?
  `).get(userId);
  if (!user) return null;

  const personal = {
    id: id(),
    name: 'Cá nhân',
    invite_code: inviteCode(),
    currency: user.currency || 'VND',
    language: user.language || 'vi',
  };
  await db.transaction(async (transaction) => {
    await transaction.prepare(`
      INSERT INTO families (id, name, invite_code, currency, language, space_type, owner_user_id)
      VALUES (?, ?, ?, ?, ?, 'personal', ?)
    `).run(personal.id, personal.name, personal.invite_code, personal.currency, personal.language, userId);
    await insertDefaultCategories(transaction, personal.id, id);
  });
  return { ...personal, space_type: 'personal', owner_user_id: userId };
}

export async function listUserSpaces(db, userId) {
  await ensurePersonalSpace(db, userId);
  const rows = await db.prepare(`
    SELECT f.*, fm.role
    FROM families f
    LEFT JOIN family_members fm ON fm.family_id = f.id AND fm.user_id = ?
    WHERE (f.space_type = 'personal' AND f.owner_user_id = ?)
       OR (f.space_type = 'family' AND fm.user_id = ?)
    ORDER BY CASE WHEN f.space_type = 'family' THEN 0 ELSE 1 END, f.created_at
  `).all(userId, userId, userId);
  return rows.map(mapSpace);
}

export async function getAccessibleSpace(db, userId, spaceId) {
  await ensurePersonalSpace(db, userId);
  const requested = spaceId || null;
  if (requested) {
    const row = await db.prepare(`
      SELECT f.*, fm.role
      FROM families f
      LEFT JOIN family_members fm ON fm.family_id = f.id AND fm.user_id = ?
      WHERE f.id = ? AND (
        (f.space_type = 'personal' AND f.owner_user_id = ?)
        OR (f.space_type = 'family' AND fm.user_id = ?)
      )
    `).get(userId, requested, userId, userId);
    return row ? mapSpace(row) : null;
  }

  const spaces = await listUserSpaces(db, userId);
  return spaces.find((space) => space.type === 'family') || spaces[0] || null;
}

export async function createFamilySpace(db, userId, { name, currency = 'VND', language = 'vi' }) {
  const membership = await db.prepare('SELECT family_id FROM family_members WHERE user_id = ?').get(userId);
  if (membership) return { error: 'Bạn đang thuộc một gia đình khác.' };

  let code;
  do code = inviteCode(); while (await db.prepare('SELECT 1 FROM families WHERE invite_code = ?').get(code));
  const familyId = id();
  await db.transaction(async (transaction) => {
    await transaction.prepare(`
      INSERT INTO families (id, name, invite_code, currency, language, space_type)
      VALUES (?, ?, ?, ?, ?, 'family')
    `).run(familyId, name.trim(), code, currency, language);
    await transaction.prepare('INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)')
      .run(familyId, userId, 'owner');
    await insertDefaultCategories(transaction, familyId, id);
  });
  return getAccessibleSpace(db, userId, familyId);
}

export async function joinFamilySpace(db, userId, code) {
  const membership = await db.prepare('SELECT family_id FROM family_members WHERE user_id = ?').get(userId);
  if (membership) return { error: 'Bạn đang thuộc một gia đình khác.' };
  const family = await db.prepare(`
    SELECT * FROM families WHERE space_type = 'family' AND invite_code = ?
  `).get(String(code || '').trim().toUpperCase());
  if (!family) return { error: 'Mã mời không đúng hoặc đã thay đổi.', status: 404 };
  await db.prepare('INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)')
    .run(family.id, userId, 'member');
  return getAccessibleSpace(db, userId, family.id);
}

export function mapSpace(space) {
  return {
    id: space.id,
    type: space.space_type || 'family',
    name: space.space_type === 'personal' ? 'Cá nhân' : space.name,
    currency: space.currency,
    language: space.language,
    role: space.space_type === 'personal' ? 'owner' : space.role,
    ownerUserId: space.owner_user_id || null,
    revisions: {
      baseRevision: Number(space.base_revision || 0),
      transactionsRevision: Number(space.transactions_revision || 0),
    },
  };
}

export async function resolveSpace(req, res, next) {
  const space = await getAccessibleSpace(getDb(), req.user.id, req.get('X-MoneyMate-Space-Id'));
  if (!space) return res.status(403).json({ message: 'Bạn không có quyền truy cập không gian này.' });
  req.space = space;
  req.user.familyId = space.id;
  req.user.role = space.role;
  next();
}

export function requireFamilySpace(req, res, next) {
  if (req.space?.type !== 'family') return res.status(422).json({ message: 'Thao tác này chỉ áp dụng cho không gian gia đình.' });
  next();
}
