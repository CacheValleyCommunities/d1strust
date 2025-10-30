import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

/**
 * Test suite for POST /api/v1/ots/ endpoint.
 * Tests secret creation functionality.
 */
describe('POST /api/v1/ots/', () => {
    beforeAll(() => {
        // Set test environment variables before importing server
        process.env.DB_ENCRYPTION_KEY = 'test-key-12345678901234567890123456789012';
        process.env.DB_PATH = ':memory:';
        process.env.PORT = '3001'; // Use a test port (tests use inject() so this won't actually bind)
    });

    afterAll(() => {
        // Clean up environment variables
        delete process.env.DB_ENCRYPTION_KEY;
        delete process.env.DB_PATH;
        delete process.env.PORT;
    });

    it('creates a secret and returns tokens', async () => {
        const { buildServer } = await import('../../../server');
        const app = await buildServer();

        // Disable logging for tests
        app.log.level = 'silent';

        try {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/ots/',
                payload: {
                    ciphertext: 'c2VjcmV0',
                    iv: 'iv01234567890',
                    salt: 'salt01234567890',
                    kdf: 'argon2id',
                    kdfParams: { v: 1 },
                    burnAfterRead: true,
                    expiresIn: '1h',
                },
            });

            expect(response.statusCode).toBe(201);
            const body = JSON.parse(response.body);
            expect(body.id).toBeDefined();
            expect(body.urls).toBeDefined();
            expect(body.urls.retrieve).toBeDefined();
            expect(body.urls.retrieve).toContain('/s/');
            expect(body.urls.retrieve).toContain(body.id);
            expect(body.remainingReads).toBe(1);
        } finally {
            if (app && typeof app.close === 'function') {
                await app.close();
            }
        }
    });
});

