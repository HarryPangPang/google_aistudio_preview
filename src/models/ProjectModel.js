import { getDb } from '../db/index.js';

export const ProjectModel = {
    /**
     * 创建新项目
     */
    async create(projectData) {
        const db = await getDb();
        const now = Date.now();

        const {
            id,
            user_id,
            username,
            type,
            platform_id,
            model_label,
            model_value,
            title,
            prompt,
            chat_content,
            driveid,
            deploy_url,
            deploy_type,
            status = 'draft',
            files,
            source_url
        } = projectData;

        await db.run(
            `INSERT INTO projects (
                id, user_id, username, type, platform_id,
                model_label, model_value, title, prompt, chat_content,
                driveid, deploy_url, deploy_type, status, files, source_url,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                user_id,
                username,
                type,
                platform_id,
                model_label,
                model_value,
                title,
                prompt ? JSON.stringify(prompt) : null,
                chat_content,
                driveid,
                deploy_url,
                deploy_type,
                status,
                files ? JSON.stringify(files) : null,
                source_url,
                now,
                now
            ]
        );

        return { id };
    },

    /**
     * 更新项目
     */
    async update(id, projectData) {
        const db = await getDb();
        const now = Date.now();

        const updates = [];
        const values = [];

        const fields = [
            'type', 'platform_id', 'model_label', 'model_value',
            'title', 'chat_content', 'driveid', 'deploy_url',
            'deploy_type', 'status', 'source_url'
        ];

        fields.forEach(field => {
            if (projectData[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(projectData[field]);
            }
        });

        // Handle JSON fields
        if (projectData.prompt !== undefined) {
            updates.push('prompt = ?');
            values.push(JSON.stringify(projectData.prompt));
        }

        if (projectData.files !== undefined) {
            updates.push('files = ?');
            values.push(JSON.stringify(projectData.files));
        }

        if (updates.length === 0) {
            return { id };
        }

        updates.push('updated_at = ?');
        values.push(now);
        values.push(id);

        await db.run(
            `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        return { id };
    },

    /**
     * 创建或更新项目
     */
    async createOrUpdate(id, projectData) {
        const db = await getDb();
        const existing = await db.get('SELECT id FROM projects WHERE id = ?', id);

        if (existing) {
            return await this.update(id, projectData);
        } else {
            return await this.create({ id, ...projectData });
        }
    },

    /**
     * 根据 ID 获取项目
     */
    async getById(id) {
        const db = await getDb();
        const row = await db.get('SELECT * FROM projects WHERE id = ?', id);

        if (!row) return null;

        return this._parseProject(row);
    },

    /**
     * 根据用户 ID 获取所有项目
     */
    async getByUserId(userId, options = {}) {
        const db = await getDb();
        const { status, limit, offset = 0 } = options;

        let query = 'SELECT * FROM projects WHERE user_id = ?';
        const params = [userId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY updated_at DESC';

        if (limit) {
            query += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);
        }

        const rows = await db.all(query, params);
        return rows.map(row => this._parseProject(row));
    },

    /**
     * 根据 driveid 获取项目
     */
    async getByDriveid(driveid) {
        const db = await getDb();
        const row = await db.get('SELECT * FROM projects WHERE driveid = ?', driveid);

        if (!row) return null;

        return this._parseProject(row);
    },

    /**
     * 删除项目
     */
    async delete(id) {
        const db = await getDb();
        await db.run('DELETE FROM projects WHERE id = ?', id);
        return { success: true };
    },

    /**
     * 解析项目数据（将 JSON 字符串转换为对象）
     */
    _parseProject(row) {
        return {
            ...row,
            prompt: row.prompt ? JSON.parse(row.prompt) : null,
            files: row.files ? JSON.parse(row.files) : null,
            model: row.model_label && row.model_value ? {
                label: row.model_label,
                value: row.model_value
            } : undefined
        };
    }
};
