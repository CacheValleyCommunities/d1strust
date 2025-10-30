import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { config } from './config';
import registerOtsPostRoute from './modules/ots/route.post';
import registerOtsGetRoute from './modules/ots/route.get';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

/**
 * Builds and configures the Fastify server instance.
 * 
 * Sets up:
 * - Custom logger that strips query parameters to prevent key leakage
 * - Database initialization
 * - Static file serving for public HTML files
 * - Rate limiting
 * - Swagger/OpenAPI documentation
 * - OTS API routes
 * - Health check endpoint
 * 
 * @returns {Promise<FastifyInstance>} Configured Fastify server instance
 */
export async function buildServer() {
    const app = Fastify({
        logger: {
            level: 'info',
            serializers: {
                req: (req) => {
                    // Remove query parameters from logs to prevent key leakage
                    const url = new URL(req.url, `http://${req.headers.host}`);
                    const cleanUrl = url.pathname;
                    return {
                        method: req.method,
                        url: cleanUrl, // Only log path, not query params
                        remoteAddress: req.socket.remoteAddress,
                    };
                },
            },
        },
        bodyLimit: config.limits.bodyBytes
    });

    // Initialize database
    const { createDb } = await import('./db');
    createDb();

    // Serve HTML files without .html extension (register before static plugin to take precedence)
    app.get('/', async (req, reply) => {
        const html = readFileSync(path.join(publicDir, 'index.html'), 'utf-8');
        return reply.type('text/html').send(html);
    });

    app.get('/redeem', async (req, reply) => {
        const html = readFileSync(path.join(publicDir, 'redeem.html'), 'utf-8');
        return reply.type('text/html').send(html);
    });

    // Explicit routes for static assets to ensure they're always served
    app.get('/logo.png', async (req, reply) => {
        const filePath = path.join(publicDir, 'logo.png');
        if (existsSync(filePath)) {
            const file = readFileSync(filePath);
            return reply.type('image/png').send(file);
        }
        return reply.code(404).send({ error: 'Not found' });
    });

    app.get('/social.png', async (req, reply) => {
        const filePath = path.join(publicDir, 'social.png');
        if (existsSync(filePath)) {
            const file = readFileSync(filePath);
            return reply.type('image/png').send(file);
        }
        return reply.code(404).send({ error: 'Not found' });
    });

    await app.register(rateLimit);
    await app.register(swagger, {
        openapi: {
            openapi: '3.0.0',
            info: { title: 'd1strust OTS API', version: '0.1.0' },
            tags: [{ name: 'OTS' }],
        },
    });
    await app.register(swaggerUI, { routePrefix: '/docs' });

    await registerOtsPostRoute(app);
    await registerOtsGetRoute(app);

    // Health check endpoint for monitoring and Docker health checks
    app.get('/health', async () => ({ status: 'ok' }));

    // Serve static files (images, etc.) - register after API routes so they take precedence
    // Static files will be served for any path that doesn't match above routes
    const staticPlugin = await import('@fastify/static');
    await app.register(staticPlugin.default, {
        root: publicDir,
        prefix: '/',
    });

    return app;
}

// Only start the server if this file is run directly (not imported as a module)
if (import.meta.main) {
    buildServer()
        .then((app) => app.listen({ port: config.port, host: '0.0.0.0' }))
        .catch((err) => {
            // eslint-disable-next-line no-console
            console.error(err);
            process.exit(1);
        });
}

