import crypto from 'node:crypto';
import { config } from './config.js';

const ALGORITHM = 'aes-256-gcm';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export function encryptGeminiApiKey(apiKey) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptGeminiApiKey(value) {
  if (!value) return '';
  try {
    const [ivText, tagText, encryptedText] = String(value).split('.');
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export async function getSpaceGeminiConfig(db, spaceId) {
  const space = await db.prepare('SELECT gemini_api_key_encrypted, gemini_model FROM families WHERE id = ?').get(spaceId);
  const apiKey = decryptGeminiApiKey(space?.gemini_api_key_encrypted);
  const storedModel = space?.gemini_model || config.geminiModel;
  return {
    apiKey,
    model: ['gemini-2.5-flash', 'gemini-3.6-flash'].includes(storedModel) ? DEFAULT_GEMINI_MODEL : storedModel,
    configured: Boolean(apiKey),
  };
}

export function maskGeminiApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}****${apiKey.slice(-2)}`;
  return `${apiKey.slice(0, 6)}******${apiKey.slice(-4)}`;
}

export function normalizeGeminiApiKey(value) {
  let apiKey = String(value ?? '').trim();
  apiKey = apiKey.replace(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*/i, '').trim();
  if ((apiKey.startsWith('"') && apiKey.endsWith('"')) || (apiKey.startsWith("'") && apiKey.endsWith("'"))) {
    apiKey = apiKey.slice(1, -1).trim();
  }
  return apiKey;
}

function encryptionKey() {
  if (!config.geminiEncryptionKey) throw new Error('GEMINI_ENCRYPTION_KEY is not configured');
  return crypto.createHash('sha256').update(config.geminiEncryptionKey).digest();
}
