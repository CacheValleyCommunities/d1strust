#!/usr/bin/env node
/**
 * Database migration runner for d1strust.
 * 
 * Reads SQL migration files from drizzle/sql/ and applies them sequentially.
 * Tracks applied migrations in the __migrations table to avoid re-applying.
 * 
 * Environment variables:
 * - DB_PATH: Path to SQLite database file (default: ./data/ots.db)
 * - DB_ENCRYPTION_KEY: Database encryption key (required)
 */
/* eslint-disable */
const { Database } = require('bun:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './data/ots.db';
const key = process.env.DB_ENCRYPTION_KEY;
if (!key) {
    console.error('DB_ENCRYPTION_KEY is required');
    process.exit(1);
}

// Create database directory if it doesn't exist
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// Note: Bun's SQLite doesn't support SQLCipher, so this PRAGMA key may not work
// Application-level encryption is used instead (see src/db/encryption.ts)
db.exec(`PRAGMA key = '${String(key).replace(/'/g, "''")}'`);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Create migrations tracking table
const migrationsDir = path.join(__dirname, 'sql');
const appliedTable = `CREATE TABLE IF NOT EXISTS __migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL)`;
db.exec(appliedTable);

// Get list of already applied migrations
const results = db.query('SELECT id FROM __migrations').all();
const applied = new Set(results.map(r => r.id));

// Read and sort migration files
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

// Apply each migration that hasn't been applied yet
for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
        db.exec(sql);
        db.exec(`INSERT INTO __migrations (id, appliedAt) VALUES ('${file}', ${Date.now()})`);
        console.log('Applied migration', file);
    } catch (err) {
        console.error('Error applying migration', file, err);
        throw err;
    }
}

console.log('Migrations complete');

