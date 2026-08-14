import webpush from 'web-push';
import { config } from './config.js';

let initialized = false;

export function pushConfigured() {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
}

export function pushPublicConfig() {
  return {
    enabled: pushConfigured(),
    publicKey: pushConfigured() ? config.vapidPublicKey : null,
  };
}

export async function sendTransactionPush(db, transaction) {
  if (!ensureConfigured()) return;

  const subscriptions = await db.prepare(`
    SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    JOIN family_members fm ON fm.user_id = ps.user_id
    WHERE fm.family_id = ? AND ps.user_id <> ?
  `).all(transaction.spaceId, transaction.actorId);
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    type: 'transaction-created',
    title: 'Khoản chi mới',
    body: `${transaction.actorName} vừa chi ${formatMoney(transaction.amount, transaction.currency)} cho ${transaction.categoryName}.`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `transaction-${transaction.transactionId}`,
    url: `/?spaceId=${encodeURIComponent(transaction.spaceId)}`,
    spaceId: transaction.spaceId,
    transactionId: transaction.transactionId,
  });

  const results = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, payload, { TTL: 300, urgency: 'high', timeout: 5000 })));

  await Promise.all(results.map(async (result, index) => {
    if (result.status === 'fulfilled') return;
    const statusCode = result.reason?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscriptions[index].id);
      return;
    }
    console.error('[MoneyMate] Push notification failed:', result.reason?.message || result.reason);
  }));
}

function ensureConfigured() {
  if (!pushConfigured()) return false;
  if (!initialized) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    initialized = true;
  }
  return true;
}

function formatMoney(amount, currency) {
  const formatted = new Intl.NumberFormat('vi-VN').format(Number(amount));
  if (currency === 'USD') return `$${formatted}`;
  if (currency === 'EUR') return `${formatted} EUR`;
  return `${formatted}đ`;
}
