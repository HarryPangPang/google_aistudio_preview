import { getDb } from '../db/index.js';

export const DeploymentModel = {
    async create(id, files, appId = null) {
        const db = await getDb();
        const now = Date.now();
        await db.run(
            `INSERT INTO deployments (id, app_id, files, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
            id, appId, JSON.stringify(files), 'pending', now, now
        );
        return { id, status: 'pending' };
    },

    async get(id) {
        const db = await getDb();
        const row = await db.get(`SELECT * FROM deployments WHERE id = ?`, id);
        if (!row) return null;
        return {
            ...row,
            files: JSON.parse(row.files)
        };
    },

    // Get basic info without heavy files blob
    async getStatus(id) {
        const db = await getDb();
        return await db.get(`SELECT id, status, url, error, created_at, updated_at FROM deployments WHERE id = ?`, id);
    },

    async updateStatus(id, status, updates = {}) {
        const db = await getDb();
        const now = Date.now();
        const setClause = [];
        const params = [];

        setClause.push('status = ?');
        params.push(status);

        setClause.push('updated_at = ?');
        params.push(now);

        if (updates.url) {
            setClause.push('url = ?');
            params.push(updates.url);
        }
        if (updates.error) {
            setClause.push('error = ?');
            params.push(updates.error);
        }

        params.push(id); // For WHERE clause

        await db.run(`UPDATE deployments SET ${setClause.join(', ')} WHERE id = ?`, ...params);
    },

    async getPendingTask() {
        const db = await getDb();
        // Simple queue: get oldest pending task
        const row = await db.get(`SELECT * FROM deployments WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`);
        if (!row) return null;
        return {
            ...row,
            files: JSON.parse(row.files)
        };
    }
};
