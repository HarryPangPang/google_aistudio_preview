/**
 * 代码生成控制器 - 使用 Vercel AI SDK
 * 这是全新的架构，支持多模型、流式响应、历史对话管理
 * 与 GenerateController 并存，互不影响
 */

import { getDb } from '../db/index.js';
import { AIService, decodeUnicodeEscapes } from '../services/AIService.js';
import { MessageModel } from '../models/MessageModel.js';
import { ProjectModel } from '../models/ProjectModel.js';
import { BuildService } from '../services/BuildService.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs-extra';
import { TMP_DIR } from '../config/constants.js';

// 初始化 AI Service（使用 Vercel AI SDK）
const aiService = new AIService({
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY
});

/**
 * 确保必要的配置文件存在
 * 如果 AI 没有生成某些必需的配置文件，使用默认配置
 */
async function ensureConfigFiles(sourceDir, files) {
    const fileList = Object.keys(files);

    // 检查并添加 package.json（如果不存在）
    if (!fileList.some(f => f === 'package.json' || f.endsWith('/package.json'))) {
        console.log('[CodeGenController] Adding default package.json');
        const packageJson = BuildService.getDefaultPackageJson();
        await fs.writeFile(
            path.join(sourceDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );
    }

    // 检查并添加 vite.config.js（如果不存在）
    if (!fileList.some(f => f.includes('vite.config'))) {
        console.log('[CodeGenController] Adding default vite.config.js');
        const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild'
  },
  logLevel: 'error'
});`;
        await fs.writeFile(path.join(sourceDir, 'vite.config.js'), viteConfig);
    }

    // TypeScript 配置文件已移除，使用纯 JavaScript

    // 检查并添加 index.html（如果不存在）
    if (!fileList.some(f => f === 'index.html' || f.endsWith('/index.html'))) {
        console.log('[CodeGenController] Adding default index.html');
        const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/index.jsx"></script>
</body>
</html>`;
        await fs.writeFile(path.join(sourceDir, 'index.html'), indexHtml);
    }

    // 检查并添加 src/index.jsx（如果不存在）- 兼容键名 index.jsx
    const hasIndexJsx = fileList.some(f => f === 'src/index.jsx' || f.endsWith('/index.jsx')) || fileList.includes('index.jsx');
    if (!hasIndexJsx) {
        console.log('[CodeGenController] Adding default src/index.jsx');
        const indexJsx = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;
        const indexJsxPath = path.join(sourceDir, 'src', 'index.jsx');
        await fs.ensureDir(path.dirname(indexJsxPath));
        await fs.writeFile(indexJsxPath, indexJsx);
    } else if (files['index.jsx'] && !files['src/index.jsx']) {
        const indexJsxPath = path.join(sourceDir, 'src', 'index.jsx');
        await fs.ensureDir(path.dirname(indexJsxPath));
        await fs.writeFile(indexJsxPath, files['index.jsx'], 'utf-8');
        files['src/index.jsx'] = files['index.jsx'];
        delete files['index.jsx'];
    }

    // 检查并添加 src/App.jsx（如果不存在）- 这是必需的主组件
    // 兼容 AI 返回的键名为 App.jsx 而非 src/App.jsx（如部分 Gemini 输出）
    const hasAppJsx = fileList.some(f => f === 'src/App.jsx' || f.endsWith('/App.jsx')) || fileList.includes('App.jsx');
    if (!hasAppJsx) {
        console.log('[CodeGenController] Adding default src/App.jsx');
        const appJsx = `import './App.css';

function App() {
  return (
    <div className="app">
      <h1>Welcome to Your App</h1>
      <p>Start building your application here.</p>
    </div>
  );
}

export default App;
`;
        const appJsxPath = path.join(sourceDir, 'src', 'App.jsx');
        await fs.ensureDir(path.dirname(appJsxPath));
        await fs.writeFile(appJsxPath, appJsx);
    } else if (files['App.jsx'] && !files['src/App.jsx']) {
        // AI 返回了 App.jsx 但键名无 src/ 前缀，写入到 src/App.jsx 避免被占位覆盖
        const appJsxPath = path.join(sourceDir, 'src', 'App.jsx');
        await fs.ensureDir(path.dirname(appJsxPath));
        await fs.writeFile(appJsxPath, files['App.jsx'], 'utf-8');
        files['src/App.jsx'] = files['App.jsx'];
        delete files['App.jsx'];
    }

    // 检查并添加 App.css（如果不存在）- 兼容键名 App.css
    const hasAppCss = fileList.some(f => f === 'src/App.css' || f.endsWith('/App.css')) || fileList.includes('App.css');
    if (!hasAppCss) {
        console.log('[CodeGenController] Adding default App.css');
        const appCss = `/* App.css - 主应用样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  width: 100%;
  height: 100vh;
}

.app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
`;
        const appCssPath = path.join(sourceDir, 'src', 'App.css');
        await fs.ensureDir(path.dirname(appCssPath));
        await fs.writeFile(appCssPath, appCss);
    } else if (files['App.css'] && !files['src/App.css']) {
        const appCssPath = path.join(sourceDir, 'src', 'App.css');
        await fs.ensureDir(path.dirname(appCssPath));
        await fs.writeFile(appCssPath, files['App.css'], 'utf-8');
        files['src/App.css'] = files['App.css'];
        delete files['App.css'];
    }
}

