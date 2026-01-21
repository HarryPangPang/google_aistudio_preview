import { getDb } from '../db/index.js';

export const AppModel = {
    async createOrUpdate(id, files) {
        const db = await getDb();
        const now = Date.now();
        
        // Check existence
        const existing = await db.get('SELECT id FROM apps WHERE id = ?', id);
        
        if (existing) {
            await db.run('UPDATE apps SET files = ?, updated_at = ? WHERE id = ?', JSON.stringify(files), now, id);
        } else {
            await db.run('INSERT INTO apps (id, files, created_at, updated_at) VALUES (?, ?, ?, ?)', id, JSON.stringify(files), now, now);
        }
        return { id };
    },

    async get(id) {
        const db = await getDb();
        const row = await db.get('SELECT * FROM apps WHERE id = ?', id);
        if (!row) return null;
        return {
            ...row,
            files: JSON.parse(row.files)
        };
    },

    async updateLatestDeploy(id, deployId) {
        const db = await getDb();
        await db.run('UPDATE apps SET latest_deploy_id = ?, updated_at = ? WHERE id = ?', deployId, Date.now(), id);
    }
};
