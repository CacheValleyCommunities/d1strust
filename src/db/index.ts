import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { config } from '../config';
import * as schema from './schema';
import { checkSqlCipherAvailable } from './encryption';

/** Singleton database instance */
let dbInstance: BunSQLiteDatabase<typeof schema> | null = null;

/**
 * Creates or returns the existing database instance.
 * 
 * Performs the following initialization:
 * - Checks for SQLCipher support (falls back to application-level encryption if unavailable)
 * - Sets up WAL journal mode for better concurrency
 * - Enables foreign key constraints
 * - Creates the secrets table if it doesn't exist
 * - Creates indexes for performance
 * 
 * @returns {BunSQLiteDatabase<typeof schema>} Drizzle database instance
 */
export function createDb(): BunSQLiteDatabase<typeof schema> {
    if (dbInstance) {
        return dbInstance;
    }
    const db = new Database(config.dbPath);

    // Check if SQLCipher is available (Bun's SQLite doesn't support it)
    const sqlCipherAvailable = checkSqlCipherAvailable(db);
    if (!sqlCipherAvailable) {
        // Bun's SQLite doesn't support SQLCipher, so we use application-level encryption
        // This is handled in src/db/encryption.ts and src/modules/ots/repo.ts
        console.log('[DB] SQLCipher not available, using application-level encryption');
    } else {
        // If SQLCipher is available, use it (for future compatibility)
        db.exec(`PRAGMA key = '${config.dbEncryptionKey.replace(/'/g, "''")}'`);
        console.log('[DB] SQLCipher enabled');
    }

    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    // Create tables if they don't exist
    const initSql = `
        CREATE TABLE IF NOT EXISTS secrets (
            id TEXT PRIMARY KEY,
            ciphertext TEXT NOT NULL,
            iv TEXT NOT NULL,
            salt TEXT NOT NULL,
            kdf TEXT NOT NULL,
            kdfParams TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            expiresAt INTEGER,
            maxReads INTEGER NOT NULL,
            remainingReads INTEGER NOT NULL,
            accessPasswordHash TEXT,
            metadata TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_secrets_expiresAt ON secrets(expiresAt);
    `;
    db.exec(initSql);

    dbInstance = drizzle(db, { schema });
    return dbInstance;
}

