import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import { TMP_DIR, PROJECT_ROOT, PORT } from '../config/constants.js';
import { getDb } from '../db/index.js';
import { createEnvFile } from '../script/creaEnv.js';
import { ScreenshotService } from './ScreenshotService.js';
import { DependencyCacheService } from './DependencyCacheService.js';

export const BuildService = {
    /**
     * 获取默认的 package.json 配置
     */
    getDefaultPackageJson() {
        return {
            "name": "react-playground-deploy",
            "version": "0.0.0",
            "type": "module",
            "scripts": {
                "build": "tsc --noEmit false && vite build --mode production",
                "build:skip-check": "vite build --mode production"
            },
            "dependencies": {
                "react": "^19.2.4",
                "@google/genai": "^1.39.0",
                "react-dom": "^19.2.4"
            },
            "devDependencies": {
                "@types/react": "^19.0.0",
                "@types/react-dom": "^19.0.0",
                "@vitejs/plugin-react": "^4.2.1",
                "typescript": "^5.2.2",
                "vite": "^5.0.0",
                "@types/node": "^22.14.0",
            }
        };
    },

    /**
     * 带重试机制的文件复制（解决 Windows EBUSY 问题）
     */
    async copyFileWithRetry(src, dest, maxRetries = 5, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                // 使用 readFile + writeFile 代替 copy，避免某些锁定问题
                const buffer = await fs.readFile(src);
                await fs.writeFile(dest, buffer);
                return;
            } catch (err) {
                if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
                    if (i < maxRetries - 1) {
                        console.log(`[BuildService] File busy, retrying in ${delay}ms... (${i + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }
                throw err;
            }
        }
        throw new Error(`Failed to copy file after ${maxRetries} retries`);
    },

    /**
     * 异步处理构建任务 暂时不用了
     */
    async processBuild(deployId, files) {
        const deployDir = path.join(TMP_DIR, deployId);
        const sourceDir = path.join(deployDir, 'source');
        const distDir = path.join(deployDir, 'dist');
        const pnpmPath = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'pnpm');

        try {
            // await DeploymentModel.updateStatus(deployId, 'building');
            console.log(`[BuildService] Processing ${deployId}...`);

            // 1. Prepare Source
            await fs.ensureDir(sourceDir);
            await this.writeConfigFiles(sourceDir);
            await this.writeUserFiles(sourceDir, files);

            // 2. Use dependency cache instead of installing from scratch
            await DependencyCacheService.prepareDependencies(sourceDir, this.getDefaultPackageJson());

            // 3. Build only (dependencies already prepared)
            const pnpmCmd = fs.existsSync(pnpmPath) ? `"${pnpmPath}"` : 'pnpm';
            const cmd = `${pnpmCmd} run build`;

            await new Promise((resolve, reject) => {
                exec(cmd, { cwd: sourceDir, timeout: 300000 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[BuildService] Build failed for ${deployId}`);
                        reject(stderr || error.message);
                    } else {
                        console.log(`[BuildService] Build completed for ${deployId}`);
                        resolve();
                    }
                });
            });

            // 4. Verify dist
            if (await fs.pathExists(distDir)) {
                console.log(`[BuildService] Success ${deployId}`);
            } else {
                throw new Error('Dist folder missing after build');
            }

        } catch (err) {
            console.error(`[BuildService] Error ${deployId}:`, err);
        }
    },

    async writeConfigFiles(sourceDir) {
        // Package.json
        await fs.writeFile(path.join(sourceDir, 'package.json'), JSON.stringify({
            "name": "react-playground-deploy",
            "version": "0.0.0",
            "type": "module",
            "scripts": { "build": "vite build" },
            "dependencies": { "react": "^19.2.3", "react-dom": "^19.2.3" },
            "devDependencies": {
                "@types/react": "^19.0.0",
                "@types/react-dom": "^19.0.0",
                "@vitejs/plugin-react": "^4.2.1",
                "typescript": "^5.2.2",
                "vite": "^5.0.0"
            }
        }, null, 2));

        // Vite config
        await fs.writeFile(path.join(sourceDir, 'vite.config.ts'), `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
  plugins: [react()],
  base: './', 
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: '../dist', emptyOutDir: true }
});`);

        // TS Config
        await fs.writeFile(path.join(sourceDir, 'tsconfig.json'), JSON.stringify({
            "compilerOptions": {
                "target": "ES2020", "useDefineForClassFields": true, "lib": ["ES2020", "DOM", "DOM.Iterable"],
                "module": "ESNext", "skipLibCheck": true, "moduleResolution": "bundler", "allowImportingTsExtensions": true,
                "resolveJsonModule": true, "isolatedModules": true, "noEmit": true, "jsx": "react-jsx", "strict": true,
                "paths": { "@/*": ["./src/*"] }
            }, "include": ["src"]
        }, null, 2));
        // Index HTML
        await fs.writeFile(path.join(sourceDir, 'index.html'), `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>App</title><script src="https://cdn.tailwindcss.com"></script></head><body><div id="root"></div><script type="module" src="/src/index.tsx"></script></body></html>`);

        // Create .env files
        await createEnvFile(sourceDir);
    },
    

    async writeUserFiles(sourceDir, files) {
        const srcDir = path.join(sourceDir, 'src');
        await fs.ensureDir(srcDir);
        for (const [filePath, content] of Object.entries(files)) {
            const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
            const fullPath = path.join(srcDir, cleanPath);
            await fs.ensureDir(path.dirname(fullPath));
            await fs.writeFile(fullPath, content);
        }
    },
    // 真正的获取并处理生成代码的构建任务
    async getGeneratedCode() {
        const db = await getDb();
        // Check if any task is currently processing
        const processing = await db.get('SELECT id FROM build_record WHERE is_processed = 2');
        if (processing) {
            console.log(`[BuildService] Task ${processing.id} is currently processing, skipping`);
            return;
        }
        // Get oldest unprocessed task
        const task = await db.get('SELECT * FROM build_record WHERE is_processed = 0 ORDER BY create_time ASC LIMIT 1');
        if (!task) {
            console.log('[BuildService] No pending tasks found');
            return;
        }
    
        console.log(`[BuildService] Processing generated code task: ${task.id}`);
    
        // Mark as processing
        await db.run('UPDATE build_record SET is_processed = 2 WHERE id = ?', task.id);
    
        try {
            const { id, file_name, target_path } = task;

            let sourcePath = target_path;
            let sourceDir;
            let distDir;
            const deployDir = path.join(TMP_DIR, id);

            console.log(`[BuildService] Source path: ${sourcePath}`);
            console.log(`[BuildService] File name: ${file_name}`);

            if (!sourcePath || !fs.existsSync(sourcePath)) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }

            // 判断是新的 codegen 流程（source 目录）还是旧的 zip 流程
            const isSourceDirectory = sourcePath.includes('/source') && !sourcePath.endsWith('.zip');

            if (isSourceDirectory) {
                // 新流程：直接使用 source 目录，无需解压
                console.log(`[BuildService] Using existing source directory: ${sourcePath}`);
                sourceDir = sourcePath;

                // dist 输出到同级的 dist 目录
                // 例如 .tmp/{chatId}/source -> .tmp/{chatId}/dist
                const parentDir = path.dirname(sourcePath);
                distDir = path.join(parentDir, 'dist');

                // 确保 .env 文件存在
                await createEnvFile(sourceDir);

            } else {
                // 旧流程：处理 zip 文件
                console.log(`[BuildService] Processing zip file`);

                // Verify file is accessible
                const stats = await fs.stat(sourcePath);
                console.log(`[BuildService] Source file size: ${stats.size} bytes`);

                sourceDir = path.join(deployDir, 'source');
                distDir = path.join(deployDir, 'dist');

                console.log(`[BuildService] Deploy dir: ${deployDir}`);

                // Ensure directory exists, remove if exists (with retry for Windows)
                if (await fs.pathExists(deployDir)) {
                    try {
                        await fs.remove(deployDir);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (err) {
                        console.warn(`[BuildService] Failed to remove existing dir: ${err.message}`);
                    }
                }
                await fs.ensureDir(deployDir);

                // Copy zip to .tmp (with retry for Windows EBUSY errors)
                const tmpZipPath = path.join(deployDir, file_name);
                console.log(`[BuildService] Copying from ${sourcePath} to ${tmpZipPath}`);
                await this.copyFileWithRetry(sourcePath, tmpZipPath);
                console.log(`[BuildService] Copy completed successfully`);

                // Unzip (cross-platform)
                await fs.ensureDir(sourceDir);
                console.log(`[BuildService] Extracting to ${sourceDir}`);

                try {
                    const zip = new AdmZip(tmpZipPath);
                    zip.extractAllTo(sourceDir, true);
                    console.log(`[BuildService] Extraction completed`);

                    // Write .env file after extraction
                    await createEnvFile(sourceDir);
                } catch (err) {
                    console.error(`[BuildService] Extraction failed:`, err);
                    throw new Error(`Failed to extract zip: ${err.message}`);
                }

                // Wait for file system to release locks (Windows issue)
                console.log(`[BuildService] Waiting for file system to release locks...`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Delete tmp zip with retry
                try {
                    await fs.remove(tmpZipPath);
                    console.log(`[BuildService] Temp zip deleted`);
                } catch (err) {
                    console.warn(`[BuildService] Failed to delete temp zip, continuing anyway: ${err.message}`);
                }
            }
            // Run Build
            const pnpmPath = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'pnpm');
            // Ensure pnpm exists, otherwise use global pnpm or npm
            const pnpmCmd = fs.existsSync(pnpmPath) ? `"${pnpmPath}"` : 'pnpm';
            
            // const cmd = `${pnpmCmd} install && ${pnpmCmd} run build`;


            console.log(`[BuildService] Preparing dependencies for ${id}...`);

            const packageJsonPath = path.join(sourceDir, 'package.json');
            let packageJson;
            if (await fs.pathExists(packageJsonPath)) {
                packageJson = await fs.readJson(packageJsonPath);
            } else {
                packageJson = this.getDefaultPackageJson();
            }
            console.log(`[BuildService] Using package.json:`, packageJson);

            // Use dependency cache
            // await DependencyCacheService.prepareDependencies(sourceDir, packageJson);

            // Build only (dependencies already prepared)
            // 使用 build:skip-check 跳过 TypeScript 类型检查，如果不存在则使用 build
            const cmd = `${pnpmCmd} install && ${pnpmCmd} run build:skip-check || ${pnpmCmd} run build`;

            console.log(`[BuildService] Executing build for ${id}...`);
            await new Promise((resolve, reject) => {
                exec(cmd, { cwd: sourceDir, timeout: 600000 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(stdout);
                        console.error(error);
                        console.error(`[BuildService] Build failed for ${id}`);
                        reject(stderr || error.message);
                    } else {
                        console.log(`[BuildService] Build completed for ${id}`);
                        resolve();
                    }
                });
            });
    
            // Wait for build process to fully complete and release locks
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 处理 dist 目录
            if (isSourceDirectory) {
                // 新流程：dist 可能已经在正确位置（vite 配置输出到 ../dist）
                // 检查 dist 是否在预期位置
                if (await fs.pathExists(distDir)) {
                    console.log(`[BuildService] Dist directory found at expected location: ${distDir}`);
                } else {
                    // 如果 dist 在 sourceDir 内，移动到上层
                    const possibleDist = path.join(sourceDir, 'dist');
                    if (await fs.pathExists(possibleDist)) {
                        console.log(`[BuildService] Moving dist from ${possibleDist} to ${distDir}`);
                        await fs.move(possibleDist, distDir, { overwrite: true });
                    } else {
                        throw new Error('Build output (dist) not found');
                    }
                }
            } else {
                // 旧流程：从 sourceDir/dist 移动到 deployDir/dist
                const possibleDist = path.join(sourceDir, 'dist');
                if (await fs.pathExists(possibleDist)) {
                    await fs.move(possibleDist, distDir, { overwrite: true });
                } else {
                    // Try 'build' folder
                    const possibleBuild = path.join(sourceDir, 'build');
                    if (await fs.pathExists(possibleBuild)) {
                        await fs.move(possibleBuild, distDir, { overwrite: true });
                    } else if (!await fs.pathExists(distDir)) {
                        // If distDir doesn't exist (and wasn't created by build script in ../dist), fail
                        throw new Error('Build output (dist/build) not found');
                    }
                }
            }
    
            await db.run('UPDATE build_record SET is_processed = 1 WHERE id = ?', id);

            // Generate cover screenshot after successful build
            console.log(`[BuildService] Generating cover screenshot for ${id}...`);
            try {
                await ScreenshotService.generateCover(id);
                console.log(`[BuildService] Cover screenshot generated successfully for ${id}`);
            } catch (screenshotErr) {
                console.error(`[BuildService] Failed to generate cover for ${id}:`, screenshotErr.message);
                // Don't fail the whole build if screenshot fails
            }

        } catch (err) {
            console.error(`[BuildService] Error processing task ${task.id}:`, err);
            // Mark as processed (failed) to avoid infinite loop
            await db.run('UPDATE build_record SET is_processed = 1 WHERE id = ?', task.id);

        }
    }
};
