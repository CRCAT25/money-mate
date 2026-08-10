export async function bumpFamilyRevision(db, familyId, { base = false, transactions = false } = {}) {
  const updates = [];
  if (base) updates.push('base_revision = base_revision + 1');
  if (transactions) updates.push('transactions_revision = transactions_revision + 1');
  if (!updates.length) return;
  await db.prepare(`UPDATE families SET ${updates.join(', ')} WHERE id = ?`).run(familyId);
}

export function familyRevisions(family) {
  return {
    baseRevision: Number(family.base_revision || 0),
    transactionsRevision: Number(family.transactions_revision || 0),
  };
}
