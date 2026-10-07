import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, param } from 'express-validator';
import { authenticate } from '../auth.js';
import { learnCategory, suggestCategory } from '../bankSuggest.js';
import { getDb } from '../db.js';
import { sendPendingBankPush, sendTransactionPush } from '../push.js';
import { emitFamily } from '../realtime.js';
import { bumpFamilyRevision } from '../revisions.js';
import { ensurePersonalSpace, getAccessibleSpace } from '../spaces.js';
import { hashToken, id, randomToken } from '../utils.js';
import { validate } from '../validation.js';

const router = express.Router();
const NOTIFY_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Public webhook (SePay). Authenticated by a per-connection API key, not a JWT.
// SePay treats HTTP 200 + {"success": true} as delivered and retries otherwise,
// so anything we intentionally skip still answers success to stop retries.
// ---------------------------------------------------------------------------
router.post(
  '/webhook',
  rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8' }),
  async (req, res) => {
    const match = String(req.get('authorization') || '').match(/^Apikey\s+(\S+)$/i);
    if (!match) return res.status(401).json({ success: false, message: 'Missing API key.' });

    const db = getDb();
    const connection = await db.prepare('SELECT * FROM bank_connections WHERE api_key_hash = ? AND is_active = 1')
      .get(hashToken(match[1]));
    if (!connection) return res.status(401).json({ success: false, message: 'Invalid API key.' });

    const payload = req.body || {};
    const providerTxnId = String(payload.id ?? '').trim();
    if (!providerTxnId) return res.status(400).json({ success: false, message: 'Missing transaction id.' });

    const payloadAccount = digitsOnly(payload.accountNumber);
    if (payloadAccount && payloadAccount !== connection.account_number) {
      return res.json({ success: true, ignored: 'account_mismatch' });
    }
    if (payload.transferType !== 'out') return res.json({ success: true, ignored: 'not_outgoing' });
    const amount = Math.round(Number(payload.transferAmount));
    if (!Number.isFinite(amount) || amount <= 0) return res.json({ success: true, ignored: 'invalid_amount' });

    const space = await resolveTargetSpace(db, connection.user_id, connection.family_id);
    if (!space) return res.json({ success: true, ignored: 'no_space' });

    const content = String(payload.content || payload.description || '').trim().slice(0, 500) || null;
    const pendingId = id();
    const suggestedCategoryId = await suggestCategory(db, space.id, content);
    const inserted = await db.prepare(`
      INSERT INTO pending_bank_transactions
        (id, connection_id, user_id, family_id, provider_txn_id, direction, amount, content, reference_code,
         transaction_at, suggested_category_id)
      VALUES (?, ?, ?, ?, ?, 'out', ?, ?, ?, ?, ?)
      ON CONFLICT (connection_id, provider_txn_id) DO NOTHING
    `).run(
      pendingId,
      connection.id,
      connection.user_id,
      space.id,
      providerTxnId,
      amount,
      content,
      payload.referenceCode ? String(payload.referenceCode).slice(0, 120) : null,
      parseVietnamTime(payload.transactionDate),
      suggestedCategoryId,
    );
    await db.prepare('UPDATE bank_connections SET last_event_at = CURRENT_TIMESTAMP WHERE id = ?').run(connection.id);
    if (!inserted.changes) return res.json({ success: true, duplicate: true });

    emitFamily(space.id, 'bank:pending', { action: 'created' });
    // Serverless functions may freeze right after the response, so deliver before answering (bounded).
    await withTimeout(sendPendingBankPush(db, {
      id: pendingId,
      userId: connection.user_id,
      spaceId: space.id,
      amount,
      content,
      currency: space.currency,
    })).catch((error) => console.error('[MoneyMate] Bank pending push failed:', error.message));

    res.json({ success: true, id: pendingId });
  },
);

// ---------------------------------------------------------------------------
// Authenticated routes. Pending items belong to the bank account owner and are
// listed across spaces (not scoped by X-MoneyMate-Space-Id).
// ---------------------------------------------------------------------------
router.use(authenticate);

