import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { secrets } from '../../db/schema';
import type * as schema from '../../db/schema';
import { findSecretById } from './repo';

/**
 * Redeems a one-time secret by its server-generated ID.
 * 
 * Performs the following checks:
 * - Verifies secret exists
 * - Checks expiration
 * - Validates remaining reads
 * 
 * If this is the last read (or burn-after-read), the secret is permanently deleted
 * BEFORE returning data to ensure it's removed from the database.
 * 
 * Security notes:
 * - Uses server-generated ID only (encryption key never accessed server-side)
 * - Encryption key only exists in URL query parameters, never logged or stored
 * 
 * @param {BunSQLiteDatabase<typeof schema>} db - Database instance
 * @param {string} id - Server-generated secret identifier
 * @returns {object | { error: string }} Secret data if successful, or error object if failed
 */
export function redeemSecret(db: BunSQLiteDatabase<typeof schema>, id: string) {
    // id is server-generated identifier - encryption key never sent to server
    // Encryption key only exists in URL query params, never accessed server-side
    const secret = findSecretById(db, id);

    if (!secret) {
        return { error: 'Secret not found' };
    }

    // Check expiration
    if (secret.expiresAt && secret.expiresAt < Date.now()) {
        return { error: 'Secret expired' };
    }

    // Check reads remaining
    if (secret.remainingReads <= 0) {
        return { error: 'Secret already consumed' };
    }

    // Parse kdfParams with fallback to defaults
    let kdfParams: any;
    try {
        kdfParams = JSON.parse(secret.kdfParams);
        // Ensure required fields exist
        if (typeof kdfParams !== 'object' || kdfParams === null) {
            kdfParams = {};
        }
    } catch {
        // If parsing fails, use empty object
        kdfParams = {};
    }

    // Ensure default values for kdfParams
    if (!('iterations' in kdfParams)) {
        kdfParams.iterations = 10000;
    }
    if (!('isPasswordProtected' in kdfParams)) {
        kdfParams.isPasswordProtected = false;
    }

    // Store the secret data before deletion
    const secretData = {
        ciphertext: secret.ciphertext,
        iv: secret.iv,
        salt: secret.salt,
        kdf: secret.kdf,
        kdfParams,
    };

    // If this was the last read (or burn-after-read), delete immediately
    // Delete happens BEFORE returning data to ensure it's removed from database
    if (secret.remainingReads <= 1 || secret.maxReads === 1) {
        // Delete the secret
        db.delete(secrets).where(eq(secrets.id, secret.id)).run();

        // Verify deletion succeeded
        const verifyDeleted = db.select().from(secrets).where(eq(secrets.id, secret.id)).all();
        if (verifyDeleted.length > 0) {
            // If deletion failed, try again
            db.delete(secrets).where(eq(secrets.id, secret.id)).run();
        }
    } else {
        // Decrement remaining reads
        db.update(secrets).set({ remainingReads: secret.remainingReads - 1 }).where(eq(secrets.id, secret.id)).run();
    }

    return secretData;
}

