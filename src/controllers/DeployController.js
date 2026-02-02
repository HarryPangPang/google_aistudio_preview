import { v4 as uuidv4 } from 'uuid';
import { DeploymentModel } from '../models/DeploymentModel.js';
import { AppModel } from '../models/AppModel.js';
import { CODEDIST_DIR } from '../config/constants.js';
import { getDb } from '../db/index.js';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

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
        const user = ctx.state.user;
        try {
            // 使用 formidable 解析上传的文件
            const formidable = (await import('formidable')).default;
            const form = formidable({
                maxFileSize: 100 * 1024 * 1024, // 100MB
                allowEmptyFiles: false,
                multiples: false
            });

            const [fields, files] = await new Promise((resolve, reject) => {
                form.parse(ctx.req, (err, fields, files) => {
                    if (err) reject(err);
                    else resolve([fields, files]);
                });
            });

            const zipFile = files.zipFile?.[0] || files.zipFile;
            if (!zipFile) {
                ctx.status = 400;
                ctx.body = { error: 'No zip file uploaded' };
                return;
            }

            // 验证文件类型
            if (!zipFile.originalFilename?.toLowerCase().endsWith('.zip')) {
                ctx.status = 400;
                ctx.body = { error: 'File must be a ZIP file' };
                return;
            }

            const deployId = uuidv4();

            // 确保 codedist 目录存在
            await fs.ensureDir(CODEDIST_DIR);

            // 保存上传的 ZIP 文件到 codedist 目录
            const savedZipPath = path.join(CODEDIST_DIR, `${deployId}${zipFile.originalFilename}`);
            await fs.copyFile(zipFile.filepath, savedZipPath);

            // 删除上传的临时文件
            await fs.remove(zipFile.filepath);

            // 插入到 build_record 表，让 worker 自动处理构建
            const db = await getDb();
            const now = Date.now();

            await db.run(`
                INSERT INTO build_record (id, file_name, target_path, is_processed, create_time, update_time, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, deployId, zipFile.originalFilename, savedZipPath, 0, now, now, user?.id || null, user?.username || user?.email || null);

            console.log(`[DeployController] ZIP file saved to ${savedZipPath} and build record created for ${deployId}`);

            ctx.body = {
                success: true,
                id: deployId,
                url: `preview?id=${deployId}`,
                message: 'ZIP file uploaded successfully, build will start shortly'
            };

        } catch (err) {
            console.error('[DeployController] uploadzip error:', err.message);
            ctx.status = 500;
            ctx.body = { error: 'Failed to upload zip file: ' + err.message };
        }
    },

    async importFromUrl(ctx) {
        const { url } = ctx.request.body;
        const user = ctx.state.user;
        if (!url) {
            ctx.status = 400;
            ctx.body = { error: 'No URL provided' };
            return;
        }

        try {
            // 判断是否是 Google AI Studio 链接
            const isGoogleStudioLink = url.includes('aistudio.google.com') || url.includes('google') || url.includes('studio');

            if (isGoogleStudioLink) {
                const GOOGLE_STUDIO_URL = process.env.GOOGLE_STUDIO_URL || 'http://localhost:1234';
                const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/download`, { data: url });

                ctx.body = response.data;
                return;
            }

            // 处理 ZIP 文件链接
            if (url.toLowerCase().endsWith('.zip')) {
                const deployId = uuidv4();

                // 下载 ZIP 文件
                console.log(`[DeployController] Downloading zip from ${url}`);
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 60000 // 60 seconds timeout
                });

                // 确保 codedist 目录存在
                await fs.ensureDir(CODEDIST_DIR);

                // 保存 ZIP 文件到 codedist 目录
                const fileName = path.basename(url);
                const savedZipPath = path.join(CODEDIST_DIR, `${deployId}_${fileName}`);
                await fs.writeFile(savedZipPath, response.data);

                // 插入到 build_record 表，让 worker 自动处理构建
                const db = await getDb();
                const now = Date.now();

                await db.run(`
                    INSERT INTO build_record (id, file_name, target_path, is_processed, create_time, update_time, user_id, username)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, deployId, fileName, savedZipPath, 0, now, now, user?.id || null, user?.username || user?.email || null);

                console.log(`[DeployController] ZIP downloaded to ${savedZipPath} and build record created for ${deployId}`);

                ctx.body = {
                    success: true,
                    id: deployId,
                    url: `preview?id=${deployId}`,
                    message: 'ZIP file downloaded successfully, build will start shortly'
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
