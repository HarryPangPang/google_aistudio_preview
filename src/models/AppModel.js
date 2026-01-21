import { getDb } from '../db/index.js';

export const AppModel = {
    async createOrUpdate(id, files) {
        const db = getDb();
        const now = Date.now();
        
        // Check existence
        const existing = db.prepare('SELECT id FROM apps WHERE id = ?').get(id);
        
        if (existing) {
            const stmt = db.prepare('UPDATE apps SET files = ?, updated_at = ? WHERE id = ?');
            stmt.run(JSON.stringify(files), now, id);
        } else {
            const stmt = db.prepare('INSERT INTO apps (id, files, created_at, updated_at) VALUES (?, ?, ?, ?)');
            stmt.run(id, JSON.stringify(files), now, now);
        }
        return { id };
    },

    async get(id) {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            files: JSON.parse(row.files)
        };
    },

    async updateLatestDeploy(id, deployId) {
        const db = getDb();
        const stmt = db.prepare('UPDATE apps SET latest_deploy_id = ?, updated_at = ? WHERE id = ?');
        stmt.run(deployId, Date.now(), id);
    }
};
