import postgres from 'postgres';

export async function syncNeonToSupabase() {
  const neonUrl = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL_UNPOOLED;
  const supabaseUrl = process.env.DATABASE_URL;

  if (!neonUrl) {
    throw new Error('Không tìm thấy POSTGRES_URL của Neon trong biến môi trường.');
  }
  if (!supabaseUrl || !supabaseUrl.includes('supabase')) {
    throw new Error('DATABASE_URL hiện tại không phải là Supabase.');
  }

  const neon = postgres(neonUrl, { max: 2, prepare: false, connect_timeout: 15 });
  const supabase = postgres(supabaseUrl, { max: 2, prepare: false, connect_timeout: 15 });

  const stats = {};

  try {
    const tables = [
      'users',
      'families',
      'family_members',
      'categories',
      'fund_pockets',
      'fund_pocket_member_targets',
      'budgets',
      'budget_rules',
      'budget_month_overrides',
      'transactions',
      'fund_contributions',
      'fund_pocket_transfers',
      'fund_settlements',
      'fund_settlement_items',
      'fund_settlement_pockets',
      'shopping_items',
      'bank_connections',
      'merchant_category_rules',
      'push_subscriptions',
      'refresh_tokens',
    ];

    // Read all data from Neon first
    const data = {};
    for (const table of tables) {
      const rows = await neon.unsafe(`SELECT * FROM "${table}"`);
      data[table] = rows;
      stats[table] = rows.length;
    }

    // Clean destination Supabase tables in reverse foreign key order
    const reverseTables = [...tables].reverse();
    for (const table of reverseTables) {
      await supabase.unsafe(`DELETE FROM "${table}"`);
    }

    // Insert all data into Supabase
    for (const table of tables) {
      const rows = data[table];
      if (!rows.length) continue;

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const colNames = columns.map((c) => `"${c}"`).join(', ');

        await supabase.unsafe(
          `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
      }
    }

    return { status: 'success', stats };
  } finally {
    await neon.end();
    await supabase.end();
  }
}
