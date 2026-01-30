# 游戏统计 API 文档

## 概述

游戏统计API提供了追踪游戏点击、统计播放次数以及分析分享效果的功能。

## 数据库表结构

### game_stats 表

```sql
CREATE TABLE game_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,           -- 游戏ID
    shared_by TEXT,                  -- 分享者用户ID（可选）
    clicked_at INTEGER NOT NULL,     -- 点击时间戳
    created_at INTEGER NOT NULL      -- 创建时间戳
);
```

## API 端点

### 1. 记录游戏点击

**POST** `/api/game/track`

记录用户点击/播放游戏的事件。

#### 请求头

```
Authorization: Bearer <token>
Content-Type: application/json
```

#### 请求体

```json
{
  "gameId": "string",      // 必填 - 游戏ID
  "sharedBy": "string"     // 可选 - 分享者的用户ID
}
```

#### 响应

**成功 (200)**

```json
{
  "success": true,
  "message": "Click tracked successfully",
  "data": {
    "id": 1,
    "gameId": "game-123",
    "sharedBy": "user-456",
    "clickedAt": 1706601234567
  }
}
```

**失败 (400)**

```json
{
  "success": false,
  "message": "gameId is required and must be a string"
}
```

#### 使用场景

- 用户直接点击游戏：`{ gameId: "game-123" }`
- 用户通过分享链接点击：`{ gameId: "game-123", sharedBy: "user-456" }`

---

### 2. 获取游戏统计

**GET** `/api/game/stats/:gameId`

获取指定游戏的基本统计信息（总播放次数）。

#### 请求头

```
Authorization: Bearer <token>
```

#### 路径参数

- `gameId` - 游戏ID

#### 响应

**成功 (200)**

```json
{
  "success": true,
  "data": {
    "gameId": "game-123",
    "playCount": 42
  }
}
```

#### 前端使用示例

```typescript
const res = await api.getGameStats('game-123');
console.log(`游戏被玩了 ${res.data.playCount} 次`);
```

---

### 3. 获取详细游戏统计

**GET** `/api/game/stats/:gameId/detailed`

获取游戏的详细统计信息，包括分享来源分析。

#### 请求头

```
Authorization: Bearer <token>
```

#### 路径参数

- `gameId` - 游戏ID

#### 响应

**成功 (200)**

```json
{
  "success": true,
  "data": {
    "gameId": "game-123",
    "totalPlays": 42,
    "directPlays": 15,          // 直接点击次数
    "sharedPlays": 27,          // 通过分享来的点击次数
    "shareBreakdown": [         // 各个分享者的贡献
      {
        "sharedBy": "user-456",
        "count": 20
      },
      {
        "sharedBy": "user-789",
        "count": 7
      }
    ]
  }
}
```

#### 使用场景

- 分析哪些用户的分享最有效
- 了解游戏的传播途径
- 为分享者提供贡献反馈

---

### 4. 获取用户分享统计

**GET** `/api/game/user/:userId/shares`

获取指定用户的分享统计，查看该用户分享的游戏获得了多少点击。

#### 请求头

```
Authorization: Bearer <token>
```

#### 路径参数

- `userId` - 用户ID

#### 响应

**成功 (200)**

```json
{
  "success": true,
  "data": {
    "userId": "user-456",
    "totalShares": 3,              // 分享了几个不同的游戏
    "totalPlaysFromShares": 52,    // 通过这些分享带来的总播放次数
    "games": [
      {
        "gameId": "game-123",
        "playsFromShare": 20
      },
      {
        "gameId": "game-456",
        "playsFromShare": 25
      },
      {
        "gameId": "game-789",
        "playsFromShare": 7
      }
    ]
  }
}
```

#### 使用场景

- 展示用户个人的分享成就
- 排行榜功能
- 分享奖励系统

---

## 完整工作流程示例

### 场景：用户A分享游戏给用户B

1. **用户A点击分享按钮**
   - 前端生成分享链接：`https://example.com/#/market/games?game_id=game-123&shared_by=userA`

2. **用户B通过链接访问并点击游戏**
   - 前端检测URL参数：`game_id=game-123`, `shared_by=userA`
   - 调用追踪API：
   ```javascript
   await api.trackGameClick('game-123', 'userA');
   ```

3. **查看统计**
   - 游戏页面显示：`42人玩过`
   ```javascript
   const stats = await api.getGameStats('game-123');
   // stats.data.playCount === 42
   ```

4. **用户A查看分享贡献**
   ```javascript
   const shareStats = await api.getUserShareStats('userA');
   // shareStats.data.totalPlaysFromShares === 20
   ```

---

## 测试

### 运行测试脚本

```bash
# 确保服务器正在运行
npm run dev

# 在另一个终端运行测试
node test-game-api.js
```

### 手动测试

使用 curl 或 Postman 测试API：

```bash
# 1. 记录点击
curl -X POST http://localhost:80/api/game/track \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"gameId":"game-123","sharedBy":"user-456"}'

# 2. 获取统计
curl http://localhost:80/api/game/stats/game-123 \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. 获取详细统计
curl http://localhost:80/api/game/stats/game-123/detailed \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. 获取用户分享统计
curl http://localhost:80/api/game/user/user-456/shares \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 注意事项

1. **认证要求**：所有API端点都需要有效的JWT token
2. **数据库索引**：已为 `game_id` 和 `shared_by` 字段创建索引以提高查询性能
3. **时间戳**：所有时间使用毫秒级Unix时间戳
4. **可选参数**：`sharedBy` 参数是可选的，如果不提供则记录为直接点击

---

## 文件清单

- `/src/db/index.js` - 数据库schema定义
- `/src/models/GameStatsModel.js` - 游戏统计数据模型
- `/src/controllers/GameController.js` - 游戏统计控制器
- `/src/routes/index.js` - API路由配置
- `/test-game-api.js` - API测试脚本

---

## 未来扩展

可以考虑添加以下功能：

1. **时间范围统计**：查询特定时间段内的统计
2. **地域分析**：记录并分析用户地域分布
3. **设备分析**：统计使用的设备类型
4. **留存率**：追踪用户是否多次访问同一游戏
5. **热力图**：生成游戏流行度的时间热力图