export const CodeGenController = {
    /**
     * 初始化代码生成会话
     * POST /api/codegen/init
     *
     * Body:
     * {
     *   "prompt": "生成一个贪吃蛇游戏",
     *   "modelId": "claude-4.5",  // 必需：模型 ID
     *   "projectId": "xxx",       // 可选：关联的项目 ID
     *   "currentPage": "GamePage", // 可选：当前页面上下文
     *   "stream": false           // 可选：是否流式响应，默认 false
     * }
     */
    async init(ctx) {
        const { prompt, modelId, projectId, currentPage, stream = false } = ctx.request.body;
        const user = ctx.state.user;
        
        // 参数验证
        if (!prompt) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                error: 'prompt is required'
            };
            return;
        }

        if (!modelId) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                error: 'modelId is required. Use /api/codegen/models to get available models'
            };
            return;
        }

        // 检查模型是否可用
        if (!AIService.isModelAvailable(modelId)) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                error: `Unknown model: ${modelId}. Use /api/codegen/models to get available models`
            };
            return;
        }

        try {
            console.log(`[CodeGenController] Init: modelId=${modelId}, stream=${stream}`);

            // 生成唯一 ID
            const chatId = projectId || uuidv4();
            const sessionId = uuidv4();

            // 保存用户消息
            await MessageModel.create({
                chat_id: chatId,
                project_id: projectId,
                user_id: user?.id || null,
                role: 'user',
                content: prompt,
                model_id: modelId
            });

            // 获取历史消息（最近 20 条）
            const history = await MessageModel.getRecentMessages(chatId, 20);
            const formattedHistory = MessageModel.formatForAI(history.slice(0, -1));

            // 流式响应
            if (stream) {
                await CodeGenController._streamResponse(ctx, {
                    chatId,
                    sessionId,
                    modelId,
                    prompt,
                    formattedHistory,
                    currentPage,
                    projectId,
                    user
                });
                return; // 重要：在流式响应后直接返回，不要继续执行
            }

            // 非流式响应
            const result = await aiService.generateCode(
                modelId,
                prompt,
                formattedHistory,
                currentPage,
                false
            );

            const files = result.files;
            console.log('[CodeGenController] AI generation result:', result);

            console.log(`[CodeGenController] Generated ${Object.keys(files).length} files`);

            // 直接保存文件到 .tmp/source/{chatId} 目录（不压缩）
            const sourceDir = path.join(TMP_DIR, sessionId,'source');
            await fs.ensureDir(sourceDir);

            // 写入所有文件
            for (const [filePath, content] of Object.entries(files)) {
                const fullPath = path.join(sourceDir, filePath);
                await fs.ensureDir(path.dirname(fullPath));
                await fs.writeFile(fullPath, content, 'utf-8');
            }

            // 确保必要的配置文件存在（如果 AI 没有生成）
            await ensureConfigFiles(sourceDir, files);

            console.log(`[CodeGenController] Files saved to ${sourceDir}`);

            // 生成文件名，从 package.json 的 name 字段提取
            let fileName = `codegen-${chatId}-${Date.now()}`;
            try {
                const packageJsonContent = files['package.json'];
                if (packageJsonContent) {
                    const packageJson = JSON.parse(packageJsonContent);
                    if (packageJson.name) {
                        fileName = packageJson.name;
                    }
                }
            } catch (error) {
                console.warn('[CodeGenController] Failed to extract name from package.json:', error);
            }

            // 保存 AI 响应消息
            const aiResponse = `Generated ${Object.keys(files).length} files`;
            await MessageModel.create({
                chat_id: chatId,
                project_id: projectId,
                user_id: user?.id || null,
                role: 'assistant',
                content: aiResponse,
                model_id: modelId,
                tokens_used: result.usage?.totalTokens
            });

            // 保存到数据库
            const db = await getDb();
            // uuid是最近一次构建的id
            await db.run(`
                INSERT INTO chat_record (drive_id, uuid, chat_content, create_time, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?)
            `, chatId, sessionId, JSON.stringify(files), Date.now(), user?.id || null, user?.username || user?.email || null);

            // 记录构建信息，target_path 改为 source 目录
            await db.run(`
                INSERT INTO build_record (file_name, target_path, is_processed, create_time, update_time, drive_id, id, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, fileName, sourceDir, 0, Date.now(), Date.now(), chatId, sessionId, user?.id || null, user?.username || user?.email || null);

            // 如果有项目 ID，更新项目信息
            if (projectId) {
                await ProjectModel.update(projectId, {
                    driveid: chatId,
                    files: JSON.stringify(Object.keys(files)),
                    chat_content: aiResponse
                });
            }


            // 返回响应
            ctx.body = {
                success: true,
                data: {
                    chatId,
                    sessionId,
                    fileName, // 添加文件名，用于 AI 识别和后续操作
                    files: Object.keys(files),
                    fileContents: files, // 添加文件内容以支持 Sandpack 预览
                    thinking: result.thinking || '', // 添加思考内容
                    sourcePath: sourceDir, // 源码目录路径
                    model: modelId,
                    usage: result.usage
                },
                message: 'Code generated successfully'
            };

        } catch (error) {
            console.error('[CodeGenController] Init error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 继续代码生成对话
     * POST /api/codegen/chat
     *
     * Body:
     * {
     *   "chatId": "xxx",          // 必需：聊天会话 ID
     *   "prompt": "添加暗色模式",
     *   "modelId": "claude-4.5",  // 可选：如果要切换模型
     *   "currentPage": "Settings", // 可选：当前页面上下文
     *   "stream": false           // 可选：是否流式响应
     * }
     */
    async chat(ctx) {
        const { chatId, prompt, modelId, projectId, currentPage, stream = false } = ctx.request.body;
        const user = ctx.state.user;

        // 参数验证
        if (!chatId) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                error: 'chatId is required'
            };
            return;
        }

        if (!prompt) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                error: 'prompt is required'
            };
            return;
        }

        try {
            // 获取历史消息以确定使用的模型
            const history = await MessageModel.getRecentMessages(chatId, 20);

            if (history.length === 0) {
                ctx.status = 404;
                ctx.body = {
                    success: false,
                    error: 'Chat session not found'
                };
                return;
            }

            // 使用指定的模型或历史对话中的模型
            const useModelId = modelId || history[history.length - 1].model_id;

            if (!AIService.isModelAvailable(useModelId)) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    error: `Unknown model: ${useModelId}`
                };
                return;
            }

            console.log(`[CodeGenController] Chat: chatId=${chatId}, modelId=${useModelId}, stream=${stream}`);

            // 检查用户是否有权访问此对话
            if (user && user.id) {
                const hasAccess = await MessageModel.userHasAccessToChat(user.id, chatId);
                if (!hasAccess) {
                    ctx.status = 403;
                    ctx.body = {
                        success: false,
                        error: 'You do not have permission to access this chat'
                    };
                    return;
                }
            }

            // 保存用户消息
            await MessageModel.create({
                chat_id: chatId,
                project_id: projectId,
                user_id: user?.id || null,
                role: 'user',
                content: prompt,
                model_id: useModelId
            });

            // 重新获取历史（包含刚保存的消息）
            const updatedHistory = await MessageModel.getRecentMessages(chatId, 20);
            const formattedHistory = MessageModel.formatForAI(updatedHistory.slice(0, -1));

            // 生成新的 sessionId
            const sessionId = uuidv4();

            // 流式响应
            if (stream) {
                await CodeGenController._streamResponse(ctx, {
                    chatId,
                    sessionId,
                    modelId: useModelId,
                    prompt,
                    formattedHistory,
                    currentPage,
                    projectId,
                    user
                });
                return; // 重要：在流式响应后直接返回，不要继续执行
            }

            // 非流式响应
            const result = await aiService.generateCode(
                useModelId,
                prompt,
                formattedHistory,
                currentPage,
                false
            );

            const files = result.files;

            // 直接保存文件到 .tmp/{chatId}/source 目录（不压缩）
            const sourceDir = path.join(TMP_DIR, sessionId, 'source');
            await fs.ensureDir(sourceDir);

            // 写入所有文件（覆盖更新）
            for (const [filePath, content] of Object.entries(files)) {
                const fullPath = path.join(sourceDir, filePath);
                await fs.ensureDir(path.dirname(fullPath));
                await fs.writeFile(fullPath, content, 'utf-8');
            }

            // 确保必要的配置文件存在
            await ensureConfigFiles(sourceDir, files);

            console.log(`[CodeGenController] Files updated in ${sourceDir}`);

            // 保存 AI 响应
            const aiResponse = `Updated with ${Object.keys(files).length} files`;
            await MessageModel.create({
                chat_id: chatId,
                project_id: projectId,
                user_id: user?.id || null,
                role: 'assistant',
                content: aiResponse,
                model_id: useModelId,
                tokens_used: result.usage?.totalTokens
            });

            // 更新数据库
            const db = await getDb();
            await db.run(`
                UPDATE chat_record
                SET chat_content = ?, update_time = ?
                WHERE drive_id = ?
            `, aiResponse, Date.now(), chatId);

            // 生成文件名，从 package.json 的 name 字段提取
            let fileName = `codegen-${chatId}-${Date.now()}`;
            try {
                const packageJsonContent = files['package.json'];
                if (packageJsonContent) {
                    const packageJson = JSON.parse(packageJsonContent);
                    if (packageJson.name) {
                        fileName = packageJson.name;
                    }
                }
            } catch (error) {
                console.warn('[CodeGenController] Failed to extract name from package.json:', error);
            }

            await db.run(`
                INSERT INTO build_record (file_name, target_path, is_processed, create_time, update_time, drive_id, id, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, fileName, sourceDir, 0, Date.now(), Date.now(), chatId, sessionId, user?.id || null, user?.username || user?.email || null);

            ctx.body = {
                success: true,
                data: {
                    chatId,
                    sessionId,
                    fileName, // 添加文件名，用于 AI 识别和后续操作
                    files: Object.keys(files),
                    fileContents: files, // 添加文件内容以支持 Sandpack 预览
                    thinking: result.thinking || '', // 添加思考内容
                    sourcePath: sourceDir, // 源码目录路径
                    model: useModelId,
                    usage: result.usage
                },
                message: 'Code updated successfully'
            };

        } catch (error) {
            console.error('[CodeGenController] Chat error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 处理流式响应（内部方法）
     * 新格式：解析 {"type":"think","content":"..."} 和 {"type":"code","content":"\"file.json\": \"...\""}
     */
    async _streamResponse(ctx, { chatId, sessionId, modelId, prompt, formattedHistory, currentPage, projectId, user }) {
        try {
            // 设置 SSE 响应头
            ctx.type = 'text/event-stream';
            ctx.set({
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Content-Type': 'text/event-stream',
                'X-Accel-Buffering': 'no' // 禁用 Nginx 缓冲
            });
            ctx.status = 200;

            // 发送初始化消息并立即刷新
            ctx.res.write(`data: ${JSON.stringify({
                type: 'init',
                chatId,
                sessionId,
                model: modelId
            })}\n\n`);

            // 强制刷新缓冲区
            if (ctx.res.flush) ctx.res.flush();

            // 获取流式响应
            const streamResult = await aiService.generateCode(
                modelId,
                prompt,
                formattedHistory,
                currentPage,
                true
            );

            console.log('[CodeGenController] Started streaming response');

            let fullContent = '';
            let buffer = ''; // 用于累积不完整的 JSON 对象
            const files = {}; // 存储解析出的文件

            // 流式发送文本，解析 JSON 格式的思考和代码
            for await (const chunk of streamResult.stream) {
                fullContent += chunk;
                buffer += chunk;

                // 尝试从 buffer 中提取完整的 JSON 对象
                const lines = buffer.split('\n');

                // 保留最后一行（可能不完整）
                buffer = lines.pop() || '';

                // 处理每一行
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    // 跳过 markdown 代码围栏行（模型有时会输出 ``` 或 ```json）
                    if (trimmedLine === '```' || trimmedLine.startsWith('```')) continue;

                    try {
                        // 尝试解析 JSON 对象
                        const parsed = JSON.parse(trimmedLine);

                        if (parsed.type === 'think') {
                            // 发送思考内容（前端只显示这个）
                            ctx.res.write(`data: ${JSON.stringify({
                                type: 'think',
                                content: parsed.content
                            })}\n\n`);
                            if (ctx.res.flush) ctx.res.flush();

                        } else if (parsed.type === 'code') {
                            // 解析代码文件 格式: "filename": "content"
                            const codeMatch = parsed.content.match(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/);
                            if (codeMatch) {
                                const fileName = codeMatch[1];
                                const fileContent = decodeUnicodeEscapes(
                                    codeMatch[2]
                                      .replace(/\\n/g, '\n')
                                      .replace(/\\t/g, '\t')
                                      .replace(/\\"/g, '"')
                                      .replace(/\\\\/g, '\\')
                                  );

                                files[fileName] = fileContent;

                                // 发送代码片段通知（前端不显示，但可以用于进度跟踪）
                                ctx.res.write(`data: ${JSON.stringify({
                                    type: 'code',
                                    fileName,
                                    progress: Object.keys(files).length
                                })}\n\n`);
                                if (ctx.res.flush) ctx.res.flush();
                            }
                        }
                    } catch (parseError) {
                        // 如果解析失败，可能是不完整的 JSON，将其加回 buffer
                        console.warn('[CodeGenController] Failed to parse line:', trimmedLine.substring(0, 100));
                    }
                }
            }

            // 处理剩余的 buffer
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer.trim());
                    if (parsed.type === 'think') {
                        ctx.res.write(`data: ${JSON.stringify({
                            type: 'think',
                            content: parsed.content
                        })}\n\n`);
                    } else if (parsed.type === 'code') {
                        const codeMatch = parsed.content.match(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/);
                        if (codeMatch) {
                            const fileName = codeMatch[1];
                            const fileContent = decodeUnicodeEscapes(
                                codeMatch[2]
                                  .replace(/\\n/g, '\n')
                                  .replace(/\\t/g, '\t')
                                  .replace(/\\"/g, '"')
                                  .replace(/\\\\/g, '\\')
                            );
                            files[fileName] = fileContent;
                        }
                    }
                } catch (e) {
                    console.warn('[CodeGenController] Failed to parse remaining buffer');
                }
            }

            console.log('[CodeGenController] Stream complete, processing files...');
            console.log(`[CodeGenController] Parsed ${Object.keys(files).length} files:`, Object.keys(files).join(', '));

            // 如果没有解析到文件，尝试使用原有的解析方法作为后备
            if (Object.keys(files).length === 0) {
                console.log('[CodeGenController] No files parsed from stream format, trying fallback parser...');
                try {
                    const fallbackFiles = aiService._parseCodeResponse.call(aiService, fullContent);
                    Object.assign(files, fallbackFiles);
                } catch (error) {
                    console.error('[CodeGenController] Fallback parser also failed:', error);
                }
            }

            // 直接保存文件到 .tmp/{sessionId}/source 目录（不压缩）
            const sourceDir = path.join(TMP_DIR, sessionId, 'source');
            await fs.ensureDir(sourceDir);

            // 写入所有文件
            for (const [filePath, content] of Object.entries(files)) {
                const fullPath = path.join(sourceDir, filePath);
                await fs.ensureDir(path.dirname(fullPath));
                await fs.writeFile(fullPath, content, 'utf-8');
            }

            // 确保必要的配置文件存在
            await ensureConfigFiles(sourceDir, files);

            console.log(`[CodeGenController] Stream files saved to ${sourceDir}`);

            // 获取 usage 数据
            const usageData = await streamResult.usage;

            // 生成文件名，从 package.json 的 name 字段提取
            let fileName = `codegen-${chatId}-${Date.now()}`;
            try {
                const packageJsonContent = files['package.json'];
                if (packageJsonContent) {
                    const packageJson = JSON.parse(packageJsonContent);
                    if (packageJson.name) {
                        fileName = packageJson.name;
                    }
                }
            } catch (error) {
                console.warn('[CodeGenController] Failed to extract name from package.json:', error);
            }

            // 保存 AI 响应消息
            await MessageModel.create({
                chat_id: chatId,
                project_id: projectId,
                user_id: user?.id || null,
                role: 'assistant',
                content: `Generated ${Object.keys(files).length} files`,
                model_id: modelId,
                tokens_used: usageData?.totalTokens
            });

            // 保存到数据库
            const db = await getDb();
            const aiResponse = `Generated ${Object.keys(files).length} files (stream)`;

            await db.run(`
                INSERT OR REPLACE INTO chat_record (drive_id, uuid, chat_content, create_time, update_time, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, chatId, sessionId, aiResponse, Date.now(), Date.now(), user?.id || null, user?.username || user?.email || null);

            // 记录构建信息，is_processed = 0 表示待构建
            await db.run(`
                INSERT INTO build_record (file_name, target_path, is_processed, create_time, update_time, drive_id, id, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, fileName, sourceDir, 0, Date.now(), Date.now(), chatId, sessionId, user?.id || null, user?.username || user?.email || null);

            // 如果有项目 ID，更新项目信息
            if (projectId) {
                await ProjectModel.update(projectId, {
                    driveid: chatId,
                    files: JSON.stringify(Object.keys(files)),
                    chat_content: aiResponse
                });
            }

            // 发送完成消息
            ctx.res.write(`data: ${JSON.stringify({
                type: 'complete',
                data: {
                    chatId,
                    sessionId,
                    fileName,
                    files: Object.keys(files),
                    fileContents: files,
                    sourcePath: sourceDir,
                    usage: usageData,
                    model: modelId
                }
            })}\n\n`);

            if (ctx.res.flush) ctx.res.flush();
            ctx.res.end();

        } catch (error) {
            console.error('[CodeGenController] Stream error:', error);
            ctx.res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            if (ctx.res.flush) ctx.res.flush();
            ctx.res.end();
        }
    },

    /**
     * 获取支持的模型列表
     * GET /api/codegen/models
     */
    async getModels(ctx) {
        try {
            const models = AIService.getSupportedModels();
            ctx.body = {
                success: true,
                models: models.map(m => ({
                    id: m.id,
                    provider: m.provider,
                    label: m.label || m.id,
                    maxTokens: m.maxTokens
                }))
            };
        } catch (error) {
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 获取聊天历史
     * GET /api/codegen/history?chatId=xxx
     */
    async getHistory(ctx) {
        try {
            const { chatId } = ctx.request.query;

            if (!chatId) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    error: 'chatId is required'
                };
                return;
            }

            const messages = await MessageModel.getByChatId(chatId);
            const stats = await MessageModel.getTokenStats(chatId);

            ctx.body = {
                success: true,
                data: {
                    messages,
                    stats
                }
            };
        } catch (error) {
            console.error('[CodeGenController] getHistory error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 获取会话统计信息
     * GET /api/codegen/stats?chatId=xxx
     */
    async getStats(ctx) {
        try {
            const { chatId } = ctx.request.query;

            if (!chatId) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    error: 'chatId is required'
                };
                return;
            }

            const stats = await MessageModel.getTokenStats(chatId);
            const messageCount = await MessageModel.getMessageCount(chatId);

            ctx.body = {
                success: true,
                data: {
                    chatId,
                    messageCount,
                    ...stats
                }
            };
        } catch (error) {
            console.error('[CodeGenController] getStats error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 删除聊天历史
     * DELETE /api/codegen/chat/:chatId
     */
    async deleteChat(ctx) {
        try {
            const { chatId } = ctx.params;
            const user = ctx.state.user;

            if (!chatId) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    error: 'chatId is required'
                };
                return;
            }

            // 检查用户是否有权删除此对话
            if (user && user.id) {
                const hasAccess = await MessageModel.userHasAccessToChat(user.id, chatId);
                if (!hasAccess) {
                    ctx.status = 403;
                    ctx.body = {
                        success: false,
                        error: 'You do not have permission to delete this chat'
                    };
                    return;
                }
            }

            await MessageModel.deleteByChatId(chatId);

            ctx.body = {
                success: true,
                message: 'Chat history deleted'
            };
        } catch (error) {
            console.error('[CodeGenController] deleteChat error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 获取用户的所有对话列表
     * GET /api/codegen/chats
     */
    async getUserChats(ctx) {
        try {
            const user = ctx.state.user;
            const { limit = 50, offset = 0 } = ctx.request.query;

            if (!user || !user.id) {
                ctx.status = 401;
                ctx.body = {
                    success: false,
                    error: 'Authentication required'
                };
                return;
            }

            const chats = await MessageModel.getUserChats(user.id, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const totalCount = await MessageModel.getUserChatCount(user.id);

            ctx.body = {
                success: true,
                data: {
                    chats,
                    total: totalCount,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            };
        } catch (error) {
            console.error('[CodeGenController] getUserChats error:', error);
            ctx.status = 500;
            ctx.body = {
                success: false,
                error: error.message
            };
        }
    }
};

export default CodeGenController;
