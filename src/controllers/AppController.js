import { AppModel } from '../models/AppModel.js';
import { getDb } from '../db/index.js';

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
    },
    async buildRecord(ctx) {
        try {
            const db = await getDb();
            const records = await db.all(`
                SELECT
                    b.id,
                    b.file_name,
                    b.create_time,
                    b.is_processed,
                    b.cover_url,
                    b.drive_id,
                    p.user_id,
                    u.username
                FROM build_record b
                INNER JOIN (
                    SELECT file_name, MAX(create_time) as max_time
                    FROM build_record
                    WHERE id IS NOT NULL AND id != ""
                    GROUP BY file_name
                ) latest ON b.file_name = latest.file_name AND b.create_time = latest.max_time
                LEFT JOIN projects p ON b.drive_id = p.id
                LEFT JOIN users u ON p.user_id = u.id
                WHERE b.id IS NOT NULL AND b.id != ""
                ORDER BY b.create_time DESC
            `);

            ctx.body = { success: true, data: records };
        } catch (err) {
            console.error('[AppController] buildRecord error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },
    async chatRecord(ctx) {
        try {
            const db = await getDb();
            const records = await db.all('SELECT * FROM chat_record WHERE uuid IS NOT NULL AND uuid != "" ORDER BY update_time DESC, create_time DESC');
            ctx.body = { success: true, data: records };
        } catch (err) {
            console.error('[AppController] chatRecord error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    }
};
