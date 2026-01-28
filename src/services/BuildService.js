import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import { TMP_DIR, PROJECT_ROOT, PORT } from '../config/constants.js';
import { getDb } from '../db/index.js';
import { createEnvFile } from '../script/creaEnv.js';

export const BuildService = {
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
     * 异步处理构建任务
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

            const cmd = `"${pnpmPath}" install --prefer-offline --silent --no-frozen-lockfile && "${pnpmPath}" run build`;
            
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

            // 3. Verify dist
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
            console.log(`[BuildService] Source path: ${sourcePath}`);
            console.log(`[BuildService] File name: ${file_name}`);

            if (!sourcePath || !fs.existsSync(sourcePath)) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }

            // Verify file is accessible
            const stats = await fs.stat(sourcePath);
            console.log(`[BuildService] Source file size: ${stats.size} bytes`);

            // Prepare temp dir
            const deployDir = path.join(TMP_DIR, id);
            const sourceDir = path.join(deployDir, 'source');
            const distDir = path.join(deployDir, 'dist');

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
    
            // Run Build
            const pnpmPath = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'pnpm');
            // Ensure pnpm exists, otherwise use global pnpm or npm
            const pnpmCmd = fs.existsSync(pnpmPath) ? `"${pnpmPath}"` : 'pnpm';
            
            const cmd = `${pnpmCmd} install && ${pnpmCmd} run build`;
            
            console.log(`[BuildService] Executing build for ${id}...`);
            await new Promise((resolve, reject) => {
                exec(cmd, { cwd: sourceDir, timeout: 600000 }, (error, stdout, stderr) => {
                    if (error) {
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

            // Move dist
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
    
            await db.run('UPDATE build_record SET is_processed = 1 WHERE id = ?', id);
        } catch (err) {
            console.error(`[BuildService] Error processing task ${task.id}:`, err);
            // Mark as processed (failed) to avoid infinite loop
            await db.run('UPDATE build_record SET is_processed = 1 WHERE id = ?', task.id);
            
        }
    }
};
