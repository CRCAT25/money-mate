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
  await archiveDetachedCategoryPockets(db, familyId);
  const [categories, pockets] = await Promise.all([
    db.prepare(`
      SELECT id, name, color FROM categories
      WHERE family_id = ? AND type = 'expense'
      ORDER BY is_default DESC, LOWER(name)
    `).all(familyId),
    db.prepare('SELECT id, name, color, category_id FROM fund_pockets WHERE family_id = ? AND is_archived = 0').all(familyId),
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

// Clean up category-linked pockets created before archived pockets were introduced.
async function archiveDetachedCategoryPockets(db, familyId) {
  const pockets = await db.prepare(`
    SELECT fp.id
    FROM fund_pockets fp
    WHERE fp.family_id = ? AND fp.category_id IS NULL AND fp.is_default = 0 AND fp.is_archived = 0
      AND EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.family_id = fp.family_id AND t.category_id IS NULL AND t.category_name = fp.name
      )
  `).all(familyId);
  for (const pocket of pockets) {
    await db.prepare('DELETE FROM fund_pocket_member_targets WHERE pocket_id = ?').run(pocket.id);
    await db.prepare('UPDATE fund_pockets SET is_archived = 1, monthly_target = 0 WHERE id = ? AND family_id = ?')
      .run(pocket.id, familyId);
  }
}

export async function syncFundTargetsFromBudgets(db, familyId, budgetItems) {
  if (!budgetItems.length) return;

  await ensureExpenseFundPockets(db, familyId);
  const members = await db.prepare(`
    SELECT u.id
    FROM family_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ?
    ORDER BY fm.role DESC, fm.joined_at
  `).all(familyId);
  if (!members.length) return;

  const categoryIds = [...new Set(budgetItems.map((item) => item.categoryId))];
  const pockets = await db.prepare(`
    SELECT id, category_id, is_archived
    FROM fund_pockets
    WHERE family_id = ? AND category_id IN (${categoryIds.map(() => '?').join(', ')})
  `).all(familyId, ...categoryIds);
  const pocketByCategory = new Map(pockets.map((pocket) => [pocket.category_id, pocket]));

  for (const item of budgetItems) {
    const pocket = pocketByCategory.get(item.categoryId);
    if (!pocket) continue;

    const amount = Number(item.amount);
    if (amount > 0) {
      // Reuse the historical pocket when a deleted plan is created again.
      await db.prepare('UPDATE fund_pockets SET is_archived = 0 WHERE id = ? AND family_id = ?')
        .run(pocket.id, familyId);
      if (members.length) await applyEqualFundTarget(db, familyId, pocket.id, amount, members);
    } else {
      await clearLinkedFundPocket(db, familyId, pocket.id);
    }
  }
}

async function clearLinkedFundPocket(db, familyId, pocketId) {
  // Keep contributions and old expenses for reporting, but prevent new payments.
  await db.prepare('DELETE FROM fund_pocket_member_targets WHERE pocket_id = ?').run(pocketId);
  await db.prepare(`
    UPDATE fund_pockets
    SET is_archived = 1, monthly_target = 0
    WHERE id = ? AND family_id = ? AND category_id IS NOT NULL
  `).run(pocketId, familyId);
}

export async function clearAllLinkedFundTargets(db, familyId) {
  const pockets = await db.prepare(`
    SELECT id FROM fund_pockets
    WHERE family_id = ? AND category_id IS NOT NULL
  `).all(familyId);
  for (const pocket of pockets) await clearLinkedFundPocket(db, familyId, pocket.id);
}

export async function syncMissingFundTargetsFromBudgets(db, familyId, month) {
  await ensureExpenseFundPockets(db, familyId);
  const members = await db.prepare(`
    SELECT u.id
    FROM family_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ?
    ORDER BY fm.role DESC, fm.joined_at
  `).all(familyId);
  if (!members.length) return;

  const pockets = await db.prepare(`
    SELECT fp.id, fp.category_id
    FROM fund_pockets fp
      WHERE fp.family_id = ? AND fp.is_archived = 0
      AND fp.category_id IS NOT NULL
      AND fp.monthly_target = 0
      AND NOT EXISTS (
        SELECT 1 FROM fund_pocket_member_targets fmt WHERE fmt.pocket_id = fp.id
      )
  `).all(familyId);
  if (!pockets.length) return;

  const categoryIds = pockets.map((pocket) => pocket.category_id);
  const placeholders = categoryIds.map(() => '?').join(', ');
  const [overrides, rules, legacyBudgets] = await Promise.all([
    db.prepare(`
      SELECT category_id, amount FROM budget_month_overrides
      WHERE family_id = ? AND month = ? AND category_id IN (${placeholders})
    `).all(familyId, month, ...categoryIds),
    db.prepare(`
      SELECT category_id, amount, effective_from FROM budget_rules
      WHERE family_id = ? AND effective_from <= ? AND category_id IN (${placeholders})
      ORDER BY effective_from DESC
    `).all(familyId, month, ...categoryIds),
    db.prepare(`
      SELECT category_id, amount FROM budgets
      WHERE family_id = ? AND month = ? AND category_id IN (${placeholders})
    `).all(familyId, month, ...categoryIds),
  ]);
  const overridesByCategory = new Map(overrides.map((item) => [item.category_id, item.amount]));
  const rulesByCategory = new Map();
  for (const item of rules) if (!rulesByCategory.has(item.category_id)) rulesByCategory.set(item.category_id, item.amount);
  const legacyByCategory = new Map(legacyBudgets.map((item) => [item.category_id, item.amount]));

  for (const pocket of pockets) {
    const amount = Number(
      overridesByCategory.get(pocket.category_id)
      ?? rulesByCategory.get(pocket.category_id)
      ?? legacyByCategory.get(pocket.category_id)
      ?? 0,
    );
    if (amount > 0) await applyEqualFundTarget(db, familyId, pocket.id, amount, members);
  }
}

async function applyEqualFundTarget(db, familyId, pocketId, total, members) {
  const baseAmount = Math.floor(total / members.length);
  const remainder = total % members.length;
  await db.prepare('UPDATE fund_pockets SET monthly_target = ? WHERE id = ? AND family_id = ?')
    .run(total, pocketId, familyId);
  await db.prepare('DELETE FROM fund_pocket_member_targets WHERE pocket_id = ?').run(pocketId);

  for (const [index, member] of members.entries()) {
    const amount = baseAmount + (index < remainder ? 1 : 0);
    if (!amount) continue;
    await db.prepare(`
      INSERT INTO fund_pocket_member_targets (pocket_id, user_id, target_amount)
      VALUES (?, ?, ?)
    `).run(pocketId, member.id, amount);
  }
}

export async function getFundTotals(db, familyId, { excludeTransactionId = null, pocketId = null } = {}) {
  const contributionWhere = ['fc.family_id = ?', 'fp.is_archived = 0'];
  const contributionParams = [familyId];
  if (pocketId) {
    contributionWhere.push('fc.fund_pocket_id = ?');
    contributionParams.push(pocketId);
  }
  const contribution = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM fund_contributions fc
    JOIN fund_pockets fp ON fp.id = fc.fund_pocket_id
    WHERE ${contributionWhere.join(' AND ')}
  `).get(...contributionParams);
  const where = ['t.family_id = ?', 'fp.is_archived = 0', "t.type = 'expense'", 't.paid_from_fund = 1'];
  const params = [familyId];
  if (pocketId) {
    where.push('t.fund_pocket_id = ?');
    params.push(pocketId);
  }
  if (excludeTransactionId) {
    where.push('t.id <> ?');
    params.push(excludeTransactionId);
  }
  const spent = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM transactions t
    JOIN fund_pockets fp ON fp.id = t.fund_pocket_id
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
