import { getDb } from '../db/index.js';

export const GameStatsModel = {
    /**
     * Record a game click/play event
     * @param {string} gameId - The game ID
     * @param {string|null} sharedBy - The user ID who shared this game (optional)
     * @returns {Promise<Object>} The created record
     */
    async trackClick(gameId, sharedBy = null) {
        const db = await getDb();
        const now = Date.now();

        const result = await db.run(
            `INSERT INTO game_stats (game_id, shared_by, clicked_at, created_at) VALUES (?, ?, ?, ?)`,
            gameId,
            sharedBy,
            now,
            now
        );

        return {
            id: result.lastID,
            gameId,
            sharedBy,
            clickedAt: now
        };
    },

    /**
     * Get total play count for a game
     * @param {string} gameId - The game ID
     * @returns {Promise<number>} Total play count
     */
    async getPlayCount(gameId) {
        const db = await getDb();

        const result = await db.get(
            `SELECT COUNT(*) as count FROM game_stats WHERE game_id = ?`,
            gameId
        );

        return result?.count || 0;
    },

    /**
     * Get statistics for a game including share breakdown
     * @param {string} gameId - The game ID
     * @returns {Promise<Object>} Statistics object
     */
    async getGameStats(gameId) {
        const db = await getDb();

        // Get all stats in a single query using subqueries
        const result = await db.get(
            `SELECT
                (SELECT COUNT(*) FROM game_stats WHERE game_id = ?) as totalPlays,
                (SELECT COUNT(*) FROM game_stats WHERE game_id = ? AND shared_by IS NULL) as directPlays
             FROM game_stats
             WHERE game_id = ?
             LIMIT 1`,
            gameId, gameId, gameId
        );

        // Get plays by sharer
        const shareBreakdown = await db.all(
            `SELECT shared_by, COUNT(*) as count
             FROM game_stats
             WHERE game_id = ? AND shared_by IS NOT NULL
             GROUP BY shared_by`,
            gameId
        );

        const totalPlays = result?.totalPlays || 0;
        const directPlays = result?.directPlays || 0;

        return {
            gameId,
            totalPlays,
            directPlays,
            sharedPlays: totalPlays - directPlays,
            shareBreakdown: shareBreakdown.map(row => ({
                sharedBy: row.shared_by,
                count: row.count
            }))
        };
    },

    /**
     * Get stats for a specific user's shares
     * @param {string} userId - The user ID
     * @returns {Promise<Array>} Array of game stats shared by this user
     */
    async getUserShareStats(userId) {
        const db = await getDb();

        const results = await db.all(
            `SELECT game_id, COUNT(*) as count
             FROM game_stats
             WHERE shared_by = ?
             GROUP BY game_id
             ORDER BY count DESC`,
            userId
        );

        return results.map(row => ({
            gameId: row.game_id,
            playsFromShare: row.count
        }));
    },

    /**
     * Get recent clicks for a game
     * @param {string} gameId - The game ID
     * @param {number} limit - Number of recent clicks to retrieve
     * @returns {Promise<Array>} Array of recent click records
     */
    async getRecentClicks(gameId, limit = 100) {
        const db = await getDb();

        const results = await db.all(
            `SELECT * FROM game_stats
             WHERE game_id = ?
             ORDER BY clicked_at DESC
             LIMIT ?`,
            gameId,
            limit
        );

        return results;
    },

    /**
     * Get play counts for multiple games in a single query
     * @param {string[]} gameIds - Array of game IDs
     * @returns {Promise<Object>} Object mapping game IDs to play counts
     */
    async getBatchPlayCounts(gameIds) {
        if (!gameIds || gameIds.length === 0) {
            return {};
        }

        const db = await getDb();

        // Create placeholders for the IN clause
        const placeholders = gameIds.map(() => '?').join(',');

        const results = await db.all(
            `SELECT game_id, COUNT(*) as count
             FROM game_stats
             WHERE game_id IN (${placeholders})
             GROUP BY game_id`,
            ...gameIds
        );

        // Convert to object for easy lookup
        const stats = {};
        results.forEach(row => {
            stats[row.game_id] = row.count;
        });

        // Fill in zeros for games with no stats
        gameIds.forEach(gameId => {
            if (!(gameId in stats)) {
                stats[gameId] = 0;
            }
        });

        return stats;
    }
};
