import nodemailer from 'nodemailer';

/**
 * 邮件服务
 * 注意：这里使用的是示例配置，实际使用时需要配置真实的邮件服务器
 *
 * ===== 邮件功能已暂时禁用 =====
 * 当前阶段不需要邮件验证码功能
 * 所有邮件相关代码已保留但被注释
 * 如需启用，取消下面代码的注释即可
 */
class EmailService {
    constructor() {
        // 开发环境使用 Ethereal Email (测试邮箱服务)
        // 生产环境需要配置真实的 SMTP 服务器
        this.transporter = null;
        // this.init(); // 暂时禁用邮件服务初始化
    }

    async init() {
        // 创建测试账号（仅用于开发）
        // 生产环境应该使用环境变量配置真实的 SMTP
        /* ===== 邮件初始化代码 - 已暂时禁用 =====
        try {
            if (process.env.SMTP_HOST) {
                // 使用配置的 SMTP 服务器
                this.transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                });
            } else {
                // 开发模式：使用 Ethereal 测试邮箱
                const testAccount = await nodemailer.createTestAccount();
                this.transporter = nodemailer.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass,
                    },
                });
                console.log('[EmailService] 使用测试邮箱服务 (Ethereal Email)');
                console.log('[EmailService] Test account:', testAccount.user);
            }
        } catch (error) {
            console.error('[EmailService] 初始化失败:', error);
        }
        */
    }

    /**
     * 发送验证码邮件
     * ===== 已暂时禁用 =====
     */
    async sendVerificationCode(email, code, type = 'register') {
        // 暂时禁用邮件发送，直接返回成功
        console.log('[EmailService] 邮件功能已禁用 - 验证码:', code, '邮箱:', email);
        return { success: true, messageId: 'disabled' };

        /* ===== 邮件发送代码 - 已暂时禁用 =====
        try {
            if (!this.transporter) {
                await this.init();
            }

            const subject = type === 'register' ? '注册验证码' : '登录验证码';
            const html = `
                <div style="padding: 20px; font-family: Arial, sans-serif;">
                    <h2 style="color: #333;">AI Studio</h2>
                    <p>您的验证码是：</p>
                    <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
                        <h1 style="color: #4CAF50; margin: 0; letter-spacing: 5px;">${code}</h1>
                    </div>
                    <p>验证码有效期为 5 分钟，请及时使用。</p>
                    <p style="color: #999; font-size: 12px;">如果这不是您的操作，请忽略此邮件。</p>
                </div>
            `;

            const info = await this.transporter.sendMail({
                from: process.env.SMTP_FROM || '"AI Studio" <noreply@aistudio.com>',
                to: email,
                subject: subject,
                html: html,
            });

            // 如果是测试环境，打印预览链接
            if (!process.env.SMTP_HOST) {
                console.log('[EmailService] 邮件预览链接:', nodemailer.getTestMessageUrl(info));
            }

            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('[EmailService] 发送邮件失败:', error);
            return { success: false, error: error.message };
        }
        */
    }

    /**
     * 发送欢迎邮件
     * ===== 已暂时禁用 =====
     */
    async sendWelcomeEmail(email, username) {
        // 暂时禁用欢迎邮件
        console.log('[EmailService] 邮件功能已禁用 - 欢迎邮件:', email, username);
        return { success: true, messageId: 'disabled' };

        /* ===== 欢迎邮件代码 - 已暂时禁用 =====
        try {
            if (!this.transporter) {
                await this.init();
            }

            const html = `
                <div style="padding: 20px; font-family: Arial, sans-serif;">
                    <h2 style="color: #333;">欢迎加入 AI Studio!</h2>
                    <p>尊敬的 ${username || '用户'}，</p>
                    <p>感谢您注册 AI Studio。您现在可以开始创建您的第一个项目了。</p>
                    <div style="margin: 30px 0;">
                        <a href="${process.env.APP_URL || 'http://localhost:5173'}"
                           style="background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            开始创建
                        </a>
                    </div>
                    <p style="color: #999; font-size: 12px;">祝您使用愉快！</p>
                </div>
            `;

            const info = await this.transporter.sendMail({
                from: process.env.SMTP_FROM || '"AI Studio" <noreply@aistudio.com>',
                to: email,
                subject: '欢迎加入 AI Studio',
                html: html,
            });

            if (!process.env.SMTP_HOST) {
                console.log('[EmailService] 欢迎邮件预览链接:', nodemailer.getTestMessageUrl(info));
            }

            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('[EmailService] 发送欢迎邮件失败:', error);
            return { success: false, error: error.message };
        }
        */
    }
}

// 单例模式
const emailService = new EmailService();

export default emailService;
