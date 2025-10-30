import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Environment variable schema validation.
 * Ensures all required environment variables are present and valid.
 */
const EnvSchema = z.object({
    PORT: z.string().transform((v) => Number(v)).pipe(z.number().int().min(1).max(65535)).default('3000' as unknown as number),
    DB_PATH: z.string().default('./data/ots.db'),
    DB_ENCRYPTION_KEY: z.string().min(8),
    BASE_URL: z.string().url().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

/**
 * Application configuration object.
 * Contains validated environment variables and application limits.
 */
export const config = {
    port: parsed.data.PORT as unknown as number,
    dbPath: parsed.data.DB_PATH,
    dbEncryptionKey: parsed.data.DB_ENCRYPTION_KEY,
    baseUrl: parsed.data.BASE_URL,
    limits: {
        bodyBytes: 64 * 1024,
        maxReadsMax: 100,
        expiryMaxMs: 30 * 24 * 60 * 60 * 1000,
        expiryMinMs: 60 * 1000,
    },
};

