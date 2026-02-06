/**
 * 统一的 AI 服务层 - 使用 Vercel AI SDK
 * 支持多个 AI 模型的动态切换（Claude, OpenAI, Google）
 * 代码量减少 70%，更简洁、专业
 */

import { streamText, generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { CODE_GENERATION_SYSTEM_PROMPT, CODE_GENERATION_USER_PROMPT, CODE_GENERATION_SYSTEM_PROMPT_STREAM } from '../config/prompts.js';

// 使用 /v1 路径，避免 ANTHROPIC_BASE_URL 被设为 https://api.anthropic.com 时请求发往 /messages 导致 404
const anthropic = createAnthropic({
  baseURL: 'https://api.anthropic.com/v1',
});

/**
 * AI 模型配置 - 使用 Vercel AI SDK 的统一模型标识
 */
const MODEL_CONFIG = {
  
  'gemini-3-flash-preview': {
    provider: 'google',
    model: google('gemini-3-flash-preview'),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: 'high',
          includeThoughts: true,
        },
      },
    },
  },

  'gemini-3-pro-preview': {
    provider: 'google',
    model: google('gemini-3-pro-preview'),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: 'high',
          includeThoughts: true,
        },
      },
    },
  },


  // Claude Sonnet 4.5（若报 Not Found 请用 claude-sonnet-4-20250514 或检查 API 账号可用模型 GET /v1/models）
  'claude-opus-4-6': {
    provider: 'anthropic',
    model: anthropic('claude-opus-4-6'),
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      },
    },
  },
  // 备用：Claude 3.5 Sonnet，兼容性更好
  'claude-sonnet-4-20250514': {
    provider: 'anthropic',
    model: anthropic('claude-sonnet-4-20250514'),
    providerOptions: {
      anthropic: {},
    },
  },


  // OpenAI 模型 - 通过 prompt 引导思考过程
  // 'gpt-4o': {
  //   provider: 'openai',
  //   model: openai('gpt-4o'),
  // },
  // 'gpt-4-turbo': {
  //   provider: 'openai',
  //   model: openai('gpt-4-turbo'),
  // }
};

/**
 * 统一的 AI 服务类 - 使用 Vercel AI SDK
 */
export class AIService {
  constructor(apiKeys = {}) {
    // 设置环境变量（Vercel AI SDK 会自动读取）
    if (apiKeys.anthropic) {
      console.log('anthropic', apiKeys.anthropic);
      process.env.ANTHROPIC_API_KEY = apiKeys.anthropic;
    }
    if (apiKeys.google) {
      console.log('google', apiKeys.google);
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
      process.env.GEMINI_API_KEY = apiKeys.google;
    }
    if (apiKeys.openai) {
      process.env.OPENAI_API_KEY = apiKeys.openai;
    }
  }

  /**
   * 生成代码项目
   * @param {string} modelId - 模型 ID（如 'claude-opus-4-6', 'gemini-3-pro'）
   * @param {string} userPrompt - 用户输入的需求
   * @param {Array} history - 历史对话记录
   * @param {string} currentPage - 当前页面上下文
   * @param {boolean} stream - 是否流式输出
   * @returns {Promise<Object>} 生成的文件结构或流
   */
  async generateCode(modelId, userPrompt, history = [], currentPage = null, stream = false) {
    const config = MODEL_CONFIG[modelId];
    if (!config) {
      throw new Error(`Unknown model: ${modelId}. Supported models: ${Object.keys(MODEL_CONFIG).join(', ')}`);
    }

    const { model } = config;

    console.log(`[AIService] Using model: ${modelId} (provider: ${config.provider})`);

    // 构建消息历史
    const messages = this._buildMessages(history, userPrompt, currentPage);

    if (stream) {
      // 流式响应
      return this._generateStream(model, messages, config);
    } else {
      return {
        files: {},
        thinking: '',
        usage: {
          totalTokens: 0
        },
        finishReason: 'stop'
      };
      // 非流式响应
      return this._generateText(model, messages, config);
    }
  }

