import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import { TMP_DIR, PROJECT_ROOT, PORT } from '../config/constants.js';
import { DeploymentModel } from '../models/DeploymentModel.js';
import { getDb } from '../db/index.js';

export const BuildService = {
    /**
     * 异步处理构建任务
     */
    async processBuild(deployId, files) {
        const deployDir = path.join(TMP_DIR, deployId);
        const sourceDir = path.join(deployDir, 'source');
        const distDir = path.join(deployDir, 'dist');
        const pnpmPath = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'pnpm');

        try {
            await DeploymentModel.updateStatus(deployId, 'building');
            console.log(`[BuildService] Processing ${deployId}...`);

            // 1. Prepare Source
            await fs.ensureDir(sourceDir);
            await this.writeConfigFiles(sourceDir);
            await this.writeUserFiles(sourceDir, files);

            // 2. Execute Build
            // Use local pnpm for caching and speed
            // --prefer-offline: use cached packages if available
            // --silent: reduce log output
            // --config.store-dir: optional, to force a shared store if needed, but default user store is usually fine
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
                await DeploymentModel.updateStatus(deployId, 'ready');
            } else {
                throw new Error('Dist folder missing after build');
            }

        } catch (err) {
            console.error(`[BuildService] Error ${deployId}:`, err);
            await DeploymentModel.updateStatus(deployId, 'error', err.toString());
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
        const processing = await db.get('SELECT id FROM generated_codes WHERE is_processed = 2');
        if (processing) {
            console.log('[BuildService] A task is already processing, skipping.');
            return;
        }
    
        // Get oldest unprocessed task
        const task = await db.get('SELECT * FROM generated_codes WHERE is_processed = 0 ORDER BY date_time ASC LIMIT 1');
        if (!task) return;
    
        console.log(`[BuildService] Processing generated code task: ${task.id}`);
    
        // Mark as processing
        await db.run('UPDATE generated_codes SET is_processed = 2 WHERE id = ?', task.id);
    
        try {
            const { id, file_name, target_path } = task;
            
            // Determine source path
            // Default: ../googlestudio/codedist/<id>/<file_name>
            let sourcePath = target_path;
            if (!sourcePath) {
                sourcePath = path.resolve(PROJECT_ROOT, '../googlestudio/codedist', id, file_name);
            }
    
            if (!fs.existsSync(sourcePath)) {
                // Fallback: try without ID folder? Or just fail.
                // User said "walk @googlestudio/codedist path under uuid".
                throw new Error(`Source file not found: ${sourcePath}`);
            }
    
            // Prepare temp dir
            const deployDir = path.join(TMP_DIR, id);
            const sourceDir = path.join(deployDir, 'source');
            const distDir = path.join(deployDir, 'dist');
            
            await fs.ensureDir(deployDir);
            await fs.emptyDir(deployDir); 
    
            // Copy zip to .tmp
            const tmpZipPath = path.join(deployDir, file_name);
            await fs.copy(sourcePath, tmpZipPath);
    
            // Unzip (cross-platform)
            await fs.ensureDir(sourceDir);
            const zip = new AdmZip(tmpZipPath);
            zip.extractAllTo(sourceDir, true);
    
            // Delete tmp zip
            await fs.remove(tmpZipPath);
    
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
    
            // Mark as processed
            await db.run('UPDATE generated_codes SET is_processed = 1 WHERE id = ?', id);
            
            // Update DeploymentModel
            // Check if deployment exists
            const existingDeploy = await DeploymentModel.get(id);
            if (!existingDeploy) {
                await DeploymentModel.create(id, {}, null);
            }
            await DeploymentModel.updateStatus(id, 'ready', { url: `http://localhost:${PORT}/deployments/${id}/` });
    
        } catch (err) {
            console.error(`[BuildService] Error processing task ${task.id}:`, err);
            // Mark as processed (failed) to avoid infinite loop
            await db.run('UPDATE generated_codes SET is_processed = 1 WHERE id = ?', task.id);
            
            // Update DeploymentModel to error
            try {
                const existingDeploy = await DeploymentModel.get(task.id);
                if (!existingDeploy) {
                    await DeploymentModel.create(task.id, {}, null);
                }
                await DeploymentModel.updateStatus(task.id, 'error', err.message);
            } catch (e) { /* ignore */ }
        }
    }
};
