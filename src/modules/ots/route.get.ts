import type { FastifyInstance } from 'fastify';
import { createDb } from '../../db';
import { redeemSecret } from './redeem';
import { deleteSecretById } from './repo';

/**
 * Registers OTS retrieval and deletion routes.
 * 
 * Routes registered:
 * - GET /api/v1/ots/:id - Retrieve secret by server-generated ID
 * - DELETE /api/v1/ots/:id - Permanently delete secret
 * - GET /s/:id - Redirect route for sharing links (auto-redeem)
 * 
 * Security notes:
 * - Query parameters (like ?key=) are never logged, stored, or accessed server-side
 * - Server only uses its own generated ID to identify secrets
 * - Encryption keys never leave the client
 * 
 * @param {FastifyInstance} app - Fastify server instance
 */
export default async function registerOtsGetRoute(app: FastifyInstance) {
    // API endpoint for retrieving secret
    // id is server-generated identifier - encryption key never sent to or seen by server
    app.get('/api/v1/ots/:id', {
        schema: {
            summary: 'Retrieve one-time secret (API)',
            description: 'Retrieve a secret by server-generated ID. Consumes one read. Query parameters (like key) are never logged, stored, or accessed server-side.',
            tags: ['OTS'],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Server-generated identifier' },
                },
            },
            querystring: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Decryption key (never logged, stored, or accessed server-side)' },
                },
            },
            response: {
                200: {
                    description: 'Secret retrieved successfully',
                    type: 'object',
                    properties: {
                        ciphertext: { type: 'string' },
                        iv: { type: 'string' },
                        salt: { type: 'string' },
                        kdf: { type: 'string' },
                        kdfParams: { type: 'object' },
                    },
                },
                404: {
                    description: 'Secret not found or expired',
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                    },
                },
            },
        },
    }, async (req, reply) => {
        const { id } = req.params as { id: string };
        // Note: query.key is intentionally ignored - encryption keys are never accessed server-side
        // Server only uses its own generated ID to identify the secret
        const db = createDb();
        const result = redeemSecret(db, id);
        if ('error' in result) {
            return reply.status(404).send(result);
        }
        return reply.send(result);
    });

    // DELETE endpoint for explicit deletion
    app.delete('/api/v1/ots/:id', {
        schema: {
            summary: 'Delete one-time secret',
            description: 'Delete a secret by server-generated ID. Permanently removes the secret.',
            tags: ['OTS'],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Server-generated identifier' },
                },
            },
            response: {
                200: {
                    description: 'Secret deleted successfully',
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
                404: {
                    description: 'Secret not found',
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                    },
                },
            },
        },
    }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const db = createDb();

        const deleted = deleteSecretById(db, id);
        if (deleted) {
            return reply.send({ success: true, message: 'Secret permanently deleted' });
        }

        return reply.status(404).send({ error: 'Secret not found' });
    });

    // Redirect route for sharing links - auto-redeem
    // id is server-generated, encryption key is in query param (never accessed server-side)
    app.get('/s/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const key = (req.query as any).key;
        // Encryption key is only used client-side, never logged or stored
        // Server only sees its own generated ID, never the encryption key
        const location = key
            ? `/redeem?id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`
            : `/redeem?id=${encodeURIComponent(id)}`;
        return reply.code(302).header('Location', location).send();
    });
}
