import { id } from './utils.js';

export async function ensureDefaultFundPocket(db, familyId) {
  const existing = await db.prepare(`
    SELECT * FROM fund_pockets
    WHERE family_id = ?
    ORDER BY is_default DESC, created_at
    LIMIT 1
  `).get(familyId);
  if (existing) return existing;
  const pocket = { id: id(), name: 'Quỹ chung', color: '#3D7060' };
  try {
    await db.prepare(`
      INSERT INTO fund_pockets (id, family_id, name, color, is_default)
      VALUES (?, ?, ?, ?, 1)
    `).run(pocket.id, familyId, pocket.name, pocket.color);
  } catch (error) {
    const concurrent = await db.prepare('SELECT * FROM fund_pockets WHERE family_id = ? ORDER BY is_default DESC, created_at LIMIT 1').get(familyId);
    if (concurrent) return concurrent;
    throw error;
  }
  return pocket;
}

export async function ensureExpenseFundPockets(db, familyId) {
  const [categories, pockets] = await Promise.all([
    db.prepare(`
      SELECT id, name, color FROM categories
      WHERE family_id = ? AND type = 'expense'
      ORDER BY is_default DESC, LOWER(name)
    `).all(familyId),
    db.prepare('SELECT id, name, color, category_id FROM fund_pockets WHERE family_id = ?').all(familyId),
  ]);
  const byCategory = new Map(pockets.filter((pocket) => pocket.category_id).map((pocket) => [pocket.category_id, pocket]));
  const byName = new Map(pockets.map((pocket) => [pocket.name.trim().toLocaleLowerCase('vi'), pocket]));

  for (const category of categories) {
    let pocket = byCategory.get(category.id);
    if (pocket) {
      const nameConflict = await db.prepare('SELECT id FROM fund_pockets WHERE family_id = ? AND LOWER(name) = LOWER(?) AND id <> ?')
        .get(familyId, category.name, pocket.id);
      await db.prepare(`UPDATE fund_pockets SET name = ?, color = ? WHERE id = ?`)
        .run(nameConflict ? pocket.name : category.name, category.color, pocket.id);
      continue;
    }

    pocket = byName.get(category.name.trim().toLocaleLowerCase('vi'));
    if (pocket && !pocket.category_id) {
      try {
        await db.prepare('UPDATE fund_pockets SET category_id = ?, color = ? WHERE id = ? AND category_id IS NULL')
          .run(category.id, category.color, pocket.id);
        pocket.category_id = category.id;
        byCategory.set(category.id, pocket);
        continue;
      } catch (error) {
        if (!isUniqueError(error)) throw error;
      }
    }

    const nextPocket = { id: id(), name: category.name, color: category.color, category_id: category.id };
    try {
      await db.prepare(`
        INSERT INTO fund_pockets (id, family_id, name, color, category_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(nextPocket.id, familyId, nextPocket.name, nextPocket.color, nextPocket.category_id);
      byCategory.set(category.id, nextPocket);
      byName.set(category.name.trim().toLocaleLowerCase('vi'), nextPocket);
    } catch (error) {
      if (!isUniqueError(error)) throw error;
    }
  }
}

export async function getFundTotals(db, familyId, { excludeTransactionId = null, pocketId = null } = {}) {
  const contributionWhere = ['family_id = ?'];
  const contributionParams = [familyId];
  if (pocketId) {
    contributionWhere.push('fund_pocket_id = ?');
    contributionParams.push(pocketId);
  }
  const contribution = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM fund_contributions
    WHERE ${contributionWhere.join(' AND ')}
  `).get(...contributionParams);
  const where = ['family_id = ?', "type = 'expense'", 'paid_from_fund = 1'];
  const params = [familyId];
  if (pocketId) {
    where.push('fund_pocket_id = ?');
    params.push(pocketId);
  }
  if (excludeTransactionId) {
    where.push('id <> ?');
    params.push(excludeTransactionId);
  }
  const spent = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE ${where.join(' AND ')}
  `).get(...params);
  const totalContributed = Number(contribution?.total || 0);
  const totalSpent = Number(spent?.total || 0);
  return {
    totalContributed,
    totalSpent,
    balance: totalContributed - totalSpent,
  };
}

export async function lockFund(db, familyId) {
  if (db.kind === 'postgres') {
    await db.prepare('SELECT id FROM families WHERE id = ? FOR UPDATE').get(familyId);
    return;
  }
  await db.prepare('UPDATE families SET transactions_revision = transactions_revision WHERE id = ?').run(familyId);
}

function isUniqueError(error) {
  return error.code === '23505' || /unique/i.test(error.message);
}
