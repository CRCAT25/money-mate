import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

export function formatMoney(value, currency = 'VND') {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(Number(value || 0));
}

export function compactMoney(value, currency = 'VND') {
  return new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    style: 'currency',
    currency,
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

export function normalizeAmountDigits(value, maxDigits = 12) {
  const text = String(value ?? '').trim();
  const sign = text.startsWith('-') ? '-' : '';
  const digits = text.replace(/\D/g, '').slice(0, maxDigits);
  if (!digits) return '';
  return `${sign}${digits.replace(/^0+(?=\d)/, '')}`;
}

export function formatInputAmount(value) {
  const normalized = normalizeAmountDigits(value);
  if (!normalized) return '';
  const negative = normalized.startsWith('-');
  const digits = negative ? normalized.slice(1) : normalized;
  const formatted = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(digits));
  return negative ? `-${formatted}` : formatted;
}

export function formatDate(value) {
  return format(parseISO(value), 'EEEE, d MMMM', { locale: vi });
}

export function monthLabel(value) {
  return format(parseISO(`${value}-01`), "'Tháng' M, yyyy", { locale: vi });
}

export const currentMonth = () => new Date().toISOString().slice(0, 7);

export function shiftMonth(month, amount) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + amount, 1)).toISOString().slice(0, 7);
}
