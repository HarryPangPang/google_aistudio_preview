import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { PROJECT_ROOT, TMP_DIR } from '../config/constants.js';
import crypto from 'crypto';

/**
 * 依赖缓存服务 - 避免重复安装相同的 node_modules
 */
export const DependencyCacheService = {
    // 缓存目录
    CACHE_DIR: path.join(PROJECT_ROOT, '.cache', 'node_modules_templates'),

    /**
     * 根据 package.json 内容生成缓存键
     */
    getCacheKey(packageJson) {
        const content = JSON.stringify({
            dependencies: packageJson.dependencies,
            devDependencies: packageJson.devDependencies
        });
        return crypto.createHash('md5').update(content).digest('hex');
    },

    /**
     * 获取缓存路径
     */
    getCachePath(cacheKey) {
        return path.join(this.CACHE_DIR, cacheKey);
    },

    /**
     * 检查缓存是否存在
     */
    async hasCachedDeps(cacheKey) {
        const cachePath = this.getCachePath(cacheKey);
        const nodeModulesPath = path.join(cachePath, 'node_modules');
        return await fs.pathExists(nodeModulesPath);
    },

    /**
     * 创建依赖缓存
     */
    async createCache(packageJson, cacheKey) {
        const cachePath = this.getCachePath(cacheKey);
        console.log(`[DepCache] Creating cache at ${cachePath}...`);

        // 确保缓存目录存在
        await fs.ensureDir(cachePath);

        // 写入 package.json
        await fs.writeFile(
            path.join(cachePath, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );

        // 安装依赖
        const pnpmPath = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'pnpm');
        const pnpmCmd = fs.existsSync(pnpmPath) ? `"${pnpmPath}"` : 'pnpm';

        await new Promise((resolve, reject) => {
            const cmd = `${pnpmCmd} install `;
            exec(cmd, { cwd: cachePath, timeout: 300000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[DepCache] Cache creation failed:`, stderr);
                    reject(error);
                } else {
                    console.log(`[DepCache] Cache created successfully`);
                    resolve();
                }
            });
        });
    },

    /**
     * 复制缓存的 node_modules 到目标目录
     * 使用硬链接以节省空间和时间
     */
    async copyFromCache(cacheKey, targetDir) {
        const cachePath = this.getCachePath(cacheKey);
        const cacheNodeModules = path.join(cachePath, 'node_modules');
        const targetNodeModules = path.join(targetDir, 'node_modules');

        console.log(`[DepCache] Copying from cache to ${targetDir}...`);

        try {
            // 使用 fs-extra 的 copy 方法，会自动处理链接
            await fs.copy(cacheNodeModules, targetNodeModules, {
                // 在支持的系统上使用硬链接
                dereference: false,
                preserveTimestamps: true
            });
            console.log(`[DepCache] Copy completed`);
        } catch (err) {
            console.error(`[DepCache] Copy failed, falling back to regular copy:`, err.message);
            // 如果硬链接失败，降级为普通复制
            await fs.copy(cacheNodeModules, targetNodeModules);
        }
    },

    /**
     * 主方法：准备依赖
     * 如果缓存存在则复制，否则创建缓存
     */
    async prepareDependencies(targetDir, packageJson) {
        const cacheKey = this.getCacheKey(packageJson);
        const hasCached = await this.hasCachedDeps(cacheKey);

        if (hasCached) {
            console.log(`[DepCache] Using cached dependencies (${cacheKey})`);
            await this.copyFromCache(cacheKey, targetDir);
        } else {
            console.log(`[DepCache] No cache found, creating new cache (${cacheKey})`);
            await this.createCache(packageJson, cacheKey);
            await this.copyFromCache(cacheKey, targetDir);
        }
    },

    /**
     * 清理旧缓存（可选）
     * 保留最近使用的 N 个缓存
     */
    async cleanOldCaches(keepCount = 3) {
        if (!await fs.pathExists(this.CACHE_DIR)) {
            return;
        }

        const caches = await fs.readdir(this.CACHE_DIR);
        if (caches.length <= keepCount) {
            return;
        }

        // 按修改时间排序
        const cachesWithStats = await Promise.all(
            caches.map(async (cache) => {
                const cachePath = path.join(this.CACHE_DIR, cache);
                const stats = await fs.stat(cachePath);
                return { cache, mtime: stats.mtime };
            })
        );

        cachesWithStats.sort((a, b) => b.mtime - a.mtime);

        // 删除旧的缓存
        const toDelete = cachesWithStats.slice(keepCount);
        for (const { cache } of toDelete) {
            const cachePath = path.join(this.CACHE_DIR, cache);
            console.log(`[DepCache] Removing old cache: ${cache}`);
            await fs.remove(cachePath);
        }
    }
};
