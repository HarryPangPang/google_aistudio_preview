import jwt from 'jsonwebtoken';
import { UserModel, VerificationCodeModel } from '../models/UserModel.js';
// import emailService from '../services/EmailService.js'; // 暂时禁用邮件服务

// JWT 密钥（生产环境应该使用环境变量）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * 认证控制器
 *
 * ===== 验证码功能已暂时禁用 =====
 * 当前阶段使用邮箱+密码注册登录
 * 验证码相关代码已保留但被注释
 */
export class AuthController {
    /**
     * 发送验证码
     * ===== 已暂时禁用 =====
     */
    static async sendVerificationCode(ctx) {
        // 暂时禁用验证码功能
        ctx.status = 501;
        ctx.body = { success: false, message: '验证码功能暂未启用' };
        return;

        /* ===== 验证码发送逻辑 - 已暂时禁用 =====
        const { email, type = 'register' } = ctx.request.body;

        // 验证邮箱格式
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            ctx.status = 400;
            ctx.body = { success: false, message: '邮箱格式无效' };
            return;
        }

        try {
            // 检查发送频率限制（1分钟内只能发送一次）
            const canSend = await VerificationCodeModel.checkRateLimit(email, type, 1);
            if (!canSend) {
                ctx.status = 429;
                ctx.body = { success: false, message: '发送过于频繁，请稍后再试' };
                return;
            }

            // 如果是注册，检查邮箱是否已存在
            if (type === 'register') {
                const existingUser = await UserModel.findByEmail(email);
                if (existingUser) {
                    ctx.status = 400;
                    ctx.body = { success: false, message: '该邮箱已被注册' };
                    return;
                }
            }

            // 如果是登录，检查邮箱是否存在
            if (type === 'login') {
                const user = await UserModel.findByEmail(email);
                if (!user) {
                    ctx.status = 400;
                    ctx.body = { success: false, message: '该邮箱未注册' };
                    return;
                }
            }

            // 生成6位数字验证码
            const code = Math.floor(100000 + Math.random() * 900000).toString();

            // 保存验证码到数据库
            await VerificationCodeModel.create(email, code, type);

            // 发送邮件
            const result = await emailService.sendVerificationCode(email, code, type);

            if (result.success) {
                ctx.body = {
                    success: true,
                    message: '验证码已发送到您的邮箱',
                    data: { email }
                };
            } else {
                ctx.status = 500;
                ctx.body = { success: false, message: '发送邮件失败，请稍后重试' };
            }
        } catch (error) {
            console.error('[AuthController] 发送验证码失败:', error);
            ctx.status = 500;
            ctx.body = { success: false, message: error.message || '发送验证码失败' };
        }
        */
    }

    /**
     * 注册
     * 修改：不再需要验证码，直接使用邮箱+密码注册
     */
    static async register(ctx) {
        const { email, password, username } = ctx.request.body;

        // 验证必填字段
        if (!email || !password) {
            ctx.status = 400;
            ctx.body = { success: false, message: '邮箱和密码不能为空' };
            return;
        }

        // 验证邮箱格式
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            ctx.status = 400;
            ctx.body = { success: false, message: '邮箱格式无效' };
            return;
        }

        // 验证密码长度
        if (password.length < 6) {
            ctx.status = 400;
            ctx.body = { success: false, message: '密码长度至少为6位' };
            return;
        }

        try {
            /* ===== 验证码验证逻辑 - 已暂时禁用 =====
            const verification = await VerificationCodeModel.verify(email, code, 'register');
            if (!verification.valid) {
                ctx.status = 400;
                ctx.body = { success: false, message: verification.message };
                return;
            }
            */

            // 创建用户
            const user = await UserModel.create(email, password, username);

            // 生成 JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            /* ===== 欢迎邮件 - 已暂时禁用 =====
            emailService.sendWelcomeEmail(email, username).catch(err => {
                console.error('[AuthController] 发送欢迎邮件失败:', err);
            });
            */

            ctx.body = {
                success: true,
                message: '注册成功',
                data: {
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        username: user.username,
                    }
                }
            };
        } catch (error) {
            console.error('[AuthController] 注册失败:', error);
            ctx.status = 500;
            ctx.body = { success: false, message: error.message || '注册失败' };
        }
    }

    /**
     * 登录（密码登录）
     */
    static async login(ctx) {
        const { email, password } = ctx.request.body;

        if (!email || !password) {
            ctx.status = 400;
            ctx.body = { success: false, message: '邮箱和密码不能为空' };
            return;
        }

        try {
            // 查找用户
            const user = await UserModel.findByEmail(email);
            if (!user) {
                ctx.status = 401;
                ctx.body = { success: false, message: '邮箱或密码错误' };
                return;
            }

            // 验证密码
            const isValid = await UserModel.verifyPassword(password, user.password);
            if (!isValid) {
                ctx.status = 401;
                ctx.body = { success: false, message: '邮箱或密码错误' };
                return;
            }

            // 生成 JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            ctx.body = {
                success: true,
                message: '登录成功',
                data: {
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        username: user.username,
                    }
                }
            };
        } catch (error) {
            console.error('[AuthController] 登录失败:', error);
            ctx.status = 500;
            ctx.body = { success: false, message: '登录失败' };
        }
    }

    /**
     * 验证码登录
     * ===== 已暂时禁用 =====
     */
    static async loginWithCode(ctx) {
        // 暂时禁用验证码登录
        ctx.status = 501;
        ctx.body = { success: false, message: '验证码登录功能暂未启用' };
        return;

        /* ===== 验证码登录逻辑 - 已暂时禁用 =====
        const { email, code } = ctx.request.body;

        if (!email || !code) {
            ctx.status = 400;
            ctx.body = { success: false, message: '邮箱和验证码不能为空' };
            return;
        }

        try {
            // 验证验证码
            const verification = await VerificationCodeModel.verify(email, code, 'login');
            if (!verification.valid) {
                ctx.status = 400;
                ctx.body = { success: false, message: verification.message };
                return;
            }

            // 查找用户
            const user = await UserModel.findByEmail(email);
            if (!user) {
                ctx.status = 404;
                ctx.body = { success: false, message: '用户不存在' };
                return;
            }

            // 生成 JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            ctx.body = {
                success: true,
                message: '登录成功',
                data: {
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        username: user.username,
                    }
                }
            };
        } catch (error) {
            console.error('[AuthController] 验证码登录失败:', error);
            ctx.status = 500;
            ctx.body = { success: false, message: '登录失败' };
        }
        */
    }

    /**
     * 获取当前用户信息
     */
    static async getCurrentUser(ctx) {
        try {
            const user = await UserModel.findById(ctx.state.user.id);
            if (!user) {
                ctx.status = 404;
                ctx.body = { success: false, message: '用户不存在' };
                return;
            }

            ctx.body = {
                success: true,
                data: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    created_at: user.created_at,
                }
            };
        } catch (error) {
            console.error('[AuthController] 获取用户信息失败:', error);
            ctx.status = 500;
            ctx.body = { success: false, message: '获取用户信息失败' };
        }
    }

    /**
     * JWT 认证中间件
     */
    static async authenticate(ctx, next) {
        const token = ctx.headers.authorization?.replace('Bearer ', '');
        if(ctx.state.isInternalService) {
            // 来自内部服务的请求，跳过用户认证
            await next();
            return;
        }
        if (!token) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未提供认证令牌' };
            return;
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            ctx.state.user = decoded;
            await next();
        } catch (error) {
            ctx.status = 401;
            ctx.body = { success: false, message: '认证令牌无效或已过期' };
        }
    }
}
