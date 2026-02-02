import path from 'path';
import fs from 'fs-extra';
import send from 'koa-send';
import { TMP_DIR, PLAYGROUND_DIST_DIR } from '../config/constants.js';
import { getLoadingHtml, getErrorHtml } from '../tools/templates.js';
import { getDb } from '../db/index.js';
import { GameStatsModel } from '../models/GameStatsModel.js';

export const PreviewController = {
    /**
     * Serve the main playground app
     */
    async playground(ctx) {
        if (!fs.existsSync(path.join(PLAYGROUND_DIST_DIR, 'index.html'))) {
            ctx.status = 404;
            ctx.body = 'Playground build not found. Please run "npm run build" in the playground directory and move dist to preview/playground-dist.';
            return;
        }
        await send(ctx, 'index.html', { root: PLAYGROUND_DIST_DIR });
    },

    /**
     * Redirect /Preview?id=... to /deployments/:id/
     */
    async entry(ctx) {
        const id = ctx.query.id;
        if (!id) {
            ctx.status = 400;
            ctx.body = 'Missing id parameter';
            return;
        }
        ctx.redirect(`/deployments/${id}/`);
    },



    /**
     * Serve static files or loading page
     */
    async serve(ctx, next) {
        const match = ctx.path.match(/^\/deployments\/([^/]+)(.*)/);
        if (!match) {
            return next();
        }

        const id = match[1];
        const subPath = match[2];

        // Redirect if no trailing slash for root
        if (!subPath) {
            ctx.redirect(ctx.path + '/');
            return;
        }

        let cleanPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
        if (cleanPath === '') cleanPath = 'index.html';

        // Track game access if this is the initial page load with shared_by parameter
        if (cleanPath === 'index.html' && ctx.query.shared_by) {
            try {
                const sharedBy = ctx.query.shared_by;
                await GameStatsModel.trackClick(id, sharedBy);
                console.log(`[PreviewController] Tracked deployment access: gameId=${id}, sharedBy=${sharedBy}`);
            } catch (error) {
                console.error('[PreviewController] Failed to track deployment access:', error);
                // Don't block the request if tracking fails
            }
        }
        const db = await getDb();
        const state = await db.get('SELECT * FROM build_record WHERE id = ?', id);
        if (!state) {
            ctx.status = 404;
            ctx.body = 'Deployment not found';
            return;
        }
        if(state.is_processed !== 1){
            ctx.type = 'html';
            ctx.body = getLoadingHtml(state.status);
            return;
        }

        // 4. Ready -> Serve Files
        const distDir = path.join(TMP_DIR, id, 'dist');
        
        // Special handling for index.html to fix absolute paths
        if (cleanPath === 'index.html') {
            try {
                const indexPath = path.join(distDir, 'index.html');
                if (await fs.pathExists(indexPath)) {
                    let content = await fs.readFile(indexPath, 'utf-8');
                    // Replace absolute paths with relative paths
                    // src="/assets/..." -> src="./assets/..."
                    // href="/assets/..." -> href="./assets/..."
                    content = content.replace(/(src|href)="\//g, '$1="./');
                    
                    ctx.type = 'html';
                    ctx.body = content;
                    return;
                }
            } catch (err) {
                console.error('Error serving index.html:', err);
            }
        }

        try {
            await send(ctx, cleanPath, {
                root: distDir,
                index: 'index.html',
                maxage: 1000 * 60 * 60 * 24 * 1, // 1 day cache for hashed assets
                immutable: true // if filenames are hashed
            });
        } catch (err) {
            if (err.status !== 404) throw err;
            ctx.status = 404;
            ctx.body = 'File not found';
        }
    }
};
