import { AppModel } from '../models/AppModel.js';

export const AppController = {
    async save(ctx) {
        const { id, files } = ctx.request.body;
        if (!id || !files) {
            ctx.status = 400;
            ctx.body = { error: 'Missing id or files' };
            return;
        }

        try {
            await AppModel.createOrUpdate(id, files);
            ctx.body = { success: true, id };
        } catch (err) {
            console.error('[AppController] Save error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    async get(ctx) {
        const id = ctx.query.id;
        console.log('id', ctx.query);
        try {
            const app = await AppModel.get(id);
            if (!app) {
                ctx.status = 404;
                ctx.body = { error: 'App not found' };
                return;
            }
            ctx.body = { success: true, data: app };
        } catch (err) {
            console.error('[AppController] Get error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    }
};
