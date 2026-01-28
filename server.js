import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import serve from 'koa-static';
import fs from 'fs-extra';
import { TMP_DIR, PORT, PLAYGROUND_DIST_DIR } from './src/config/constants.js';
import router from './src/routes/index.js';
import { PreviewController } from './src/controllers/PreviewController.js';
import { startWorker } from './src/worker/index.js';

const app = new Koa();

// Ensure Temp Directory
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

app.use(bodyParser({
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb'
}));
app.use(serve(PLAYGROUND_DIST_DIR, { defer: true }));

app.use(router.routes()).use(router.allowedMethods());

app.use(PreviewController.serve);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Temp Directory: ${TMP_DIR}`);
});
