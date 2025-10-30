import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Database schema for one-time secrets.
 * 
 * All sensitive fields (ciphertext, iv, salt, accessPasswordHash, metadata) are
 * encrypted at the application level before storage using AES-256-CBC encryption.
 * 
 * Security notes:
 * - `id` is a server-generated ULID, completely unrelated to the encryption key
 * - Encryption keys never leave the client and are only present in URL query parameters
 * - The server never sees or stores encryption keys
 */
export const secrets = sqliteTable('secrets', {
    /** Server-generated ULID identifier (unrelated to encryption key) */
    id: text('id').primaryKey(),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    salt: text('salt').notNull(),
    kdf: text('kdf').notNull(),
    kdfParams: text('kdfParams').notNull(),
    createdAt: integer('createdAt', { mode: 'number' }).notNull(),
    expiresAt: integer('expiresAt', { mode: 'number' }),
    maxReads: integer('maxReads').notNull(),
    remainingReads: integer('remainingReads').notNull(),
    accessPasswordHash: text('accessPasswordHash'),
    metadata: text('metadata'),
});

