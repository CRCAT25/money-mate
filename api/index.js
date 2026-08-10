import { createApp } from '../server/src/app.js';
import { getDb } from '../server/src/db.js';

await getDb().ready;

if (process.env.SEED_DEMO === 'true') {
  const db = getDb();
  const users = await db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (Number(users.count) === 0) {
    const { seedDemoData } = await import('../server/src/seedData.js');
    await seedDemoData(db);
  }
}

export default createApp();