router.get('/connections', async (req, res) => {
  const rows = await getDb().prepare(`
    SELECT b.*, f.name AS space_name, f.space_type
    FROM bank_connections b
    LEFT JOIN families f ON f.id = b.family_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json({ connections: rows.map(mapConnection), webhookUrl: webhookUrl(req) });
});

router.post(
  '/connections',
  [
    body('bankName').trim().isLength({ min: 2, max: 60 }).withMessage('Tên ngân hàng không hợp lệ.'),
    body('accountNumber').customSanitizer(digitsOnly).isLength({ min: 6, max: 20 }).withMessage('Số tài khoản không hợp lệ.'),
    body('spaceId').isUUID().withMessage('Không gian không hợp lệ.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const space = await getAccessibleSpace(db, req.user.id, req.body.spaceId);
    if (!space) return res.status(403).json({ message: 'Bạn không có quyền truy cập không gian này.' });

    const duplicate = await db.prepare('SELECT 1 FROM bank_connections WHERE user_id = ? AND account_number = ?')
      .get(req.user.id, req.body.accountNumber);
    if (duplicate) return res.status(409).json({ message: 'Tài khoản ngân hàng này đã được liên kết.' });

    const apiKey = `mm_${randomToken(24)}`;
    const connectionId = id();
    await db.prepare(`
      INSERT INTO bank_connections (id, user_id, family_id, provider, bank_name, account_number, api_key_hash)
      VALUES (?, ?, ?, 'sepay', ?, ?, ?)
    `).run(connectionId, req.user.id, space.id, req.body.bankName.trim(), req.body.accountNumber, hashToken(apiKey));
    const row = await db.prepare(`
      SELECT b.*, f.name AS space_name, f.space_type FROM bank_connections b
      LEFT JOIN families f ON f.id = b.family_id WHERE b.id = ?
    `).get(connectionId);
    res.status(201).json({ connection: mapConnection(row), apiKey, webhookUrl: webhookUrl(req) });
  },
);

router.patch(
  '/connections/:id',
  [param('id').isUUID(), body('spaceId').isUUID().withMessage('Không gian không hợp lệ.')],
  validate,
  async (req, res) => {
    const db = getDb();
    const space = await getAccessibleSpace(db, req.user.id, req.body.spaceId);
    if (!space) return res.status(403).json({ message: 'Bạn không có quyền truy cập không gian này.' });
    const result = await db.prepare('UPDATE bank_connections SET family_id = ? WHERE id = ? AND user_id = ?')
      .run(space.id, req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy liên kết ngân hàng.' });
    res.json({ message: 'Đã cập nhật liên kết ngân hàng.' });
  },
);

router.delete('/connections/:id', [param('id').isUUID()], validate, async (req, res) => {
  const result = await getDb().prepare('DELETE FROM bank_connections WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy liên kết ngân hàng.' });
  res.status(204).end();
});

router.get('/pending', async (req, res) => {
  const rows = await getDb().prepare(`
    ${PENDING_SELECT}
    WHERE p.user_id = ? AND p.status = 'pending'
    ORDER BY p.transaction_at DESC, p.created_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json({ pending: rows.map(mapPending) });
});

router.get('/pending/:id', [param('id').isUUID()], validate, async (req, res) => {
  const row = await getDb().prepare(`${PENDING_SELECT} WHERE p.id = ? AND p.user_id = ?`).get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ message: 'Không tìm thấy giao dịch chờ phân loại.' });
  res.json(mapPending(row));
});

