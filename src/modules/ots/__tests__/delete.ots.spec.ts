import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

/**
 * Test suite for DELETE /api/v1/ots/:id endpoint.
 * Tests secret deletion functionality.
 */
describe('DELETE /api/v1/ots/:id', () => {
    beforeAll(() => {
        process.env.DB_ENCRYPTION_KEY = 'test-key-12345678901234567890123456789012';
        process.env.DB_PATH = ':memory:';
        process.env.PORT = '3001';
    });

    afterAll(() => {
        delete process.env.DB_ENCRYPTION_KEY;
        delete process.env.DB_PATH;
        delete process.env.PORT;
    });

    it('deletes a secret using delete token', async () => {
        const { buildServer } = await import('../../../server');
        const app = await buildServer();
        app.log.level = 'silent';

        try {
            // First create a secret
            const createResponse = await app.inject({
                method: 'POST',
                url: '/api/v1/ots/',
                payload: {
                    ciphertext: 'c2VjcmV0',
                    iv: 'iv01234567890',
                    salt: 'salt01234567890',
                    kdf: 'pbkdf2',
                    kdfParams: { iterations: 10000 },
                    burnAfterRead: false,
                    expiresIn: '1h',
                },
            });

            expect(createResponse.statusCode).toBe(201);
            const createBody = JSON.parse(createResponse.body);
            const secretId = createBody.id;

            // Delete the secret
            const deleteResponse = await app.inject({
                method: 'DELETE',
                url: `/api/v1/ots/${secretId}`,
            });

            expect(deleteResponse.statusCode).toBe(200);
            const deleteBody = JSON.parse(deleteResponse.body);
            expect(deleteBody.success).toBe(true);

            // Verify secret is actually deleted - try to retrieve it
            const retrieveResponse = await app.inject({
                method: 'GET',
                url: `/api/v1/ots/${secretId}`,
            });

            expect(retrieveResponse.statusCode).toBe(404);
        } finally {
            if (app && typeof app.close === 'function') {
                await app.close();
            }
        }
    });

    it('returns 404 for invalid delete token', async () => {
        const { buildServer } = await import('../../../server');
        const app = await buildServer();
        app.log.level = 'silent';

        try {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/ots/invalid-token',
            });

            expect(response.statusCode).toBe(404);
        } finally {
            if (app && typeof app.close === 'function') {
                await app.close();
            }
        }
    });
});

