import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import serve from 'koa-static';
import fs from 'fs-extra';
import path from 'path';
import { TMP_DIR, PORT, PLAYGROUND_DIST_DIR } from './src/config/constants.js';
import router from './src/routes/index.js';
import { PreviewController } from './src/controllers/PreviewController.js';
import { startWorker } from './src/worker/index.js';

const app = new Koa();

// 内部服务认证 token（与 auto_proxy 保持一致）
const INTERNAL_SERVICE_TOKEN = 'internal-service-proxy-2024-secret-token-xyz';

// Ensure Temp Directory  Directory
fs.ensureDirSync(TMP_DIR);

// Start Build Worker (async, non-blocking)
startWorker().catch(err => {
    console.error('[Server] Failed to start worker:', err);
});

// Middleware
app.use(cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// 内部服务认证中间件：检查请求来源，如果来自 localhost:1234 或有内部服务 token 则放行
app.use(async (ctx, next) => {
    const authHeader = ctx.headers.authorization;
    const referer = ctx.headers.referer || '';
    const origin = ctx.headers.origin || '';

    // 检查是否来自 localhost:1234 (auto_proxy)
    const isFromProxy = referer.includes('localhost:1234') ||
                        origin.includes('localhost:1234') ||
                        referer.includes('127.0.0.1:1234') ||
                        origin.includes('127.0.0.1:1234');

    // 检查是否有内部服务 token
    const hasInternalToken = authHeader === `Bearer ${INTERNAL_SERVICE_TOKEN}`;

    // 如果来自 proxy 或有内部 token，标记为已认证的内部请求
    if (isFromProxy || hasInternalToken) {
        ctx.state.isInternalService = true;
        console.log('[Auth] Internal service request authenticated from proxy');
    }

    await next();
});

app.use(bodyParser({
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb'
}));

// Serve cover images from /covers path (PNG and SVG)
app.use(async (ctx, next) => {
    if (ctx.path.includes('/covers/')) {
        if (ctx.path.endsWith('.png')) {
            const coverPath = path.join(TMP_DIR, ctx.path);
            if (await fs.pathExists(coverPath)) {
                ctx.type = 'image/png';
                ctx.body = fs.createReadStream(coverPath);
                return;
            }
        } else if (ctx.path.endsWith('.svg')) {
            const coverPath = path.join(TMP_DIR, ctx.path);
            if (await fs.pathExists(coverPath)) {
                ctx.type = 'image/svg+xml';
                ctx.body = fs.createReadStream(coverPath);
                return;
            }
        }
    }
    await next();
});

app.use(serve(PLAYGROUND_DIST_DIR, { defer: true }));

app.use(router.routes()).use(router.allowedMethods());

app.use(PreviewController.serve);

const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
server.timeout = 0;           // 所有接口不超时
server.keepAliveTimeout = 65000;
