import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { secrets } from '../../db/schema';
import type * as schema from '../../db/schema';
import { encryptDbValue, decryptDbValue } from '../../db/encryption';

/**
 * Input data for persisting a secret to the database.
 * All sensitive fields will be encrypted before storage.
 */
export interface PersistSecretInput {
    id: string; // Server-generated identifier (unrelated to encryption key)
    ciphertext: string;
    iv: string;
    salt: string;
    kdf: string;
    kdfParams: unknown;
    createdAt: number;
    expiresAt: number | null;
    maxReads: number;
    remainingReads: number;
    accessPasswordHash?: string | null;
    metadata?: unknown | null;
}

/**
 * Persists a secret to the database with application-level encryption.
 * 
 * Encrypts sensitive fields (ciphertext, iv, salt, accessPasswordHash, metadata)
 * before storing them in the database.
 * 
 * @param {BunSQLiteDatabase<typeof schema>} db - Database instance
 * @param {PersistSecretInput} input - Secret data to persist
 * @returns {{ id: string }} Object containing the persisted secret ID
 */
export function persistSecret(db: BunSQLiteDatabase<typeof schema>, input: PersistSecretInput) {
    // Encrypt sensitive fields before storing
    const encryptedCiphertext = encryptDbValue(input.ciphertext);
    const encryptedIv = encryptDbValue(input.iv);
    const encryptedSalt = encryptDbValue(input.salt);
    const encryptedPasswordHash = input.accessPasswordHash ? encryptDbValue(input.accessPasswordHash) : null;
    const encryptedMetadata = input.metadata ? encryptDbValue(JSON.stringify(input.metadata)) : null;

    db.insert(secrets).values({
        id: input.id,
        ciphertext: encryptedCiphertext,
        iv: encryptedIv,
        salt: encryptedSalt,
        kdf: input.kdf,
        kdfParams: JSON.stringify(input.kdfParams),
        createdAt: input.createdAt,
        expiresAt: input.expiresAt ?? null,
        maxReads: input.maxReads,
        remainingReads: input.remainingReads,
        accessPasswordHash: encryptedPasswordHash,
        metadata: encryptedMetadata,
    }).run();

    return { id: input.id };
}

/**
 * Finds a secret by its server-generated ID and decrypts sensitive fields.
 * 
 * @param {BunSQLiteDatabase<typeof schema>} db - Database instance
 * @param {string} id - Server-generated secret identifier
 * @returns {object | null} Decrypted secret data, or null if not found or decryption fails
 */
export function findSecretById(db: BunSQLiteDatabase<typeof schema>, id: string) {
    const rows = db.select().from(secrets).where(eq(secrets.id, id)).all();
    if (!rows[0]) return null;

    const row = rows[0];

    // Decrypt sensitive fields when reading
    // Wrap in try-catch to handle decryption errors gracefully
    try {
        return {
            ...row,
            ciphertext: decryptDbValue(row.ciphertext),
            iv: decryptDbValue(row.iv),
            salt: decryptDbValue(row.salt),
            accessPasswordHash: row.accessPasswordHash ? decryptDbValue(row.accessPasswordHash) : null,
            metadata: row.metadata ? (row.metadata ? JSON.parse(decryptDbValue(row.metadata)) : null) : null,
        };
    } catch (error) {
        // If decryption fails, log error and return null (secret not found)
        // This prevents exposing corrupted/invalid data to the client
        console.error('[Repo] Failed to decrypt secret:', id, error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Permanently deletes a secret by its server-generated ID.
 * 
 * Performs verification to ensure deletion succeeded.
 * 
 * @param {BunSQLiteDatabase<typeof schema>} db - Database instance
 * @param {string} id - Server-generated secret identifier
 * @returns {boolean} True if deletion succeeded, false if secret doesn't exist or deletion failed
 */
export function deleteSecretById(db: BunSQLiteDatabase<typeof schema>, id: string): boolean {
    // Delete secret by server-generated ID (encryption key never seen by server)
    try {
        // First check if secret exists
        const existing = db.select().from(secrets).where(eq(secrets.id, id)).all();
        if (existing.length === 0) {
            return false; // Secret doesn't exist
        }

        // Delete the secret
        db.delete(secrets).where(eq(secrets.id, id)).run();

        // Verify deletion succeeded
        const remaining = db.select().from(secrets).where(eq(secrets.id, id)).all();
        return remaining.length === 0;
    } catch {
        return false;
    }
}

