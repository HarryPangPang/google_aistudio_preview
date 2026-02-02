import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { TMP_DIR, PORT } from '../config/constants.js';
import { getDb } from '../db/index.js';

export const ScreenshotService = {
    // 浏览器状态缓存
    _browserAvailable: null,

    /**
     * 检查浏览器是否已安装
     */
    async checkBrowserInstalled() {
        if (this._browserAvailable !== null) {
            return this._browserAvailable;
        }

        try {
            const browser = await chromium.launch({
                headless: true,
                timeout: 5000
            });
            await browser.close();
            this._browserAvailable = true;
            console.log('[ScreenshotService] Browser is available');
            return true;
        } catch (error) {
            if (error.message.includes("Executable doesn't exist")) {
                console.warn('[ScreenshotService] Browser not installed');
                this._browserAvailable = false;
                return false;
            }
            // 其他错误也认为浏览器不可用
            this._browserAvailable = false;
            return false;
        }
    },

    /**
     * 自动安装 Playwright 浏览器
     */
    async installBrowser() {
        console.log('[ScreenshotService] Installing Playwright browser...');

        return new Promise((resolve, reject) => {
            exec('npx playwright install chromium', { timeout: 120000 }, (error, _stdout, stderr) => {
                if (error) {
                    console.error('[ScreenshotService] Browser installation failed:', stderr);
                    reject(error);
                } else {
                    console.log('[ScreenshotService] Browser installed successfully');
                    this._browserAvailable = true;
                    resolve();
                }
            });
        });
    },
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

            // Check if browser is available
            const browserAvailable = await this.checkBrowserInstalled();
            if (!browserAvailable) {
                console.warn(`[ScreenshotService] Browser not available, generating fallback cover`);
                return await this.generateFallbackCover(gameId, 'Browser not installed');
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

        const deployDir = path.join(TMP_DIR, gameId);
        const coversDir = path.join(deployDir, 'covers');
        await fs.ensureDir(coversDir);
        const coverPath = path.join(coversDir, `${gameId}.png`);

        // 检查浏览器是否可用
        const browserAvailable = await this.checkBrowserInstalled();

        if (browserAvailable) {
            // 使用浏览器生成精美的封面
            return await this.generateFallbackWithBrowser(gameId, coverPath);
        } else {
            // 使用 SVG 生成简单封面（不需要浏览器）
            return await this.generateFallbackWithSVG(gameId, coverPath);
        }
    },

    /**
     * 使用浏览器生成精美的 fallback 封面
     */
    async generateFallbackWithBrowser(gameId, coverPath) {
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
    },

    /**
     * 使用 SVG 生成简单封面（无需浏览器）
     */
    async generateFallbackWithSVG(gameId, coverPath) {
        console.log(`[ScreenshotService] Generating SVG fallback for ${gameId}`);

        const colors = ['#7C3AED', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const shortId = gameId.substring(0, 8);

        // 生成 SVG
        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${randomColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${randomColor};stop-opacity:0.8" />
        </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#grad)"/>
    <text x="640" y="320" font-family="Arial, sans-serif" font-size="120" fill="white" text-anchor="middle">🎮</text>
    <text x="640" y="420" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">Game Preview</text>
    <text x="640" y="470" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.9)" text-anchor="middle">${shortId}</text>
</svg>`;

        // 保存为 SVG 文件（可以直接使用，或转换为 PNG）
        const svgPath = coverPath.replace('.png', '.svg');
        await fs.writeFile(svgPath, svg);

        // 如果需要 PNG，可以使用 sharp 库转换（需要安装）
        // 这里先使用 SVG 作为封面
        const db = await getDb();
        const coverUrl = `/covers/${gameId}.svg`;
        await db.run(
            'UPDATE build_record SET cover_url = ? WHERE id = ?',
            coverUrl,
            gameId
        );

        console.log(`[ScreenshotService] SVG fallback cover generated: ${svgPath}`);
        return svgPath;
    }
};
