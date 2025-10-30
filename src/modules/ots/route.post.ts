import type { FastifyInstance } from 'fastify';
import { BodySchema, ResponseSchema } from './types';
import { createSecret } from './service';
import { createDb } from '../../db';

/**
 * Registers the POST /api/v1/ots/ route for creating one-time secrets.
 * 
 * This endpoint accepts client-side encrypted data and stores it with
 * a server-generated identifier. The encryption key is never sent to or
 * stored by the server - it only exists in the URL query parameter.
 * 
 * @param {FastifyInstance} app - Fastify server instance
 */
export default async function registerOtsPostRoute(app: FastifyInstance) {
    app.post('/api/v1/ots/', {
        schema: {
            summary: 'Create one-time secret',
            description: 'Create a client-side encrypted one-time secret with optional burn-after-read and access password',
            tags: ['OTS'],
            body: {
                type: 'object',
                properties: {
                    ciphertext: { type: 'string', description: 'Base64 encoded encrypted data', minLength: 1, maxLength: 100000 },
                    iv: { type: 'string', description: 'Initialization vector', minLength: 8, maxLength: 256 },
                    salt: { type: 'string', description: 'Cryptographic salt', minLength: 8, maxLength: 256 },
                    kdf: { type: 'string', enum: ['argon2id', 'pbkdf2', 'scrypt'], description: 'Key derivation function' },
                    burnAfterRead: { type: 'boolean', description: 'Destroy secret after first read (sets maxReads=1)' },
                    maxReads: { type: 'number', description: 'Maximum number of times secret can be read (1-100)', minimum: 1, maximum: 100 },
                    expiresIn: { type: 'string', description: 'Expiration duration (e.g., "1h", "7d", "PT24H") or epoch ms' },
                    accessPasswordHash: { type: 'string', description: 'Optional access password hash (argon2id)', maxLength: 512 },
                },
            },
            response: {
                201: {
                    description: 'Secret created successfully',
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Server-generated ULID identifier' },
                        expiresAt: { type: 'number', nullable: true, description: 'Expiration timestamp (epoch ms)' },
                        remainingReads: { type: 'number', description: 'Number of reads remaining' },
                        urls: {
                            type: 'object',
                            properties: {
                                retrieve: { type: 'string', description: 'URL to retrieve the secret (client adds ?key=encryptionKey)' },
                            },
                        },
                    },
                },
                400: {
                    description: 'Validation error',
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        details: { type: 'object' },
                    },
                },
            },
        },
        config: {
            rateLimit: { max: 20, timeWindow: '1 minute' },
        },
    }, async (req, reply) => {
        // Handle kdfParams if it's an object - stringify it
        const body = req.body as any;
        if (body.kdfParams && typeof body.kdfParams === 'object' && !Array.isArray(body.kdfParams)) {
            body.kdfParams = JSON.stringify(body.kdfParams);
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
        }
        const db = createDb();
        const result = createSecret(db, parsed.data);
        return reply.status(201).send(ResponseSchema.parse(result));
    });
}

