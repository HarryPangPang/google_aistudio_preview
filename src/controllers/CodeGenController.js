/**
 * 代码生成控制器 - 使用 Vercel AI SDK
 * 这是全新的架构，支持多模型、流式响应、历史对话管理
 * 与 GenerateController 并存，互不影响
 */

import { getDb } from '../db/index.js';
import { AIService } from '../services/AIService.js';
import { MessageModel } from '../models/MessageModel.js';
import { ProjectModel } from '../models/ProjectModel.js';
import { BuildService } from '../services/BuildService.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs-extra';
import { TMP_DIR } from '../config/constants.js';

// 初始化 AI Service（使用 Vercel AI SDK）
const aiService = new AIService({
    anthropic: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
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

    // 检查并添加 vite.config.ts（如果不存在）
    if (!fileList.some(f => f.includes('vite.config'))) {
        console.log('[CodeGenController] Adding default vite.config.ts');
        const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        // 忽略某些警告
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      }
    }
  },
  esbuild: {
    // 忽略 TypeScript 检查错误
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  }
});`;
        await fs.writeFile(path.join(sourceDir, 'vite.config.ts'), viteConfig);
    }

    // 检查并添加 tsconfig.json（如果不存在）
    if (!fileList.some(f => f === 'tsconfig.json' || f.endsWith('/tsconfig.json'))) {
        console.log('[CodeGenController] Adding default tsconfig.json');
        const tsConfig = {
            compilerOptions: {
                target: "ES2020",
                useDefineForClassFields: true,
                lib: ["ES2020", "DOM", "DOM.Iterable"],
                module: "ESNext",
                skipLibCheck: true,
                moduleResolution: "bundler",
                allowImportingTsExtensions: true,
                resolveJsonModule: true,
                isolatedModules: true,
                noEmit: true,
                jsx: "react-jsx",
                strict: false,
                noUnusedLocals: false,
                noUnusedParameters: false,
                paths: { "@/*": ["./src/*"] }
            },
            include: ["src"]
        };
        await fs.writeFile(
            path.join(sourceDir, 'tsconfig.json'),
            JSON.stringify(tsConfig, null, 2)
        );
    }

    // 检查并添加 tsconfig.node.json（如果不存在）
    if (!fileList.some(f => f.includes('tsconfig.node'))) {
        console.log('[CodeGenController] Adding default tsconfig.node.json');
        const tsConfigNode = {
            compilerOptions: {
                composite: true,
                skipLibCheck: true,
                module: "ESNext",
                moduleResolution: "bundler",
                allowSyntheticDefaultImports: true
            },
            include: ["vite.config.ts"]
        };
        await fs.writeFile(
            path.join(sourceDir, 'tsconfig.node.json'),
            JSON.stringify(tsConfigNode, null, 2)
        );
    }

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
    <script type="module" src="/src/index.tsx"></script>
</body>
</html>`;
        await fs.writeFile(path.join(sourceDir, 'index.html'), indexHtml);
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

            // 流式响应 暂时关闭，代码保留
            if (false) {
                return await CodeGenController._streamResponse(ctx, {
                    chatId,
                    sessionId,
                    modelId,
                    prompt,
                    formattedHistory,
                    currentPage,
                    projectId,
                    user
                });
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
                        // 生成文件名，用于标识这个代码包
            const fileName = `codegen-${chatId}-${Date.now()}`;

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
            await db.run(`
                INSERT INTO chat_record (drive_id, uuid, chat_content, create_time, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?)
            `, chatId, sessionId, files, Date.now(), user?.id || null, user?.username || user?.email || null);

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
                return await CodeGenController._streamResponse(ctx, {
                    chatId,
                    sessionId,
                    modelId: useModelId,
                    prompt,
                    formattedHistory,
                    currentPage,
                    projectId,
                    user
                });
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
             // 生成文件名，用于标识这个代码包
            const fileName = `codegen-${chatId}-${Date.now()}`;
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
     */
    async _streamResponse(ctx, { chatId, sessionId, modelId, prompt, formattedHistory, currentPage, projectId, user }) {
        try {
            // 设置 SSE 响应头
            ctx.type = 'text/event-stream';
            ctx.set({
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Content-Type': 'text/event-stream'
            });

            // 发送初始化消息
            ctx.res.write(`data: ${JSON.stringify({
                type: 'init',
                chatId,
                sessionId,
                model: modelId
            })}\n\n`);

            // 获取流式响应
            const streamResult = await aiService.generateCode(
                modelId,
                prompt,
                formattedHistory,
                currentPage,
                true
            );
            console.log('[CodeGenController] Started streaming response', streamResult);
            let fullContent = '';
            let lastSentThinkingLength = 0;
            let lastSentCodeLength = 0;

            // 流式发送文本，分离思考过程和代码内容
            for await (const chunk of streamResult.stream) {
                fullContent += chunk;

                // 提取思考内容（如果存在 <thinking> 标签）
                const thinkingMatch = fullContent.match(/<thinking>([\s\S]*?)(?:<\/thinking>)?/);
                if (thinkingMatch) {
                    const thinkingText = thinkingMatch[1];
                    // 只发送新增的思考内容
                    if (thinkingText.length > lastSentThinkingLength) {
                        const newThinkingContent = thinkingText.substring(lastSentThinkingLength);
                        ctx.res.write(`data: ${JSON.stringify({ type: 'thinking', content: newThinkingContent })}\n\n`);
                        lastSentThinkingLength = thinkingText.length;
                    }
                }

                // 提取代码内容（移除思考标签）
                const codeContent = fullContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').replace(/<thinking>[\s\S]*$/g, '');
                // 只发送新增的代码内容
                if (codeContent.length > lastSentCodeLength) {
                    const newCodeContent = codeContent.substring(lastSentCodeLength);
                    if (newCodeContent.trim()) {
                        ctx.res.write(`data: ${JSON.stringify({ type: 'text', content: newCodeContent })}\n\n`);
                    }
                    lastSentCodeLength = codeContent.length;
                }
            }

            // 清理最终内容，移除思考标签
            fullContent = fullContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();

            // 解析完整内容
            const files = aiService._parseCodeResponse.call(aiService, fullContent);

            // 直接保存文件到 .tmp/source/{chatId} 目录（不压缩）
            const sourceDir = path.join(TMP_DIR, chatId, 'source');
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

            // 保存 AI 响应消息
            await MessageModel.create({
                chat_id: chatId,
                project_id: projectId,
                user_id: user?.id || null,
                role: 'assistant',
                content: fullContent,
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

            await db.run(`
                INSERT INTO build_record (file_name, target_path, is_processed, create_time, update_time, drive_id, id, user_id, username)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, fileName, sourceDir, 1, Date.now(), Date.now(), chatId, sessionId, user?.id || null, user?.username || user?.email || null);

            // 如果有项目 ID，更新项目信息
            if (projectId) {
                await ProjectModel.update(projectId, {
                    driveid: chatId,
                    files: JSON.stringify(Object.keys(files)),
                    chat_content: aiResponse
                });
            }

            // 生成文件名，用于标识这个代码包
            const fileName = `codegen-${chatId}-${Date.now()}`;

            // 发送完成消息
            ctx.res.write(`data: ${JSON.stringify({
                type: 'complete',
                data: {
                    chatId,
                    sessionId,
                    fileName, // 添加文件名，用于 AI 识别和后续操作
                    files: Object.keys(files),
                    fileContents: files, // 添加文件内容以支持 Sandpack 预览
                    sourcePath: sourceDir,
                    usage: usageData,
                    model: modelId
                }
            })}\n\n`);

            ctx.res.end();

        } catch (error) {
            console.error('[CodeGenController] Stream error:', error);
            ctx.res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
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