  /**
   * 非流式生成 暂时不用但是保留
   */
  async _generateText(model, messages, restConfig = {}) {
    try {
      const result = await generateText({
        model,
        system: CODE_GENERATION_SYSTEM_PROMPT,
        messages,
        temperature: 0.8,
        ...restConfig
      });

      console.log(`[AIService] Generated text, tokens used: ${result.usage?.totalTokens || 'unknown'}`);

      // 提取思考内容（如果存在）
      let thinking = '';
      let cleanedText = result.text;

      const thinkingMatch = result.text.match(/<thinking>([\s\S]*?)<\/thinking>/);
      if (thinkingMatch) {
        thinking = thinkingMatch[1].trim();
        // 移除思考标签，只保留代码内容
        cleanedText = result.text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
        console.log('[AIService] Extracted thinking content:', thinking.substring(0, 100) + '...');
      }

      // 解析生成的代码
      const files = this._parseCodeResponse(cleanedText);

      return {
        files,
        thinking, // 添加思考内容
        usage: result.usage,
        finishReason: result.finishReason
      };
    } catch (error) {
      console.error('[AIService] Generate text error:', error);
      throw new Error(`Failed to generate code: ${error.message}`);
    }
  }

  /**
   * 流式生成
   */
  async _generateStream(model, messages, restConfig = {}) {
    try {
      const config = {
        model,
        system: CODE_GENERATION_SYSTEM_PROMPT_STREAM,
        messages,
        temperature: 0.8,
        ...restConfig
      };
      console.log('[AIService] Stream config :', config);

      const result = streamText(config);

      console.log('[AIService] Started streaming response');

      // 返回流式迭代器
      return {
        stream: result.textStream,
        fullText: result.text, // Promise that resolves to full text
        usage: result.usage,   // Promise that resolves to usage stats

        // 便捷方法：将流转换为 Koa 响应
        async toKoaResponse(ctx) {
          ctx.type = 'text/event-stream';
          ctx.set({
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          let fullContent = '';

          // 流式发送数据
          for await (const chunk of result.textStream) {
            fullContent += chunk;
            ctx.res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
          }

          // 发送完成信号
          const files = this._parseCodeResponse(fullContent);
          const usageData = await result.usage;

          ctx.res.write(`data: ${JSON.stringify({
            type: 'complete',
            files: Object.keys(files),
            usage: usageData
          })}\n\n`);

          ctx.res.end();

          return { files, fullContent, usage: usageData };
        }
      };
    } catch (error) {
      console.error('[AIService] Stream error:', error);
      throw new Error(`Failed to stream code generation: ${error.message}`);
    }
  }

  /**
   * 构建消息数组
   */
  _buildMessages(history, currentPrompt, currentPage) {
    // 格式化历史消息
    const messages = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 添加当前用户消息
    messages.push({
      role: 'user',
      content: CODE_GENERATION_USER_PROMPT(currentPrompt, currentPage)
    });

    return messages;
  }

  /**
   * 规范化 files 键名，确保 src/ 下的文件被 ensureConfigFiles 正确识别
   * 例如 Gemini 可能返回 "App.jsx" 而非 "src/App.jsx"
   */
  _normalizeFileKeys(files) {
    const normalized = { ...files };
    const srcOnly = ['App.jsx', 'App.css', 'index.jsx'];
    for (const name of srcOnly) {
      if (normalized[name] != null && normalized[`src/${name}`] == null) {
        normalized[`src/${name}`] = normalized[name];
        delete normalized[name];
      }
    }
    return normalized;
  }

  /**
   * 解析 AI 响应，提取代码文件
   * 支持多种格式：JSON、代码块、Markdown（含 Gemini 的 ```json 包裹）
   */
  _parseCodeResponse(content) {
    try {
      // 添加调试日志
      console.log('[AIService] Parsing response, content length:', content.length);
      console.log('[AIService] First 500 chars:', content.substring(0, 500));

      // 优先从 markdown 代码块中提取 JSON（Gemini 常把整段输出放在 ```json ... ``` 里）
      let jsonContent = content;
      const allCodeBlocks = content.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g);
      for (const block of allCodeBlocks) {
        const inner = block[1].trim();
        if (inner.includes('"files"')) {
          jsonContent = inner;
          console.log('[AIService] Extracted JSON from code block');
          break;
        }
      }

      // 方法 1: 尝试解析 JSON 格式
      const jsonMatch = jsonContent.match(/\{[\s\S]*"files"[\s\S]*\}/);
      if (jsonMatch) {
        console.log('[AIService] Found JSON format, attempting to parse...');
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.files && typeof parsed.files === 'object') {
            const files = this._normalizeFileKeys(parsed.files);
            console.log('[AIService] Successfully parsed JSON format with', Object.keys(files).length, 'files');
            return files;
          }
        } catch (parseErr) {
          console.warn('[AIService] JSON.parse failed, trying next method:', parseErr.message);
        }
      }

      console.log('[AIService] JSON format not found, trying code blocks...');

      // 方法 2: 解析代码块
      const files = {};
      const codeBlockRegex = /```(?:[\w]+)?\s*\n([\s\S]*?)```/g;
      let match;
      let fileIndex = 0;

      while ((match = codeBlockRegex.exec(content)) !== null) {
        const codeContent = match[1].trim();

        // 尝试从代码块前面提取文件名
        const beforeBlock = content.substring(Math.max(0, match.index - 200), match.index);
        const fileNameMatch = beforeBlock.match(/(?:文件名?[:：]?\s*|File:\s*|Path:\s*)`?([^`\n]+?\.[\w]+)`?/i);

        let fileName = fileNameMatch ? fileNameMatch[1].trim() : null;

        // 如果没有找到文件名，根据内容推断
        if (!fileName) {
          if (codeContent.includes('"name":') && codeContent.includes('"version":') && codeContent.includes('"dependencies"')) {
            fileName = 'package.json';
          } else if (codeContent.includes('compilerOptions') && codeContent.includes('"target"')) {
            fileName = 'tsconfig.json';
          } else if (codeContent.includes('<!DOCTYPE html>') || codeContent.includes('<html')) {
            fileName = 'index.html';
          } else if (codeContent.includes('defineConfig') && codeContent.includes('vite')) {
            fileName = 'vite.config.ts';
          } else if (codeContent.includes('import React') || codeContent.includes('from \'react\'') || codeContent.includes('from "react"')) {
            // 尝试从导入语句或组件名推断
            const componentMatch = codeContent.match(/(?:function|const|class)\s+(\w+)/);
            const componentName = componentMatch ? componentMatch[1] : `Component${fileIndex}`;
            fileName = `src/components/${componentName}.tsx`;
          } else if (codeContent.includes('export') && (codeContent.includes('function') || codeContent.includes('class'))) {
            fileName = `src/file-${fileIndex}.ts`;
          } else {
            fileName = `file-${fileIndex}.txt`;
          }
          fileIndex++;
        }

        // 避免重复文件名
        let finalFileName = fileName;
        let counter = 1;
        while (files[finalFileName]) {
          const ext = fileName.substring(fileName.lastIndexOf('.'));
          const base = fileName.substring(0, fileName.lastIndexOf('.'));
          finalFileName = `${base}-${counter}${ext}`;
          counter++;
        }

        files[finalFileName] = codeContent;
      }

      console.log('[AIService] Found', Object.keys(files).length, 'code blocks');

      if (Object.keys(files).length === 0) {
        console.error('[AIService] No files found! Response preview:', content.substring(0, 1000));
        throw new Error('No code files found in AI response. Please try again with a more specific prompt.');
      }

      const normalized = this._normalizeFileKeys(files);
      console.log(`[AIService] Parsed ${Object.keys(normalized).length} files:`, Object.keys(normalized).join(', '));

      return normalized;
    } catch (error) {
      console.error('[AIService] Failed to parse code response:', error);
      console.error('[AIService] Content preview:', content.substring(0, 2000));
      throw error; // Re-throw the original error
    }
  }

  /**
   * 获取支持的模型列表
   */
  static getSupportedModels() {
    return Object.keys(MODEL_CONFIG).map(id => ({
      id,
      provider: MODEL_CONFIG[id].provider,
      label: id,
    }));
  }

  /**
   * 检查模型是否可用
   */
  static isModelAvailable(modelId) {
    return modelId in MODEL_CONFIG;
  }



}

export default AIService;
