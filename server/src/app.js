import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import familyRoutes from './routes/family.js';
import reportRoutes from './routes/reports.js';
import transactionRoutes from './routes/transactions.js';
import userRoutes from './routes/users.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'MoneyMate API' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/family', familyRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/users', userRoutes);

  app.use((req, res) => res.status(404).json({ message: 'Không tìm thấy nội dung yêu cầu.' }));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ message: 'Có lỗi xảy ra. Vui lòng thử lại sau.' });
  });
  return app;
}

