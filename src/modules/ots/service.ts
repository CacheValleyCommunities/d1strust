import { ulid } from 'ulid';
import crypto from 'node:crypto';
import { config } from '../../config';
import { type CreateSecretBody, type CreateSecretResponse } from './types';
import { type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { persistSecret } from './repo';
import type * as schema from '../../db/schema';

/**
 * Clamps a value between min and max bounds.
 * 
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Clamped value
 */
function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Parses expiration time string into a timestamp.
 * 
 * Supports formats:
 * - Shorthand: "1h", "24h", "7d", "30m"
 * - ISO duration: "PT24H"
 * - Epoch timestamp: milliseconds since epoch
 * 
 * Values are clamped to the configured min/max expiry limits.
 * 
 * @param {string} [input] - Expiration string or undefined
 * @returns {number | null} Expiration timestamp in milliseconds, or null if not provided
 */
function parseExpiresIn(input?: string): number | null {
    if (!input) return null;
    // support shorthand like 1h, 7d, 30m and ISO-ish PTxxH
    const now = Date.now();
    const m = input.match(/^(?:P?T?)?(\d+)([smhd])$/i);
    if (m) {
        const n = Number(m[1]);
        const unit = m[2].toLowerCase();
        const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
        const ms = n * mult;
        return now + clamp(ms, config.limits.expiryMinMs, config.limits.expiryMaxMs);
    }
    const asNum = Number(input);
    if (!Number.isNaN(asNum) && asNum > now) {
        const delta = asNum - now;
        return now + clamp(delta, config.limits.expiryMinMs, config.limits.expiryMaxMs);
    }
    return now + clamp(24 * 60 * 60 * 1000, config.limits.expiryMinMs, config.limits.expiryMaxMs); // default 24h
}

/**
 * Creates a new one-time secret.
 * 
 * Security considerations:
 * - Server generates its own random ULID identifier (completely unrelated to encryption key)
 * - Encryption key never leaves the client and is only present in URL query parameters
 * - Server never sees or stores encryption keys
 * - All sensitive fields are encrypted at the application level before database storage
 * 
 * @param {BunSQLiteDatabase<typeof schema>} db - Database instance
 * @param {CreateSecretBody} body - Secret creation request body
 * @returns {CreateSecretResponse} Secret creation response with ID and retrieve URL
 * @throws {Error} If ID generation fails or URL construction fails
 */
export function createSecret(db: BunSQLiteDatabase<typeof schema>, body: CreateSecretBody): CreateSecretResponse {
    // Server generates its own random identifier - completely unrelated to encryption key
    // Encryption key never leaves the client, only exists in URL query params
    const id = ulid();

    // Ensure ID is valid
    if (!id || id.length === 0) {
        throw new Error('Failed to generate secret ID');
    }

    const maxReads = body.burnAfterRead ? 1 : clamp(body.maxReads ?? 1, 1, config.limits.maxReadsMax);
    const expiresAt = parseExpiresIn(body.expiresIn);

    const createdAt = Date.now();

    persistSecret(db, {
        id,
        ciphertext: body.ciphertext,
        iv: body.iv,
        salt: body.salt,
        kdf: body.kdf,
        kdfParams: body.kdfParams,
        createdAt,
        expiresAt,
        maxReads,
        remainingReads: maxReads,
        accessPasswordHash: body.accessPasswordHash ?? null,
        metadata: body.clientMeta ?? null,
    });

    // Construct base URL - use baseUrl if configured, otherwise use empty string for relative URLs
    const base = config.baseUrl ? config.baseUrl.replace(/\/$/, '') : '';
    // Ensure URL always includes the ID
    const retrieveUrl = base ? `${base}/s/${id}` : `/s/${id}`;

    // Double-check that the URL contains the ID
    if (!retrieveUrl.includes(id)) {
        throw new Error(`URL construction failed: URL does not contain ID. URL: ${retrieveUrl}, ID: ${id}`);
    }

    return {
        id,
        expiresAt,
        remainingReads: maxReads,
        urls: {
            retrieve: retrieveUrl, // URL uses server ID, client adds ?key={encryptionKey} in query param
        },
    };
}

