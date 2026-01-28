import fs from 'fs-extra';
import path from 'path';

/**
 * 在指定目录创建或更新 .env.local 文件，写入 GEMINI_API_KEY
 * @param {string} targetDir - 目标目录路径
 */
export async function createEnvFile(targetDir) {
    const envLocalPath = path.join(targetDir, '.env.local');
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyA1IiF-zUSz50zTacvJw4CaPb_TGtcNu0E';

    try {
        let envContent = '';

        // 检查 .env.local 是否已存在
        if (await fs.pathExists(envLocalPath)) {
            // 读取现有内容
            envContent = await fs.readFile(envLocalPath, 'utf-8');

            // 检查是否已包含 GEMINI_API_KEY
            if (/^GEMINI_API_KEY=/m.test(envContent)) {
                // 替换现有的 GEMINI_API_KEY
                envContent = envContent.replace(
                    /^GEMINI_API_KEY=.*$/m,
                    `GEMINI_API_KEY=${apiKey}`
                );
            } else {
                // 追加 GEMINI_API_KEY
                envContent = envContent.trim() + `\nGEMINI_API_KEY=${apiKey}\n`;
            }
        } else {
            // 创建新文件
            envContent = `GEMINI_API_KEY=${apiKey}\n`;
        }

        // 写入 .env.local 文件
        await fs.writeFile(envLocalPath, envContent);
        console.log(`[createEnvFile] .env.local written to ${targetDir}`);
    } catch (error) {
        console.error(`[createEnvFile] Error writing .env.local: ${error.message}`);
        throw error;
    }
}
