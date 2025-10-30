import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';
import { config } from '../config';

/**
 * Database-level encryption for at-rest protection.
 * Since Bun's SQLite doesn't support SQLCipher, we encrypt sensitive fields
 * before storing them in the database.
 */

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const DB_ENCRYPTION_PREFIX = 'DBENC:'; // Prefix to mark database-encrypted values

/**
 * Derives a key from DB_ENCRYPTION_KEY using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypts a string value for database storage
 */
export function encryptDbValue(value: string): string {
    if (!value) return value;

    // If already encrypted, return as-is (avoid double encryption)
    if (isEncrypted(value)) {
        return value;
    }

    // Generate a random salt for this encryption
    const salt = randomBytes(SALT_LENGTH);

    // Derive key from DB_ENCRYPTION_KEY
    const key = deriveKey(config.dbEncryptionKey, salt);

    // Generate random IV
    const iv = randomBytes(IV_LENGTH);

    // Encrypt
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
    ]);

    // Format: prefix + salt:iv:encrypted (all base64)
    const result = Buffer.concat([
        salt,
        iv,
        encrypted,
    ]);

    return DB_ENCRYPTION_PREFIX + result.toString('base64');
}

/**
 * Checks if a value is already database-encrypted (has the prefix marker)
 */
function isEncrypted(value: string): boolean {
    if (!value) return false;
    // Database-encrypted values have a prefix marker
    return value.startsWith(DB_ENCRYPTION_PREFIX);
}

/**
 * Decrypts a string value from database storage
 */
export function decryptDbValue(encryptedValue: string): string {
    if (!encryptedValue) return encryptedValue;

    // If it doesn't have the encryption prefix, return as-is (for migration compatibility)
    // This handles old records created before database encryption was added
    if (!isEncrypted(encryptedValue)) {
        return encryptedValue;
    }

    try {
        // Remove prefix and parse: salt:iv:encrypted (all base64)
        const base64Data = encryptedValue.substring(DB_ENCRYPTION_PREFIX.length);
        const data = Buffer.from(base64Data, 'base64');

        // Validate minimum length
        if (data.length < SALT_LENGTH + IV_LENGTH + 1) {
            console.warn('[DB Encryption] Encrypted value too short, returning as-is');
            return encryptedValue; // Too short, probably not encrypted correctly
        }

        // Extract components
        const salt = data.subarray(0, SALT_LENGTH);
        const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH);

        // Derive key using the same DB_ENCRYPTION_KEY that was used for encryption
        const key = deriveKey(config.dbEncryptionKey, salt);

        // Decrypt
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);

        return decrypted.toString('utf8');
    } catch (error) {
        // If decryption fails for a DBENC-prefixed value, this is a serious error
        // Common causes:
        // 1. DB_ENCRYPTION_KEY changed (data encrypted with different key)
        // 2. Data corruption
        // 3. Invalid encryption format
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[DB Encryption] Decryption failed for DBENC-prefixed value');
        console.error('[DB Encryption] Error:', errorMsg);
        console.error('[DB Encryption] Value length:', encryptedValue.length);
        console.error('[DB Encryption] This usually means:');
        console.error('[DB Encryption]   - DB_ENCRYPTION_KEY changed or doesn\'t match');
        console.error('[DB Encryption]   - Data was encrypted with a different key');
        console.error('[DB Encryption]   - Database corruption');
        // Throw error so caller can handle it appropriately
        throw new Error(`Database decryption failed: ${errorMsg}. Check that DB_ENCRYPTION_KEY matches the key used to encrypt the data.`);
    }
}

/**
 * Checks if SQLCipher is available (for future compatibility)
 */
export function checkSqlCipherAvailable(db: any): boolean {
    try {
        // Try to use sqlcipher_export which only exists in SQLCipher
        db.exec("SELECT sqlcipher_export('test')");
        return true;
    } catch {
        return false;
    }
}

