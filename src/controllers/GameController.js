import { GameStatsModel } from '../models/GameStatsModel.js';

export const GameController = {
    /**
     * Track a game click/play event
     * POST /api/game/track
     * Body: { gameId: string, sharedBy?: string }
     */
    async trackClick(ctx) {
        try {
            const { gameId, sharedBy } = ctx.request.body;

            // Validate gameId
            if (!gameId || typeof gameId !== 'string') {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: 'gameId is required and must be a string'
                };
                return;
            }

            // Track the click
            const record = await GameStatsModel.trackClick(gameId, sharedBy || null);

            ctx.status = 200;
            ctx.body = {
                success: true,
                message: 'Click tracked successfully',
                data: record
            };
        } catch (error) {
            console.error('[GameController] Track click error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                message: 'Failed to track game click',
                error: error.message
            };
        }
    },

    /**
     * Get statistics for a specific game
     * GET /api/game/stats/:gameId
     */
    async getStats(ctx) {
        try {
            const { gameId } = ctx.params;

            // Validate gameId
            if (!gameId) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: 'gameId is required'
                };
                return;
            }

            // Get play count (simple version for frontend display)
            const playCount = await GameStatsModel.getPlayCount(gameId);

            ctx.status = 200;
            ctx.body = {
                success: true,
                data: {
                    gameId,
                    playCount
                }
            };
        } catch (error) {
            console.error('[GameController] Get stats error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                message: 'Failed to get game statistics',
                error: error.message
            };
        }
    },

    /**
     * Get detailed statistics for a game (including share breakdown)
     * GET /api/game/stats/:gameId/detailed
     */
    async getDetailedStats(ctx) {
        try {
            const { gameId } = ctx.params;

            // Validate gameId
            if (!gameId) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: 'gameId is required'
                };
                return;
            }

            // Get detailed stats
            const stats = await GameStatsModel.getGameStats(gameId);

            ctx.status = 200;
            ctx.body = {
                success: true,
                data: stats
            };
        } catch (error) {
            console.error('[GameController] Get detailed stats error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                message: 'Failed to get detailed game statistics',
                error: error.message
            };
        }
    },

    /**
     * Get share statistics for a user
     * GET /api/game/user/:userId/shares
     */
    async getUserShareStats(ctx) {
        try {
            const { userId } = ctx.params;

            // Validate userId
            if (!userId) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: 'userId is required'
                };
                return;
            }

            // Get user's share stats
            const stats = await GameStatsModel.getUserShareStats(userId);

            ctx.status = 200;
            ctx.body = {
                success: true,
                data: {
                    userId,
                    totalShares: stats.length,
                    totalPlaysFromShares: stats.reduce((sum, item) => sum + item.playsFromShare, 0),
                    games: stats
                }
            };
        } catch (error) {
            console.error('[GameController] Get user share stats error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                message: 'Failed to get user share statistics',
                error: error.message
            };
        }
    },

    /**
     * Get statistics for multiple games in a single request
     * POST /api/game/stats/batch
     * Body: { gameIds: string[] }
     */
    async getBatchStats(ctx) {
        try {
            const { gameIds } = ctx.request.body;

            // Validate gameIds
            if (!Array.isArray(gameIds)) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: 'gameIds must be an array'
                };
                return;
            }

            if (gameIds.length === 0) {
                ctx.status = 200;
                ctx.body = {
                    success: true,
                    data: {}
                };
                return;
            }

            // Limit batch size to prevent abuse
            if (gameIds.length > 100) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: 'Maximum 100 games per batch request'
                };
                return;
            }

            // Get stats for all games
            const stats = await GameStatsModel.getBatchPlayCounts(gameIds);

            ctx.status = 200;
            ctx.body = {
                success: true,
                data: stats
            };
        } catch (error) {
            console.error('[GameController] Get batch stats error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                message: 'Failed to get batch game statistics',
                error: error.message
            };
        }
    }
};
