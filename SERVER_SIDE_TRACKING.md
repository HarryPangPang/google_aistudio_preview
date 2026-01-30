# 服务端游戏访问统计

## 概述

游戏访问统计现在在**服务端**自动进行，每次用户访问游戏部署页面时都会被记录。

## 工作原理

### 1. 分享链接格式

当用户点击"分享"按钮时，生成的链接格式为：

```
http://localhost:5173/deployments/{gameId}/?shared_by={userId}
```

例如：
```
http://localhost:5173/deployments/1bbae0ff-d477-416b-8d7b-0646c1db2ef7/?shared_by=123
```

### 2. 服务端拦截

在 [PreviewController.js](src/controllers/PreviewController.js:58-67) 中，当用户访问部署页面时：

```javascript
// Track game access if this is the initial page load with shared_by parameter
if (cleanPath === 'index.html' && ctx.query.shared_by) {
    try {
        const sharedBy = ctx.query.shared_by;
        await GameStatsModel.trackClick(id, sharedBy);
        console.log(`[PreviewController] Tracked deployment access: gameId=${id}, sharedBy=${sharedBy}`);
    } catch (error) {
        console.error('[PreviewController] Failed to track deployment access:', error);
        // Don't block the request if tracking fails
    }
}
```

### 3. 统计记录

每次访问会记录到数据库：

```sql
INSERT INTO game_stats (game_id, shared_by, clicked_at, created_at)
VALUES ('1bbae0ff-d477-416b-8d7b-0646c1db2ef7', '123', 1706601234567, 1706601234567)
```

## 统计场景

### 场景1：通过分享链接访问

```
用户A在游戏市场点击分享按钮
→ 生成链接：/deployments/game-123/?shared_by=userA
→ 用户B点击链接
→ 服务端检测到 shared_by=userA 参数
→ 自动记录：game-123 被访问，来自 userA 的分享
→ 返回游戏页面给用户B
```

### 场景2：直接访问（无分享者）

```
用户直接访问：/deployments/game-123/
→ 服务端检测到没有 shared_by 参数
→ 不记录统计（或者记录为直接访问）
→ 返回游戏页面
```

### 场景3：从游戏市场点击

```
用户在游戏市场点击"开始游戏"
→ 打开：/deployments/game-123/
→ 没有 shared_by 参数
→ 不记录统计
→ 返回游戏页面
```

## 优势

### 1. 准确性
- ✅ 每次实际访问游戏页面都被记录
- ✅ 不会遗漏任何访问
- ✅ 不依赖客户端JavaScript

### 2. 安全性
- ✅ 统计在服务端进行，无法被客户端篡改
- ✅ 即使用户禁用JavaScript，统计仍然有效

### 3. 简洁性
- ✅ 前端代码更简单，只负责生成分享链接
- ✅ 统计逻辑集中在服务端

### 4. 可靠性
- ✅ 统计失败不会影响页面正常加载
- ✅ 错误处理在服务端统一管理

## 前端实现

### 分享按钮 ([GameMarket.tsx](../google_aistudio_playground/src/pages/market/GameMarket.tsx:93-103))

```typescript
const handleShare = (game: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const gameId = game.id;
    const userId = user?.id || '';
    const baseUrl = window.location.origin;
    // 直接分享游戏部署页面的链接，带上分享者ID
    const url = `${baseUrl}/deployments/${gameId}/?shared_by=${userId}`;
    setShareUrl(url);
    setCurrentGameId(gameId);
    setShareModalOpen(true);
    setCopied(false);
};
```

### 打开游戏 ([GameMarket.tsx](../google_aistudio_playground/src/pages/market/GameMarket.tsx:74-77))

```typescript
const handlePlayGame = (id: string) => {
    // Tracking is now handled server-side when the deployment page loads
    window.open(`/deployments/${id}/`, '_blank');
};
```

## 后端实现

### PreviewController ([PreviewController.js](src/controllers/PreviewController.js))

```javascript
import { GameStatsModel } from '../models/GameStatsModel.js';

async serve(ctx, next) {
    // ... 其他代码 ...

    // Track game access if this is the initial page load with shared_by parameter
    if (cleanPath === 'index.html' && ctx.query.shared_by) {
        try {
            const sharedBy = ctx.query.shared_by;
            await GameStatsModel.trackClick(id, sharedBy);
            console.log(`[PreviewController] Tracked deployment access: gameId=${id}, sharedBy=${sharedBy}`);
        } catch (error) {
            console.error('[PreviewController] Failed to track deployment access:', error);
            // Don't block the request if tracking fails
        }
    }

    // ... 继续处理请求 ...
}
```

