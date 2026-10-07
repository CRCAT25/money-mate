// Category suggestions for bank transactions, based on the transfer content.
// Learned rules (per space) win over the built-in merchant keywords.

const NOISE_TOKENS = new Set([
  'THANH', 'TOAN', 'TT', 'QR', 'QRPAY', 'VIETQR', 'CHUYEN', 'TIEN', 'CK', 'GD', 'MA', 'GIAO', 'DICH',
  'TAI', 'TU', 'DEN', 'CHO', 'VA', 'CUA', 'NGAY', 'LUC', 'SO', 'TK', 'TCB', 'TECHCOMBANK', 'NAPAS',
  'IBFT', 'FT', 'MBVCB', 'VCB', 'TRACE', 'REF', 'POS', 'ECOM', 'PAYMENT', 'PAY', 'TO', 'FROM', 'VNPAY',
  'VNPAYQR', 'MOMO', 'ZALOPAY', 'SHOPEEPAY', 'CN', 'CTY', 'CONG', 'TY', 'TNHH', 'CP', 'JSC', 'CO', 'LTD',
]);

// Ordered: more specific keywords first (GRABFOOD before GRAB).
const BUILTIN_RULES = [
  ['Ăn uống', ['GRABFOOD', 'GRAB FOOD', 'SHOPEEFOOD', 'SHOPEE FOOD', 'BAEMIN', 'HIGHLANDS', 'PHUC LONG', 'STARBUCKS',
    'KATINAT', 'CONG CA PHE', 'TRUNG NGUYEN', 'THE COFFEE HOUSE', 'COFFEE', 'CAFE', 'CA PHE', 'TRA SUA', 'GONG CHA',
    'PHE LA', 'KFC', 'LOTTERIA', 'JOLLIBEE', 'MCDONALD', 'PIZZA', 'BURGER', 'BUN', 'PHO', 'COM', 'NHA HANG', 'RESTAURANT']],
  ['Giao thông', ['GRAB', 'BE GROUP', 'XANH SM', 'GSM', 'GOJEK', 'PETROLIMEX', 'XANG', 'VETC', 'EPASS', 'GUI XE', 'PARKING',
    'VIETJET', 'VIETNAM AIRLINES', 'BAMBOO']],
  ['Hóa đơn', ['EVN', 'TIEN DIEN', 'TIEN NUOC', 'CAP NUOC', 'VIETTEL', 'VNPT', 'MOBIFONE', 'VINAPHONE', 'FPT TELECOM',
    'INTERNET', 'TRUYEN HINH']],
  ['Giải trí', ['CGV', 'LOTTE CINEMA', 'BHD', 'GALAXY CINEMA', 'NETFLIX', 'SPOTIFY', 'STEAM', 'YOUTUBE', 'APPLE.COM',
    'GOOGLE PLAY']],
  ['Sức khỏe', ['PHARMACITY', 'LONG CHAU', 'AN KHANG', 'NHA THUOC', 'BENH VIEN', 'PHONG KHAM', 'HOSPITAL']],
  ['Mua sắm', ['SHOPEE', 'LAZADA', 'TIKI', 'TIKTOK', 'WINMART', 'COOPMART', 'CO.OP', 'BACH HOA XANH', 'CIRCLE K',
    'GS25', 'FAMILYMART', '7-ELEVEN', 'MINISTOP', 'AEON', 'LOTTE MART', 'GO!', 'BIG C', 'UNIQLO', 'THE GIOI DI DONG',
    'DIEN MAY XANH', 'FPT SHOP', 'CELLPHONES']],
];

export function normalizeContent(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9.!\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The merchant key is the first two meaningful words, e.g. "HIGHLANDS COFFEE".
export function merchantKeyword(text) {
  const tokens = normalizeContent(text)
    .split(' ')
    .map((token) => token.replace(/^[.\-!]+|[.\-!]+$/g, ''))
    .filter((token) => token.length >= 2 && !/\d/.test(token) && !NOISE_TOKENS.has(token));
  const keyword = tokens.slice(0, 2).join(' ');
  return keyword.length >= 3 ? keyword : null;
}

export async function suggestCategory(db, familyId, content) {
  const normalized = ` ${normalizeContent(content)} `;
  if (!normalized.trim()) return null;
  const hasWord = (keyword) => normalized.includes(` ${keyword} `);

  const rules = await db.prepare(`
    SELECT r.keyword, r.category_id, r.hit_count
    FROM merchant_category_rules r
    JOIN categories c ON c.id = r.category_id AND c.family_id = r.family_id AND c.type = 'expense'
    WHERE r.family_id = ?
  `).all(familyId);
  const learned = rules
    .filter((rule) => hasWord(rule.keyword))
    .sort((a, b) => Number(b.hit_count) - Number(a.hit_count) || b.keyword.length - a.keyword.length)[0];
  if (learned) return learned.category_id;

  for (const [categoryName, keywords] of BUILTIN_RULES) {
    if (!keywords.some(hasWord)) continue;
    const category = await db.prepare(`
      SELECT id FROM categories WHERE family_id = ? AND type = 'expense' AND name = ?
    `).get(familyId, categoryName);
    if (category) return category.id;
  }
  return null;
}

export async function learnCategory(db, familyId, content, categoryId) {
  const keyword = merchantKeyword(content);
  if (!keyword) return;
  const existing = await db.prepare('SELECT category_id FROM merchant_category_rules WHERE family_id = ? AND keyword = ?')
    .get(familyId, keyword);
  if (!existing) {
    await db.prepare(`
      INSERT INTO merchant_category_rules (family_id, keyword, category_id, hit_count) VALUES (?, ?, ?, 1)
    `).run(familyId, keyword, categoryId);
  } else if (existing.category_id === categoryId) {
    await db.prepare(`
      UPDATE merchant_category_rules SET hit_count = hit_count + 1, updated_at = CURRENT_TIMESTAMP
      WHERE family_id = ? AND keyword = ?
    `).run(familyId, keyword);
  } else {
    // The latest choice wins so a corrected category takes effect immediately.
    await db.prepare(`
      UPDATE merchant_category_rules SET category_id = ?, hit_count = 1, updated_at = CURRENT_TIMESTAMP
      WHERE family_id = ? AND keyword = ?
    `).run(categoryId, familyId, keyword);
  }
}
