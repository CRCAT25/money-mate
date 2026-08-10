import { closeDb, getDb } from './db.js';
import { seedDemoData } from './seedData.js';

const db = getDb();
await db.ready;
await seedDemoData(db);
console.info('Demo data ready. Login: minh@moneymate.local / MoneyMate123!');
await closeDb();

