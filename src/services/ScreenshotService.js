import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import { TMP_DIR, PORT } from '../config/constants.js';
import { getDb } from '../db/index.js';

export const ScreenshotService = {
    /**
     * Generate a cover screenshot for a deployed game
     * @param {string} gameId - The deployment/game ID
     * @returns {Promise<string>} - Path to the generated cover image
     */
    async generateCover(gameId) {
        console.log(`[ScreenshotService] Starting screenshot generation for ${gameId}`);

        let browser = null;
        try {
            const deployDir = path.join(TMP_DIR, gameId);
            // Prepare cover directory
            const coversDir = path.join(deployDir, 'covers');
            await fs.ensureDir(coversDir);

            const coverPath = path.join(coversDir, `${gameId}.png`);

            // If cover already exists, skip generation
            if (await fs.pathExists(coverPath)) {
                console.log(`[ScreenshotService] Cover already exists for ${gameId}`);
                return coverPath;
            }

            // Launch browser
            console.log(`[ScreenshotService] Launching browser...`);
            browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1
            });

            const page = await context.newPage();

            // Set timeout
            page.setDefaultTimeout(30000);

            // Navigate to the game page
            const gameUrl = `http://localhost:${PORT}/deployments/${gameId}/`;
            console.log(`[ScreenshotService] Navigating to ${gameUrl}`);

            try {
                await page.goto(gameUrl, {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
            } catch (error) {
                // If networkidle fails, try domcontentloaded
                console.warn(`[ScreenshotService] Network idle timeout, trying domcontentloaded...`);
                await page.goto(gameUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
            }

            // Wait a bit for the game to render
            console.log(`[ScreenshotService] Waiting for game to render...`);
            await page.waitForTimeout(3000);

            // Try to wait for canvas or main game element
            try {
                await page.waitForSelector('canvas, #root > *, #app > *', { timeout: 5000 });
            } catch (e) {
                console.warn(`[ScreenshotService] No canvas/root element found, continuing anyway`);
            }

            // Take screenshot
            console.log(`[ScreenshotService] Taking screenshot...`);
            await page.screenshot({
                path: coverPath,
                type: 'png',
                fullPage: false // Only capture viewport
            });

            console.log(`[ScreenshotService] Screenshot saved to ${coverPath}`);

            // Update database with cover URL
            const db = await getDb();
            const coverUrl = `/covers/${gameId}.png`;
            await db.run(
                'UPDATE build_record SET cover_url = ? WHERE id = ?',
                coverUrl,
                gameId
            );

            console.log(`[ScreenshotService] Database updated with cover URL: ${coverUrl}`);

            return coverPath;

        } catch (error) {
            console.error(`[ScreenshotService] Error generating cover for ${gameId}:`, error);

            // Generate a fallback cover with error message
            try {
                await this.generateFallbackCover(gameId, error.message);
            } catch (fallbackError) {
                console.error(`[ScreenshotService] Failed to generate fallback cover:`, fallbackError);
            }

            throw error;
        } finally {
            // Close browser
            if (browser) {
                try {
                    await browser.close();
                    console.log(`[ScreenshotService] Browser closed`);
                } catch (e) {
                    console.warn(`[ScreenshotService] Error closing browser:`, e.message);
                }
            }
        }
    },

    /**
     * Generate a fallback cover image (simple colored placeholder)
     * @param {string} gameId - The deployment/game ID
     * @param {string} errorMsg - Optional error message to display
     */
    async generateFallbackCover(gameId, errorMsg = '') {
        console.log(`[ScreenshotService] Generating fallback cover for ${gameId}`);

        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        const page = await context.newPage();

        // Generate a simple HTML fallback
        const colors = ['#7C3AED', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    width: 1280px;
                    height: 720px;
                    background: linear-gradient(135deg, ${randomColor} 0%, ${randomColor}CC 100%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                .icon {
                    font-size: 120px;
                    margin-bottom: 20px;
                }
                .title {
                    font-size: 48px;
                    font-weight: bold;
                    color: white;
                    text-align: center;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.2);
                }
                .subtitle {
                    font-size: 24px;
                    color: rgba(255,255,255,0.9);
                    margin-top: 10px;
                }
            </style>
        </head>
        <body>
            <div class="icon">🎮</div>
            <div class="title">Game Preview</div>
            <div class="subtitle">${gameId.substring(0, 8)}</div>
        </body>
        </html>
        `;

        await page.setContent(html);

        const coversDir = path.join(TMP_DIR, 'covers');
        await fs.ensureDir(coversDir);
        const coverPath = path.join(coversDir, `${gameId}.png`);

        await page.screenshot({
            path: coverPath,
            type: 'png'
        });

        await browser.close();

        // Update database
        const db = await getDb();
        const coverUrl = `/covers/${gameId}.png`;
        await db.run(
            'UPDATE build_record SET cover_url = ? WHERE id = ?',
            coverUrl,
            gameId
        );

        console.log(`[ScreenshotService] Fallback cover generated: ${coverPath}`);
        return coverPath;
    }
};
