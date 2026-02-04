import { getDb } from '../db/index.js';

/**
 * 消息模型 - 管理 AI 对话历史
 *
 * 支持：
 * - 按 chat_id 存储完整对话历史
 * - 支持 Token 使用统计
 * - 支持上下文窗口限制（只获取最近 N 条消息）
 */
export const MessageModel = {
    /**
     * 保存一条消息
     * @param {Object} messageData
     * @param {string} messageData.chat_id - 聊天会话 ID
     * @param {string} messageData.project_id - 项目 ID（可选）
     * @param {number} messageData.user_id - 用户 ID（可选）
     * @param {string} messageData.role - 角色（user/assistant/system）
     * @param {string} messageData.content - 消息内容
     * @param {string} messageData.model_id - 使用的模型 ID（可选）
     * @param {number} messageData.tokens_used - 使用的 token 数（可选）
     * @returns {Promise<Object>}
     */
    async create(messageData) {
        const db = await getDb();
        const now = Date.now();

        const {
            chat_id,
            project_id = null,
            user_id = null,
            role,
            content,
            model_id = null,
            tokens_used = null
        } = messageData;

        const result = await db.run(
            `INSERT INTO messages (
                chat_id, project_id, user_id, role, content,
                model_id, tokens_used, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [chat_id, project_id, user_id, role, content, model_id, tokens_used, now]
        );

        return {
            id: result.lastID,
            chat_id,
            role,
            created_at: now
        };
    },

    /**
     * 批量保存多条消息
     * @param {Array<Object>} messages
     * @returns {Promise<void>}
     */
    async createBatch(messages) {
        const db = await getDb();
        const now = Date.now();

        const stmt = await db.prepare(
            `INSERT INTO messages (
                chat_id, project_id, user_id, role, content,
                model_id, tokens_used, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const msg of messages) {
            await stmt.run(
                msg.chat_id,
                msg.project_id || null,
                msg.user_id || null,
                msg.role,
                msg.content,
                msg.model_id || null,
                msg.tokens_used || null,
                now
            );
        }

        await stmt.finalize();
    },

    /**
     * 获取聊天历史
     * @param {string} chatId - 聊天会话 ID
     * @param {Object} options
     * @param {number} options.limit - 限制返回条数（默认 20，用于控制上下文窗口）
     * @param {number} options.offset - 偏移量
     * @returns {Promise<Array>}
     */
    async getByChatId(chatId, options = {}) {
        const db = await getDb();
        const { limit = 20, offset = 0 } = options;

        const messages = await db.all(
            `SELECT * FROM messages
             WHERE chat_id = ?
             ORDER BY created_at ASC
             LIMIT ? OFFSET ?`,
            [chatId, limit, offset]
        );

        return messages;
    },

    /**
     * 获取最近的 N 条消息（用于 AI 上下文）
     * @param {string} chatId
     * @param {number} limit - 最多返回多少条消息
     * @returns {Promise<Array>}
     */
    async getRecentMessages(chatId, limit = 20) {
        const db = await getDb();

        const messages = await db.all(
            `SELECT role, content, model_id, created_at
             FROM messages
             WHERE chat_id = ?
             ORDER BY created_at DESC
             LIMIT ?`,
            [chatId, limit]
        );

        // 反转顺序，使其从旧到新
        return messages.reverse();
    },

    /**
     * 获取项目的所有消息
     * @param {string} projectId
     * @returns {Promise<Array>}
     */
    async getByProjectId(projectId) {
        const db = await getDb();

        const messages = await db.all(
            `SELECT * FROM messages
             WHERE project_id = ?
             ORDER BY created_at ASC`,
            [projectId]
        );

        return messages;
    },

    /**
     * 统计 chat 的消息数量
     * @param {string} chatId
     * @returns {Promise<number>}
     */
    async getMessageCount(chatId) {
        const db = await getDb();

        const result = await db.get(
            `SELECT COUNT(*) as count FROM messages WHERE chat_id = ?`,
            [chatId]
        );

        return result.count;
    },

    /**
     * 统计 Token 使用情况
     * @param {string} chatId
     * @returns {Promise<Object>}
     */
    async getTokenStats(chatId) {
        const db = await getDb();

        const result = await db.get(
            `SELECT
                COUNT(*) as message_count,
                SUM(tokens_used) as total_tokens,
                SUM(CASE WHEN role = 'user' THEN tokens_used ELSE 0 END) as user_tokens,
                SUM(CASE WHEN role = 'assistant' THEN tokens_used ELSE 0 END) as assistant_tokens
             FROM messages
             WHERE chat_id = ?`,
            [chatId]
        );

        return {
            messageCount: result.message_count || 0,
            totalTokens: result.total_tokens || 0,
            userTokens: result.user_tokens || 0,
            assistantTokens: result.assistant_tokens || 0
        };
    },

    /**
     * 删除聊天历史
     * @param {string} chatId
     * @returns {Promise<void>}
     */
    async deleteByChatId(chatId) {
        const db = await getDb();
        await db.run(`DELETE FROM messages WHERE chat_id = ?`, [chatId]);
    },

    /**
     * 删除项目的所有消息
     * @param {string} projectId
     * @returns {Promise<void>}
     */
    async deleteByProjectId(projectId) {
        const db = await getDb();
        await db.run(`DELETE FROM messages WHERE project_id = ?`, [projectId]);
    },

    /**
     * 清理过期消息（如超过 30 天的消息）
     * @param {number} daysToKeep - 保留最近多少天的消息
     * @returns {Promise<number>} 删除的消息数量
     */
    async cleanupOldMessages(daysToKeep = 30) {
        const db = await getDb();
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

        const result = await db.run(
            `DELETE FROM messages WHERE created_at < ?`,
            [cutoffTime]
        );

        return result.changes || 0;
    },

    /**
     * 获取用户的所有对话列表（按 chat_id 分组）
     * @param {number} userId - 用户 ID
     * @param {Object} options
     * @param {number} options.limit - 限制返回数量
     * @param {number} options.offset - 偏移量
     * @returns {Promise<Array>} 对话列表
     */
    async getUserChats(userId, options = {}) {
        const db = await getDb();
        const { limit = 50, offset = 0 } = options;

        // 获取用户的所有对话，每个对话显示最后一条消息
        const chats = await db.all(
            `SELECT
                chat_id,
                MAX(created_at) as last_message_time,
                (SELECT content FROM messages m2
                 WHERE m2.chat_id = messages.chat_id
                 AND m2.user_id = ?
                 ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT role FROM messages m3
                 WHERE m3.chat_id = messages.chat_id
                 AND m3.user_id = ?
                 ORDER BY created_at DESC LIMIT 1) as last_role,
                (SELECT model_id FROM messages m4
                 WHERE m4.chat_id = messages.chat_id
                 AND m4.user_id = ?
                 ORDER BY created_at DESC LIMIT 1) as model_id,
                COUNT(*) as message_count
             FROM messages
             WHERE user_id = ?
             GROUP BY chat_id
             ORDER BY last_message_time DESC
             LIMIT ? OFFSET ?`,
            [userId, userId, userId, userId, limit, offset]
        );

        return chats;
    },

    /**
     * 获取用户的对话总数
     * @param {number} userId - 用户 ID
     * @returns {Promise<number>}
     */
    async getUserChatCount(userId) {
        const db = await getDb();

        const result = await db.get(
            `SELECT COUNT(DISTINCT chat_id) as count
             FROM messages
             WHERE user_id = ?`,
            [userId]
        );

        return result.count;
    },

    /**
     * 检查用户是否有权访问某个对话
     * @param {number} userId - 用户 ID
     * @param {string} chatId - 对话 ID
     * @returns {Promise<boolean>}
     */
    async userHasAccessToChat(userId, chatId) {
        const db = await getDb();

        const result = await db.get(
            `SELECT COUNT(*) as count
             FROM messages
             WHERE user_id = ? AND chat_id = ?
             LIMIT 1`,
            [userId, chatId]
        );

        return result.count > 0;
    },

    /**
     * 格式化消息为 AI 所需的格式
     * @param {Array} messages - 数据库中的消息
     * @returns {Array} AI 格式的消息
     */
    formatForAI(messages) {
        return messages
            .filter(msg => msg.role !== 'system') // 过滤掉 system 消息
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));
    }
};

export default MessageModel;
