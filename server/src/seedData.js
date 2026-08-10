import bcrypt from 'bcryptjs';
import { insertDefaultCategories } from './defaultCategories.js';
import { id } from './utils.js';

export async function seedDemoData(db) {
  const familyId = '11111111-1111-4111-8111-111111111111';
  const ownerId = '22222222-2222-4222-8222-222222222222';
  const memberId = '33333333-3333-4333-8333-333333333333';
  const passwordHash = await bcrypt.hash('MoneyMate123!', 12);

  await db.transaction(async (transaction) => {
    await transaction.prepare('DELETE FROM families WHERE id = ?').run(familyId);
    await transaction.prepare(`INSERT INTO families (id, name, invite_code, currency, language) VALUES (?, ?, ?, 'VND', 'vi')`)
      .run(familyId, 'Nhà Mình', 'MATE2026');
    await transaction.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, email_verified)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash,
        display_name = excluded.display_name, avatar_url = NULL, email_verified = 1
    `).run(ownerId, 'minh@moneymate.local', passwordHash, 'Minh');
    await transaction.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, email_verified)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash,
        display_name = excluded.display_name, avatar_url = NULL, email_verified = 1
    `).run(memberId, 'an@moneymate.local', passwordHash, 'An');
    await transaction.prepare(`INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, 'owner')`).run(familyId, ownerId);
    await transaction.prepare(`INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, 'member')`).run(familyId, memberId);
    await insertDefaultCategories(transaction, familyId, id);

    const categories = await transaction.prepare('SELECT id, name, type FROM categories WHERE family_id = ?').all(familyId);
    const findCategory = (name, type) => categories.find((item) => item.name === name && item.type === type).id;
    const insertTransaction = transaction.prepare(`
      INSERT INTO transactions
        (id, family_id, category_id, created_by, assigned_to, type, amount, transaction_date, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const today = new Date();
    const date = (monthOffset, day) => {
      const safeDay = monthOffset === 0 ? Math.min(day, today.getDate()) : day;
      const value = new Date(today.getFullYear(), today.getMonth() + monthOffset, safeDay, 12);
      return value.toISOString().slice(0, 10);
    };
    const items = [
      ['Lương', 'income', 32000000, date(0, 1), 'Lương tháng này', ownerId],
      ['Lương', 'income', 24500000, date(0, 2), 'Lương tháng này', memberId],
      ['Nhà cửa', 'expense', 9000000, date(0, 3), 'Tiền thuê nhà', ownerId],
      ['Ăn uống', 'expense', 385000, date(0, 7), 'Đi chợ cuối tuần', memberId],
      ['Giao thông', 'expense', 120000, date(0, 8), 'Đổ xăng', ownerId],
      ['Hóa đơn', 'expense', 1380000, date(0, 9), 'Điện, nước, internet', memberId],
      ['Tiết kiệm', 'expense', 8000000, date(0, 10), 'Quỹ dự phòng', ownerId],
      ['Giải trí', 'expense', 490000, date(0, 12), 'Xem phim và cà phê', memberId],
      ['Lương', 'income', 54000000, date(-1, 2), 'Thu nhập tháng trước', ownerId],
      ['Ăn uống', 'expense', 5200000, date(-1, 15), 'Ăn uống tháng trước', memberId],
      ['Nhà cửa', 'expense', 9100000, date(-1, 4), 'Nhà cửa tháng trước', ownerId],
      ['Lương', 'income', 52500000, date(-2, 2), 'Thu nhập', ownerId],
      ['Mua sắm', 'expense', 4600000, date(-2, 18), 'Đồ dùng gia đình', memberId],
      ['Lương', 'income', 51000000, date(-3, 2), 'Thu nhập', ownerId],
      ['Sức khỏe', 'expense', 2200000, date(-3, 19), 'Khám sức khỏe', memberId],
    ];
    for (const [name, type, amount, transactionDate, note, assignedTo] of items) {
      await insertTransaction.run(id(), familyId, findCategory(name, type), ownerId, assignedTo, type, amount, transactionDate, note);
    }
  });
}

