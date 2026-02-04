/**
 * 统一的 AI 服务层 - 使用 Vercel AI SDK
 * 支持多个 AI 模型的动态切换（Claude, OpenAI, Google）
 * 代码量减少 70%，更简洁、专业
 */

import { streamText, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { CODE_GENERATION_SYSTEM_PROMPT, CODE_GENERATION_USER_PROMPT } from '../config/prompts.js';

/**
 * AI 模型配置 - 使用 Vercel AI SDK 的统一模型标识
 */
const MODEL_CONFIG = {
  
    // Google Gemini 模型 - 通过 prompt 引导思考过程
      'gemini-3-flash-preview': {
    provider: 'google',
    model: google('gemini-3-flash-preview'),
    maxTokens: 8192,
    supportsThinking: true // 通过 prompt 引导
  },

  'gemini-3-pro-preview': {
    provider: 'google',
    model: google('gemini-3-pro-preview'),
    maxTokens: 8192,
    supportsThinking: true // 通过 prompt 引导
  },


  // Claude 模型 - 支持 extended thinking
  'claude-4.5': {
    provider: 'anthropic',
    model: anthropic('claude-sonnet-4-5-20250929'),
    maxTokens: 8192,
    supportsThinking: true, // Claude 原生支持 extended thinking
    thinkingConfig: {
      // 如果 Anthropic API 支持，可以在这里配置 thinking 相关参数
      // 目前通过 prompt 引导即可
    }
  },


  // OpenAI 模型 - 通过 prompt 引导思考过程
  // 'gpt-4o': {
  //   provider: 'openai',
  //   model: openai('gpt-4o'),
  //   maxTokens: 8192,
  //   supportsThinking: false
  // },
  // 'gpt-4-turbo': {
  //   provider: 'openai',
  //   model: openai('gpt-4-turbo'),
  //   maxTokens: 8192,
  //   supportsThinking: false
  // }
};

/**
 * 统一的 AI 服务类 - 使用 Vercel AI SDK
 */
export class AIService {
  constructor(apiKeys = {}) {
    // 设置环境变量（Vercel AI SDK 会自动读取）
    if (apiKeys.anthropic) {
      process.env.ANTHROPIC_API_KEY = apiKeys.anthropic;
    }
    if (apiKeys.google) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
      process.env.GEMINI_API_KEY = apiKeys.google;
    }
    if (apiKeys.openai) {
      process.env.OPENAI_API_KEY = apiKeys.openai;
    }
  }

  /**
   * 生成代码项目
   * @param {string} modelId - 模型 ID（如 'claude-4.5', 'gemini-3-pro'）
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

    const { model, maxTokens } = config;

    console.log(`[AIService] Using model: ${modelId} (provider: ${config.provider})`);

    // 构建消息历史
    const messages = this._buildMessages(history, userPrompt, currentPage);

    if (stream) {
      // 流式响应
      return this._generateStream(model, messages, maxTokens);
    } else {
      // 非流式响应
      return this._generateText(model, messages, maxTokens);
    }
  }

  /**
   * 非流式生成
   */
  async _generateText(model, messages, maxTokens) {
    try {
      const result = await generateText({
        model,
        system: CODE_GENERATION_SYSTEM_PROMPT,
        messages,
        maxTokens,
        temperature: 0.7
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
  async _generateStream(model, messages, maxTokens) {
    try {
      // 构建请求配置
      const config = {
        model,
        system: CODE_GENERATION_SYSTEM_PROMPT,
        messages,
        maxTokens,
        temperature: 0.7
      };

      // 如果模型支持 extended thinking，可以在这里添加额外配置
      // 例如对于 Claude: config.thinking = { enabled: true, budget_tokens: 1000 }
      // 注意：具体参数取决于 Vercel AI SDK 和模型提供商的支持

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
   * 解析 AI 响应，提取代码文件
   * 支持多种格式：JSON、代码块、Markdown
   */
  _parseCodeResponse(content) {
    try {
      // 添加调试日志
      console.log('[AIService] Parsing response, content length:', content.length);
      console.log('[AIService] First 500 chars:', content.substring(0, 500));

      // 方法 1: 尝试解析 JSON 格式
      const jsonMatch = content.match(/\{[\s\S]*"files"[\s\S]*\}/);
      if (jsonMatch) {
        console.log('[AIService] Found JSON format, attempting to parse...');
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.files && typeof parsed.files === 'object') {
          console.log('[AIService] Successfully parsed JSON format with', Object.keys(parsed.files).length, 'files');
          return parsed.files;
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

      console.log(`[AIService] Parsed ${Object.keys(files).length} files:`, Object.keys(files).join(', '));

      return files;
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
      maxTokens: MODEL_CONFIG[id].maxTokens
    }));
  }

  /**
   * 检查模型是否可用
   */
  static isModelAvailable(modelId) {
    return modelId in MODEL_CONFIG;
  }

  /**
   * 检查模型是否原生支持思考功能
   */
  static supportsThinking(modelId) {
    return MODEL_CONFIG[modelId]?.supportsThinking || false;
  }

  /**
   * 获取模型的思考配置
   */
  static getThinkingConfig(modelId) {
    return MODEL_CONFIG[modelId]?.thinkingConfig || {};
  }
}

export default AIService;
