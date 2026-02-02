import Router from 'koa-router';
import { DeployController } from '../controllers/DeployController.js';
import { PreviewController } from '../controllers/PreviewController.js';
import { AppController } from '../controllers/AppController.js';
import { GenerateController } from '../controllers/GenerateController.js';
import { AuthController } from '../controllers/AuthController.js';
import { GameController } from '../controllers/GameController.js';
import { ProjectController } from '../controllers/ProjectController.js';

const router = new Router();

// ==================== 公开路由（无需认证） ====================
// Auth Routes - 注册和登录无需认证
router.post('/api/auth/register', AuthController.register);
router.post('/api/auth/login', AuthController.login);

// 暂时禁用的验证码相关接口
// router.post('/api/auth/send-code', AuthController.sendVerificationCode);
// router.post('/api/auth/login-with-code', AuthController.loginWithCode);

// Preview Routes - 预览页面无需认证（如果需要可以改为需要认证）
router.get('/preview', PreviewController.entry);
router.get('/playground', PreviewController.playground);

// ==================== 受保护路由（需要认证） ====================
// 所有以下路由都需要登录后才能访问

// Auth Routes - 获取当前用户信息
router.get('/api/auth/me', AuthController.authenticate, AuthController.getCurrentUser);

// Deploy Routes - 部署相关
router.post('/api/deploy', AuthController.authenticate, DeployController.deploy);
router.get('/api/status/:id', AuthController.authenticate, DeployController.getStatus);
router.post('/api/import', AuthController.authenticate, DeployController.importFromUrl);
router.post('/api/uploadzip', AuthController.authenticate, DeployController.uploadzip);

// App Routes - 应用源码存储
router.post('/api/apps', AuthController.authenticate, AppController.save);
router.get('/api/apps', AuthController.authenticate, AppController.get);
router.get('/api/chatRecord', AuthController.authenticate, AppController.chatRecord);
router.get('/api/buildRecord', AuthController.authenticate, AppController.buildRecord);

// Generate Routes - AI 生成相关
router.post('/api/generate', AuthController.authenticate, GenerateController.generate);
router.get('/api/chatcontent', AuthController.authenticate, GenerateController.chatcontent);
router.post('/api/initChatContent', AuthController.authenticate, GenerateController.initChatContent);
router.post('/api/chatmsg', AuthController.authenticate, GenerateController.chatmsg);
router.post('/api/download', AuthController.authenticate, GenerateController.downloadcode);
router.post('/api/deploywithcode', AuthController.authenticate, GenerateController.deploywithcode);
router.post('/api/buildcode', AuthController.authenticate, GenerateController.buildCode);

// Game Statistics Routes - 游戏统计
router.post('/api/game/track', AuthController.authenticate, GameController.trackClick);
router.get('/api/game/stats/:gameId', AuthController.authenticate, GameController.getStats);
router.get('/api/game/stats/:gameId/detailed', AuthController.authenticate, GameController.getDetailedStats);
router.get('/api/game/user/:userId/shares', AuthController.authenticate, GameController.getUserShareStats);

// Project Routes - 项目管理
router.post('/api/projects', AuthController.authenticate, ProjectController.create);
router.post('/api/projects/save', AuthController.authenticate, ProjectController.createOrUpdate);
router.post('/api/projects/migrate', AuthController.authenticate, ProjectController.migrate);
router.get('/api/projects', AuthController.authenticate, ProjectController.getList);
router.get('/api/projects/by-driveid/:driveid', AuthController.authenticate, ProjectController.getByDriveid);
router.get('/api/projects/:id', AuthController.authenticate, ProjectController.getById);
router.put('/api/projects/:id', AuthController.authenticate, ProjectController.update);
router.delete('/api/projects/:id', AuthController.authenticate, ProjectController.delete);


export default router;
