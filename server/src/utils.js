import crypto from 'node:crypto';

export const id = () => crypto.randomUUID();
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const inviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 1));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    emailVerified: Boolean(user.email_verified),
    role: user.role,
  };
}

