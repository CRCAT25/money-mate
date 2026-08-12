import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { config } from './config.js';

let database;

export function getDb() {
  if (database) return database;

  if (process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
    database = new PostgresAdapter(sql);
  } else {
    const dbPath = process.env.DATABASE_PATH || config.databasePath;
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const sqlite = new DatabaseSync(dbPath);
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    database = new SqliteAdapter(sqlite);
  }

  database.ready = migrate(database);
  return database;
}

export async function closeDb() {
  if (!database) return;
  await database.ready;
  await database.close();
  database = undefined;
}

class SqliteAdapter {
  constructor(sqlite) {
    this.sqlite = sqlite;
    this.kind = 'sqlite';
    this.ready = Promise.resolve();
  }

  prepare(source) {
    const statement = this.sqlite.prepare(source);
    return {
      get: async (...args) => statement.get(...args),
      all: async (...args) => statement.all(...args),
      run: async (...args) => {
        const result = statement.run(...args);
        return { changes: Number(result.changes) };
      },
    };
  }

  async exec(source) {
    this.sqlite.exec(source);
  }

  async transaction(callback) {
    this.sqlite.exec('BEGIN');
    try {
      const result = await callback(this);
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  async close() {
    this.sqlite.close();
  }
}

class PostgresAdapter {
  constructor(sql, inTransaction = false) {
    this.sql = sql;
    this.kind = 'postgres';
    this.inTransaction = inTransaction;
    this.ready = Promise.resolve();
  }

  prepare(source) {
    const query = postgresQuery(source);
    return {
      get: async (...args) => {
        await this.ready;
        const rows = await this.sql.unsafe(query, args);
        return rows[0];
      },
      all: async (...args) => {
        await this.ready;
        return this.sql.unsafe(query, args);
      },
      run: async (...args) => {
        await this.ready;
        const result = await this.sql.unsafe(query, args);
        return { changes: Number(result.count || 0) };
      },
    };
  }

  async exec(source) {
    await this.ready;
    const statements = source.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await this.sql.unsafe(postgresQuery(statement));
  }

  async transaction(callback) {
    await this.ready;
    if (this.inTransaction) return callback(this);
    return this.sql.begin(async (transactionSql) => {
      const transaction = new PostgresAdapter(transactionSql, true);
      return callback(transaction);
    });
  }

  async close() {
    if (!this.inTransaction) await this.sql.end({ timeout: 5 });
  }
}

function postgresQuery(source) {
  let index = 0;
  return source
    .replaceAll('CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP::text')
    .replace(/\?/g, () => `$${++index}`);
}

async function migrate(db) {
  const amountType = db.kind === 'postgres' ? 'BIGINT' : 'INTEGER';
  await db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      space_type TEXT NOT NULL DEFAULT 'family' CHECK(space_type IN ('family', 'personal')),
      owner_user_id TEXT,
      currency TEXT NOT NULL DEFAULT 'VND',
      language TEXT NOT NULL DEFAULT 'vi',
      base_revision INTEGER NOT NULL DEFAULT 0,
      transactions_revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS family_members (
      family_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'member')),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (family_id, user_id),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(family_id, name, type),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      amount ${amountType} NOT NULL CHECK(amount > 0),
      transaction_date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      amount ${amountType} NOT NULL CHECK(amount > 0),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(family_id, category_id, month),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS budget_month_overrides (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      amount ${amountType} NOT NULL CHECK(amount >= 0),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(family_id, category_id, month),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS budget_rules (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      amount ${amountType} NOT NULL CHECK(amount >= 0),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(family_id, category_id, effective_from),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS action_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('verify_email', 'reset_password')),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_family_date
      ON transactions(family_id, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_categories_family ON categories(family_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_family_month ON budgets(family_id, month);
    CREATE INDEX IF NOT EXISTS idx_budget_overrides_family_month
      ON budget_month_overrides(family_id, month);
    CREATE INDEX IF NOT EXISTS idx_budget_rules_family_effective
      ON budget_rules(family_id, effective_from);
  `);
  await ensureFamilyColumns(db);
  await backfillPersonalSpaces(db);
}

async function ensureFamilyColumns(db) {
  if (db.kind === 'postgres') {
    await db.sql.unsafe('ALTER TABLE families ADD COLUMN IF NOT EXISTS base_revision INTEGER NOT NULL DEFAULT 0');
    await db.sql.unsafe('ALTER TABLE families ADD COLUMN IF NOT EXISTS transactions_revision INTEGER NOT NULL DEFAULT 0');
    await db.sql.unsafe("ALTER TABLE families ADD COLUMN IF NOT EXISTS space_type TEXT NOT NULL DEFAULT 'family'");
    await db.sql.unsafe('ALTER TABLE families ADD COLUMN IF NOT EXISTS owner_user_id TEXT');
    await db.sql.unsafe("CREATE UNIQUE INDEX IF NOT EXISTS idx_families_personal_owner ON families(owner_user_id) WHERE space_type = 'personal'");
    return;
  }

  const columns = db.sqlite.prepare('PRAGMA table_info(families)').all();
  const names = new Set(columns.map((column) => column.column_name || column.name));
  if (!names.has('base_revision')) {
    db.sqlite.exec('ALTER TABLE families ADD COLUMN base_revision INTEGER NOT NULL DEFAULT 0');
  }
  if (!names.has('transactions_revision')) {
    db.sqlite.exec('ALTER TABLE families ADD COLUMN transactions_revision INTEGER NOT NULL DEFAULT 0');
  }
  if (!names.has('space_type')) {
    db.sqlite.exec("ALTER TABLE families ADD COLUMN space_type TEXT NOT NULL DEFAULT 'family'");
  }
  if (!names.has('owner_user_id')) {
    db.sqlite.exec('ALTER TABLE families ADD COLUMN owner_user_id TEXT');
  }
  db.sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_families_personal_owner ON families(owner_user_id) WHERE space_type = 'personal'");
}

async function backfillPersonalSpaces(db) {
  const { ensurePersonalSpace } = await import('./spaces.js');
  const users = await db.prepare('SELECT id FROM users').all();
  for (const user of users) await ensurePersonalSpace(db, user.id);
}