router.post(
  '/pending/:id/categorize',
  [
    param('id').isUUID(),
    body('categoryId').isUUID().withMessage('Danh mục không hợp lệ.'),
    body('spaceId').optional({ nullable: true }).isUUID().withMessage('Không gian không hợp lệ.'),
    body('note').optional({ nullable: true }).trim().isLength({ max: 240 }).withMessage('Ghi chú tối đa 240 ký tự.'),
  ],
  validate,
  async (req, res) => {
    const db = getDb();
    const pending = await db.prepare('SELECT * FROM pending_bank_transactions WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!pending) return res.status(404).json({ message: 'Không tìm thấy giao dịch chờ phân loại.' });
    if (pending.status !== 'pending') return res.status(409).json({ message: 'Giao dịch này đã được xử lý.' });

    const space = await getAccessibleSpace(db, req.user.id, req.body.spaceId || pending.family_id);
    if (!space) return res.status(403).json({ message: 'Bạn không có quyền truy cập không gian này.' });
    const category = await db.prepare('SELECT id, name, type FROM categories WHERE id = ? AND family_id = ?')
      .get(req.body.categoryId, space.id);
    if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục.' });
    if (category.type !== 'expense') return res.status(422).json({ message: 'Vui lòng chọn danh mục chi tiêu.' });

    const transactionId = id();
    const note = (req.body.note?.trim() || pending.content || '').slice(0, 240) || null;
    const saved = await db.transaction(async (transaction) => {
      const claimed = await transaction.prepare(`
        UPDATE pending_bank_transactions
        SET status = 'categorized', transaction_id = ?, family_id = ?, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status = 'pending'
      `).run(transactionId, space.id, pending.id, req.user.id);
      if (!claimed.changes) return false;
      await transaction.prepare(`
        INSERT INTO transactions
          (id, family_id, category_id, category_name, created_by, assigned_to, type, amount, paid_from_fund, fund_pocket_id,
           transaction_date, note)
        VALUES (?, ?, ?, ?, ?, ?, 'expense', ?, 0, NULL, ?, ?)
      `).run(
        transactionId,
        space.id,
        category.id,
        category.name,
        req.user.id,
        req.user.id,
        Number(pending.amount),
        String(pending.transaction_at).slice(0, 10),
        note,
      );
      await bumpFamilyRevision(transaction, space.id, { transactions: true });
      return true;
    });
    if (!saved) return res.status(409).json({ message: 'Giao dịch này đã được xử lý.' });

    await learnCategory(db, space.id, pending.content, category.id)
      .catch((error) => console.error('[MoneyMate] Could not learn bank category:', error.message));
    emitFamily(space.id, 'transactions:changed', { action: 'created', id: transactionId });
    emitFamily(space.id, 'bank:pending', { action: 'resolved' });
    if (space.type === 'family') {
      await withTimeout(sendTransactionPush(db, {
        spaceId: space.id,
        actorId: req.user.id,
        actorName: req.user.displayName,
        amount: Number(pending.amount),
        categoryName: category.name,
        currency: space.currency,
        transactionId,
      })).catch((error) => console.error('[MoneyMate] Could not dispatch transaction notification:', error.message));
    }
    res.status(201).json({ id: transactionId, spaceId: space.id, message: 'Đã ghi nhận khoản chi.' });
  },
);

router.post('/pending/:id/ignore', [param('id').isUUID()], validate, async (req, res) => {
  const result = await getDb().prepare(`
    UPDATE pending_bank_transactions SET status = 'ignored', resolved_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND status = 'pending'
  `).run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy giao dịch chờ phân loại.' });
  res.json({ message: 'Đã bỏ qua giao dịch.' });
});

const PENDING_SELECT = `
  SELECT p.*, b.bank_name, b.account_number,
    c.name AS suggested_name, c.icon AS suggested_icon, c.color AS suggested_color,
    f.name AS space_name, f.space_type
  FROM pending_bank_transactions p
  JOIN bank_connections b ON b.id = p.connection_id
  LEFT JOIN categories c ON c.id = p.suggested_category_id
  LEFT JOIN families f ON f.id = p.family_id
`;

async function resolveTargetSpace(db, userId, preferredSpaceId) {
  const preferred = await getAccessibleSpace(db, userId, preferredSpaceId);
  if (preferred) return preferred;
  // The owner may have left the family since linking; fall back to their personal space.
  const personal = await ensurePersonalSpace(db, userId);
  return personal ? getAccessibleSpace(db, userId, personal.id) : null;
}

function mapConnection(row) {
  return {
    id: row.id,
    provider: row.provider,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    accountMasked: maskAccount(row.account_number),
    spaceId: row.family_id,
    spaceName: row.space_type === 'personal' ? 'Cá nhân' : row.space_name,
    isActive: Boolean(row.is_active),
    lastEventAt: row.last_event_at || null,
    createdAt: row.created_at,
  };
}

function mapPending(row) {
  return {
    id: row.id,
    status: row.status,
    amount: Number(row.amount),
    content: row.content,
    referenceCode: row.reference_code,
    transactionAt: row.transaction_at,
    transactionId: row.transaction_id || null,
    bank: { name: row.bank_name, accountMasked: maskAccount(row.account_number) },
    space: { id: row.family_id, name: row.space_type === 'personal' ? 'Cá nhân' : row.space_name, type: row.space_type },
    suggestedCategory: row.suggested_category_id && row.suggested_name ? {
      id: row.suggested_category_id,
      name: row.suggested_name,
      icon: row.suggested_icon,
      color: row.suggested_color,
    } : null,
  };
}

function webhookUrl(req) {
  return `${req.protocol}://${req.get('host')}/api/bank/webhook`;
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function maskAccount(account) {
  const text = String(account || '');
  return text.length <= 4 ? text : `•••• ${text.slice(-4)}`;
}

// SePay sends local Vietnam time as "YYYY-MM-DD HH:mm:ss".
function parseVietnamTime(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (match) return `${match[1]}T${match[2].length === 5 ? `${match[2]}:00` : match[2]}+07:00`;
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${now.toISOString().slice(0, 19)}+07:00`;
}

function withTimeout(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Notification timed out.')), NOTIFY_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export default router;
