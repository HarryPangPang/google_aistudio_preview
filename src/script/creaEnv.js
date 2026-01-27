import fs from 'fs-extra';
import path from 'path';

/**
 * 在指定目录创建 .env 文件
 * @param {string} targetDir - 目标目录路径
 */
export async function createEnvFile(targetDir) {
    const envContent = `GEMINI_API_KEY=`;

    // 写入 .env 文件
    await fs.writeFile(path.join(targetDir, '.env'), envContent);

    // 写入 .env.local 文件
    await fs.writeFile(path.join(targetDir, '.env.local'), envContent);

    console.log(`[createEnvFile] .env files written to ${targetDir}`);
}
