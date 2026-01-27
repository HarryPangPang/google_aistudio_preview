import { v4 as uuidv4 } from 'uuid';
import { DeploymentModel } from '../models/DeploymentModel.js';
import { AppModel } from '../models/AppModel.js';
import { BuildService } from '../services/BuildService.js';
import { TMP_DIR } from '../config/constants.js';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';

export const DeployController = {
    /**
     * Trigger a new deployment
     * Supports either { files: ... } OR { appId: ... }
     */
    async deploy(ctx) {
        let { files, appId } = ctx.request.body;
        
        // Mode 2: Deploy from App ID
        if (appId && !files) {
            const app = await AppModel.get(appId);
            if (!app) {
                ctx.status = 404;
                ctx.body = { error: 'App not found' };
                return;
            }
            files = app.files;
        }

        if (!files) {
            ctx.status = 400;
            ctx.body = { error: 'No files or appId provided' };
            return;
        }

        const deployId = uuidv4();
        
        // 1. Create Record (Snapshot)
        await DeploymentModel.create(deployId, files, appId);

        // Update App's latest deploy link
        if (appId) {
            await AppModel.updateLatestDeploy(appId, deployId);
        }

        // 2. Trigger Async Build (No await)
        // Note: In a real message queue system, we'd push to queue here.
        // Since we have a polling worker, creating the DB record with 'pending' status IS the trigger.
        // We do NOT need to call BuildService directly anymore, the Worker will pick it up.
        // Wait, did we remove direct call in previous step?
        // Let's check logic:
        // Worker polls DB for 'pending'.
        // So just creating the record is enough.
        // BUT, if we want immediate feedback or if worker is slow, we might want to kick it?
        // No, stick to the pattern: API writes to DB, Worker reads from DB.
        
        // 3. Return immediate response
        ctx.body = { 
            success: true, 
            id: deployId,
            status: 'pending',
            url: `preview?id=${deployId}`
        };
    },

    /**
     * Get deployment status
     */
    async getStatus(ctx) {
        const id = ctx.params.id;
        const state = await DeploymentModel.getStatus(id);
        
        if (!state) {
            ctx.status = 404;
            ctx.body = { error: 'Deployment not found' };
            return;
        }
        
        ctx.body = state;
    },
    async uploadzip(ctx) {
        const { zipFile } = ctx.request.files;
        if (!zipFile) {
            ctx.status = 400;
            ctx.body = { error: 'No zip file uploaded' };
            return;
        }
    },

    async importFromUrl(ctx) {
        const { url } = ctx.request.body;
        if (!url) {
            ctx.status = 400;
            ctx.body = { error: 'No URL provided' };
            return;
        }

        try {
            // 判断是否是 Google AI Studio 链接
            const isGoogleStudioLink = url.includes('aistudio.google.com') || url.includes('google') || url.includes('studio');

            if (isGoogleStudioLink) {
                // Google AI Studio 链接，调用 /api/download 接口
                const GOOGLE_STUDIO_URL = process.env.GOOGLE_STUDIO_URL || 'http://localhost:1234';
                const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/download`, { data: url });

                ctx.body = response.data;
                return;
            }

            // 处理 ZIP 文件链接
            if (url.toLowerCase().endsWith('.zip')) {
                const deployId = uuidv4();
                const deployDir = path.join(TMP_DIR, deployId);
                const sourceDir = path.join(deployDir, 'source');
                const distDir = path.join(deployDir, 'dist');

                // 下载 ZIP 文件
                console.log(`[DeployController] Downloading zip from ${url}`);
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 60000 // 60 seconds timeout
                });

                // 创建目录
                await fs.ensureDir(deployDir);
                await fs.ensureDir(sourceDir);
                await fs.ensureDir(distDir);

                // 保存临时 ZIP 文件
                const tmpZipPath = path.join(deployDir, 'temp.zip');
                await fs.writeFile(tmpZipPath, response.data);

                // 解压到 source 目录
                console.log(`[DeployController] Extracting zip to ${sourceDir}`);
                const zip = new AdmZip(tmpZipPath);
                zip.extractAllTo(sourceDir, true);

                // 删除临时 ZIP 文件
                await fs.remove(tmpZipPath);

                // 检查是否已经有 dist 目录（产物）
                const extractedDist = path.join(sourceDir, 'dist');
                if (await fs.pathExists(extractedDist)) {
                    // 将 dist 移动到外层
                    await fs.move(extractedDist, distDir, { overwrite: true });
                }

                ctx.body = {
                    success: true,
                    id: deployId,
                    message: 'ZIP file imported successfully',
                    paths: {
                        source: sourceDir,
                        dist: distDir
                    }
                };
                return;
            }

            // 不支持的 URL 类型
            ctx.status = 400;
            ctx.body = { error: 'Unsupported URL type. Only .zip files or Google AI Studio links are supported.' };

        } catch (err) {
            console.error('[DeployController] importFromUrl error:', err.message);
            ctx.status = 500;
            ctx.body = { error: 'Failed to import from URL: ' + err.message };
        }
    }
};
