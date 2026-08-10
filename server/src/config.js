import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(currentDir, '../.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const config = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || (vercelHost ? `https://${vercelHost}` : 'http://localhost:5173'),
  databasePath:
    process.env.DATABASE_PATH || path.resolve(currentDir, '../data/moneymate.db'),
  accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  isProduction: process.env.NODE_ENV === 'production',
  previewAuthLinks: process.env.NODE_ENV !== 'production' || process.env.AUTH_LINK_MODE === 'preview',
};
