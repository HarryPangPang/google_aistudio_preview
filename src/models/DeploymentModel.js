import { getDb } from '../db/index.js';

export const DeploymentModel = {
    async create(id, files, appId = null) {
        const db = getDb();
        const now = Date.now();
        const stmt = db.prepare(`INSERT INTO deployments (id, app_id, files, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
        stmt.run(id, appId, JSON.stringify(files), 'pending', now, now);
        return { id, status: 'pending' };
    },

    async get(id) {
        const db = getDb();
        const stmt = db.prepare(`SELECT * FROM deployments WHERE id = ?`);
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            files: JSON.parse(row.files)
        };
    },

    // Get basic info without heavy files blob
    async getStatus(id) {
        const db = getDb();
        const stmt = db.prepare(`SELECT id, status, url, error, created_at, updated_at FROM deployments WHERE id = ?`);
        return stmt.get(id);
    },

    async updateStatus(id, status, updates = {}) {
        const db = getDb();
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

        const stmt = db.prepare(`UPDATE deployments SET ${setClause.join(', ')} WHERE id = ?`);
        stmt.run(...params);
    },

    async getPendingTask() {
        const db = getDb();
        // Simple queue: get oldest pending task
        const stmt = db.prepare(`SELECT * FROM deployments WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`);
        const row = stmt.get();
        if (!row) return null;
        return {
            ...row,
            files: JSON.parse(row.files)
        };
    }
};