## 查看统计

### 基础统计

```bash
# 获取游戏的总访问次数
curl http://localhost:80/api/game/stats/1bbae0ff-d477-416b-8d7b-0646c1db2ef7 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

响应：
```json
{
  "success": true,
  "data": {
    "gameId": "1bbae0ff-d477-416b-8d7b-0646c1db2ef7",
    "playCount": 42
  }
}
```

### 详细统计

```bash
# 获取游戏的详细统计（包括分享来源分析）
curl http://localhost:80/api/game/stats/1bbae0ff-d477-416b-8d7b-0646c1db2ef7/detailed \
  -H "Authorization: Bearer YOUR_TOKEN"
```

响应：
```json
{
  "success": true,
  "data": {
    "gameId": "1bbae0ff-d477-416b-8d7b-0646c1db2ef7",
    "totalPlays": 42,
    "directPlays": 15,
    "sharedPlays": 27,
    "shareBreakdown": [
      {
        "sharedBy": "user-123",
        "count": 20
      },
      {
        "sharedBy": "user-456",
        "count": 7
      }
    ]
  }
}
```

### 用户分享统计

```bash
# 查看某个用户的分享贡献
curl http://localhost:80/api/game/user/user-123/shares \
  -H "Authorization: Bearer YOUR_TOKEN"
```

响应：
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "totalShares": 3,
    "totalPlaysFromShares": 52,
    "games": [
      {
        "gameId": "game-abc",
        "playsFromShare": 20
      },
      {
        "gameId": "game-def",
        "playsFromShare": 25
      },
      {
        "gameId": "game-xyz",
        "playsFromShare": 7
      }
    ]
  }
}
```

## 日志输出

服务端会输出日志：

```bash
# 成功记录统计
[PreviewController] Tracked deployment access: gameId=1bbae0ff-d477-416b-8d7b-0646c1db2ef7, sharedBy=123

# 统计失败（不影响页面加载）
[PreviewController] Failed to track deployment access: Error: Database connection failed
```

## 测试

### 测试分享链接

1. 启动服务器：
```bash
cd /Users/construct/Documents/mine/ai_studio/google_aistudio_preview
npm run dev
```

2. 访问游戏市场，点击分享按钮

3. 复制分享链接，在新标签页打开

4. 检查服务器日志，应该看到：
```
[PreviewController] Tracked deployment access: gameId=..., sharedBy=...
```

5. 查询统计API，验证数据已记录

### 测试直接访问

1. 直接访问：`http://localhost:5173/deployments/game-123/`

2. 服务器不会输出统计日志（因为没有 shared_by 参数）

3. 页面正常加载

## 注意事项

1. **URL参数**: `shared_by` 必须作为URL参数传递，不能在hash中
   - ✅ 正确：`/deployments/game-123/?shared_by=user`
   - ❌ 错误：`/deployments/game-123/#?shared_by=user`

2. **index.html检测**: 只在请求 `index.html` 时记录统计，避免重复
   - 静态资源（CSS、JS、图片）不会触发统计

3. **错误处理**: 统计失败不会阻塞页面加载
   - 用户体验优先

4. **认证**: API查询统计需要认证token
   - 但访问游戏页面本身不需要认证

## 数据库查询

直接查询统计数据：

```bash
# 连接到数据库
sqlite3 /Users/construct/Documents/mine/ai_studio/google_aistudio_preview/database/deployments.db

# 查询所有统计记录
SELECT * FROM game_stats ORDER BY clicked_at DESC LIMIT 10;

# 查询特定游戏的统计
SELECT COUNT(*) as total_plays FROM game_stats WHERE game_id = '1bbae0ff-d477-416b-8d7b-0646c1db2ef7';

# 查询分享来源
SELECT shared_by, COUNT(*) as count FROM game_stats
WHERE game_id = '1bbae0ff-d477-416b-8d7b-0646c1db2ef7'
GROUP BY shared_by;
```

## 未来优化

1. **去重**: 可以基于IP或用户ID去重，避免重复刷新计数
2. **时间范围**: 添加时间范围查询（今日、本周、本月）
3. **地域分析**: 记录用户地理位置
4. **设备统计**: 记录访问设备类型
5. **会话追踪**: 记录用户游戏时长
