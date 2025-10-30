import { z } from 'zod';

/**
 * Request body schema for creating a one-time secret.
 * 
 * Security note: Server generates its own random ID. Encryption key never sent to server.
 */
export const BodySchema = z.object({
    ciphertext: z.string().min(1).max(100_000),
    iv: z.string().min(8).max(256),
    salt: z.string().min(8).max(256),
    kdf: z.enum(['argon2id', 'pbkdf2', 'scrypt']),
    kdfParams: z.union([z.record(z.any()), z.string()]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)),
    burnAfterRead: z.boolean().optional(),
    maxReads: z.number().int().min(1).max(100).optional(),
    expiresIn: z.string().optional(),
    accessPasswordHash: z.string().max(512).optional(),
    clientMeta: z.record(z.any()).optional(),
});

/** Type inference for CreateSecretBody */
export type CreateSecretBody = z.infer<typeof BodySchema>;

/**
 * Response schema for secret creation.
 * 
 * Note: The encryption key is NOT returned by the server. The client constructs
 * the full URL by appending ?key={encryptionKey} to the retrieve URL.
 */
export const ResponseSchema = z.object({
    /** Server-generated random identifier (unrelated to encryption key) */
    id: z.string(),
    expiresAt: z.number().nullable(),
    remainingReads: z.number(),
    urls: z.object({
        retrieve: z.string(), // URL will be /s/{id}?key={encryptionKey} - key never sent to server
    }),
});

export type CreateSecretResponse = z.infer<typeof ResponseSchema>;

