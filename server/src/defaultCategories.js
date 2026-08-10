export const defaultCategories = [
  ['Ăn uống', 'expense', 'Utensils', '#F9735B'],
  ['Nhà cửa', 'expense', 'House', '#E6A15C'],
  ['Giao thông', 'expense', 'Car', '#4A8F8B'],
  ['Sức khỏe', 'expense', 'HeartPulse', '#E56B78'],
  ['Giáo dục', 'expense', 'GraduationCap', '#5377B8'],
  ['Giải trí', 'expense', 'Gamepad2', '#9B78B6'],
  ['Mua sắm', 'expense', 'ShoppingBag', '#D27B9A'],
  ['Hóa đơn', 'expense', 'ReceiptText', '#708090'],
  ['Tiết kiệm', 'expense', 'PiggyBank', '#45A878'],
  ['Khác', 'expense', 'Shapes', '#8E938B'],
  ['Lương', 'income', 'WalletCards', '#258C68'],
  ['Thưởng', 'income', 'Gift', '#C6932D'],
  ['Đầu tư', 'income', 'TrendingUp', '#397EB5'],
  ['Khác', 'income', 'Sparkles', '#7C8B78'],
];

export async function insertDefaultCategories(db, familyId, makeId) {
  const insert = db.prepare(`
    INSERT INTO categories (id, family_id, name, type, icon, color, is_default)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  for (const category of defaultCategories) await insert.run(makeId(), familyId, ...category);
}
