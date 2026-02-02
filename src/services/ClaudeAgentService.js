import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude Agent Service - 使用 Anthropic SDK 生成完整的 React 项目
 */
export class ClaudeAgentService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('Claude API key is required');
        }
        this.client = new Anthropic({
            apiKey: apiKey
        });
    }

    /**
     * 生成完整的 React 项目代码
     * @param {string} prompt - 用户需求描述
     * @returns {Promise<Object>} 包含所有文件的对象
     */
    async generateProject(prompt) {
        console.log('[ClaudeAgentService] Generating project for prompt:', prompt);

        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(prompt);

        try {
            const response = await this.client.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 8000,
                temperature: 0.7,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ]
            });

            // 解析 Claude 的响应，提取代码文件
            const files = this.parseClaudeResponse(response);

            console.log('[ClaudeAgentService] Generated files:', Object.keys(files));
            return files;

        } catch (error) {
            console.error('[ClaudeAgentService] Error generating project:', error);
            throw new Error(`Failed to generate project: ${error.message}`);
        }
    }

    /**
     * 构建系统提示词
     */
    buildSystemPrompt() {
        return `你是一个专业的前端开发专家，专门使用 React + TypeScript + Vite 创建完整的 Web 应用。

## 技术栈要求（严格遵守）
- React 19.2.3
- react-dom 19.2.3
- TypeScript 5.2.2
- Vite 5.0.0
- Tailwind CSS (内联方式，使用 Tailwind CDN)

## 重要规则
1. **不使用任何外部 npm 包**（除了 React 和 react-dom），所有功能都用原生实现
2. **使用 Tailwind CSS CDN** - 在 index.html 中引入 Tailwind CDN，不需要单独配置
3. **创建完整的、可运行的应用**
4. **代码要简洁、优雅、易读**
5. **所有文件必须完整，不能有省略**
6. **使用 TypeScript 编写，包含类型定义**

## 输出格式
你必须按照以下 JSON 格式输出所有文件：

\`\`\`json
{
  "src/App.tsx": "完整的 App 组件代码...",
  "src/main.tsx": "完整的入口文件代码...",
  "src/vite-env.d.ts": "类型声明文件...",
  "index.html": "完整的 HTML 文件，包含 Tailwind CDN...",
  "tsconfig.json": "TypeScript 配置...",
  "vite.config.ts": "Vite 配置..."
}
\`\`\`

## 文件模板

### index.html
\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>应用标题</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
\`\`\`

### src/main.tsx
\`\`\`tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
\`\`\`

### src/vite-env.d.ts
\`\`\`ts
/// <reference types="vite/client" />
\`\`\`

### tsconfig.json
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
\`\`\`

### tsconfig.node.json
\`\`\`json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
\`\`\`

### vite.config.ts
\`\`\`ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
});
\`\`\`

现在，根据用户的需求，生成完整的项目代码。记住：
1. 所有代码必须完整，不能省略
2. 使用 Tailwind CSS 的 utility classes 进行样式设计
3. 代码要有良好的用户体验和交互
4. 必须严格按照 JSON 格式输出`;
    }

    /**
     * 构建用户提示词
     */
    buildUserPrompt(userPrompt) {
        return `请创建一个完整的 React 应用：${userPrompt}

要求：
1. 使用 React Hooks（useState, useEffect 等）
2. 使用 Tailwind CSS 设计优美的界面
3. 实现完整的功能逻辑
4. 代码要有良好的结构和注释
5. 确保应用可以直接运行

请按照 JSON 格式输出所有文件的完整代码。`;
    }

    /**
     * 解析 Claude 的响应，提取文件内容
     */
    parseClaudeResponse(response) {
        const content = response.content[0].text;

        // 尝试从响应中提取 JSON
        // Claude 可能会在 ```json 代码块中返回
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);

        if (jsonMatch) {
            try {
                const files = JSON.parse(jsonMatch[1]);
                return this.validateAndFixFiles(files);
            } catch (error) {
                console.error('[ClaudeAgentService] Failed to parse JSON:', error);
            }
        }

        // 如果没有找到 JSON 代码块，尝试直接解析整个内容
        try {
            const files = JSON.parse(content);
            return this.validateAndFixFiles(files);
        } catch (error) {
            console.error('[ClaudeAgentService] Failed to parse response as JSON');
        }

        // 如果 JSON 解析失败，尝试手动提取代码块
        return this.extractCodeBlocks(content);
    }

    /**
     * 验证并修复文件结构
     */
    validateAndFixFiles(files) {
        const requiredFiles = {
            'index.html': this.getDefaultIndexHtml(),
            'src/main.tsx': this.getDefaultMainTsx(),
            'src/vite-env.d.ts': this.getDefaultViteEnv(),
            'tsconfig.json': this.getDefaultTsConfig(),
            'tsconfig.node.json': this.getDefaultTsConfigNode(),
            'vite.config.ts': this.getDefaultViteConfig(),
        };

        // 确保所有必需的文件都存在
        for (const [filename, defaultContent] of Object.entries(requiredFiles)) {
            if (!files[filename]) {
                console.log(`[ClaudeAgentService] Adding missing file: ${filename}`);
                files[filename] = defaultContent;
            }
        }

        // 确保 src/App.tsx 存在
        if (!files['src/App.tsx']) {
            console.log('[ClaudeAgentService] Adding default App.tsx');
            files['src/App.tsx'] = this.getDefaultAppTsx();
        }

        return files;
    }

    /**
     * 从文本中提取代码块
     */
    extractCodeBlocks(content) {
        const files = {};

        // 匹配代码块：```语言标识\n代码\n```
        const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
        let match;

        // 尝试识别文件名
        const lines = content.split('\n');
        let currentFile = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 查找文件名标记（如：### src/App.tsx 或 **src/App.tsx**）
            const fileMatch = line.match(/(?:###|##|\*\*)\s*([^\s*]+\.(tsx|ts|html|json))/i);
            if (fileMatch) {
                currentFile = fileMatch[1];
            }

            // 查找代码块开始
            if (line.match(/```/)) {
                const startIndex = i;
                let endIndex = -1;

                // 查找代码块结束
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].match(/```/)) {
                        endIndex = j;
                        break;
                    }
                }

                if (endIndex > startIndex && currentFile) {
                    const code = lines.slice(startIndex + 1, endIndex).join('\n');
                    files[currentFile] = code;
                    i = endIndex;
                    currentFile = null;
                }
            }
        }

        // 如果没有提取到任何文件，使用默认模板
        if (Object.keys(files).length === 0) {
            console.log('[ClaudeAgentService] No files extracted, using defaults');
            return this.getDefaultProjectFiles(content);
        }

        return this.validateAndFixFiles(files);
    }

    /**
     * 获取默认项目文件（使用 Claude 的响应作为 App 内容）
     */
    getDefaultProjectFiles(claudeResponse) {
        return {
            'index.html': this.getDefaultIndexHtml(),
            'src/main.tsx': this.getDefaultMainTsx(),
            'src/App.tsx': this.createAppFromResponse(claudeResponse),
            'src/vite-env.d.ts': this.getDefaultViteEnv(),
            'tsconfig.json': this.getDefaultTsConfig(),
            'tsconfig.node.json': this.getDefaultTsConfigNode(),
            'vite.config.ts': this.getDefaultViteConfig(),
        };
    }

    /**
     * 从响应创建 App 组件
     */
    createAppFromResponse(response) {
        return `import React, { useState } from 'react';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          应用生成成功
        </h1>
        <div className="prose">
          <p className="text-gray-600">
            Claude 已生成您的应用。请根据需求进一步完善。
          </p>
          <pre className="bg-gray-100 p-4 rounded mt-4 text-sm overflow-auto">
            {${JSON.stringify(response.substring(0, 200))}}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default App;`;
    }

    // ========== 默认文件模板 ==========

    getDefaultIndexHtml() {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>React App</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`;
    }

    getDefaultMainTsx() {
        return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
    }

    getDefaultAppTsx() {
        return `import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          欢迎使用 React
        </h1>
        <div className="mb-6">
          <button
            onClick={() => setCount(count + 1)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition duration-200 transform hover:scale-105"
          >
            点击次数: {count}
          </button>
        </div>
        <p className="text-gray-600">
          使用 React 19.2.3 + TypeScript + Vite + Tailwind CSS
        </p>
      </div>
    </div>
  );
}

export default App;`;
    }

    getDefaultViteEnv() {
        return `/// <reference types="vite/client" />`;
    }

    getDefaultTsConfig() {
        return JSON.stringify({
            "compilerOptions": {
                "target": "ES2020",
                "useDefineForClassFields": true,
                "lib": ["ES2020", "DOM", "DOM.Iterable"],
                "module": "ESNext",
                "skipLibCheck": true,
                "moduleResolution": "bundler",
                "allowImportingTsExtensions": true,
                "resolveJsonModule": true,
                "isolatedModules": true,
                "noEmit": true,
                "jsx": "react-jsx",
                "strict": true,
                "noUnusedLocals": true,
                "noUnusedParameters": true,
                "noFallthroughCasesInSwitch": true
            },
            "include": ["src"],
            "references": [{ "path": "./tsconfig.node.json" }]
        }, null, 2);
    }

    getDefaultTsConfigNode() {
        return JSON.stringify({
            "compilerOptions": {
                "composite": true,
                "skipLibCheck": true,
                "module": "ESNext",
                "moduleResolution": "bundler",
                "allowSyntheticDefaultImports": true
            },
            "include": ["vite.config.ts"]
        }, null, 2);
    }

    getDefaultViteConfig() {
        return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
});`;
    }
}
