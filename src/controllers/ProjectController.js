import { ProjectModel } from '../models/ProjectModel.js';
import { v4 as uuidv4 } from 'uuid';

export const ProjectController = {
    /**
     * 创建新项目
     * POST /api/projects
     */
    async create(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        try {
            const projectData = ctx.request.body;

            // 生成 ID（如果未提供）
            const id = projectData.id || uuidv4();

            // 添加用户信息
            const newProject = {
                ...projectData,
                id,
                user_id: user.id,
                username: user.username || user.email
            };

            await ProjectModel.create(newProject);

            ctx.body = {
                success: true,
                data: { id }
            };
        } catch (err) {
            console.error('[ProjectController] Create error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    /**
     * 更新项目
     * PUT /api/projects/:id
     */
    async update(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        const { id } = ctx.params;

        try {
            // 验证项目是否存在以及用户权限
            const existingProject = await ProjectModel.getById(id);

            if (!existingProject) {
                ctx.status = 404;
                ctx.body = { error: 'Project not found' };
                return;
            }

            if (existingProject.user_id !== user.id) {
                ctx.status = 403;
                ctx.body = { error: 'Forbidden: You do not own this project' };
                return;
            }

            const updateData = ctx.request.body;
            await ProjectModel.update(id, updateData);

            ctx.body = {
                success: true,
                data: { id }
            };
        } catch (err) {
            console.error('[ProjectController] Update error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    /**
     * 创建或更新项目（用于兼容旧代码）
     * POST /api/projects/save
     */
    async createOrUpdate(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        try {
            const projectData = ctx.request.body;
            const id = projectData.id || uuidv4();

            // 检查项目是否存在
            const existingProject = await ProjectModel.getById(id);

            if (existingProject) {
                // 验证权限
                if (existingProject.user_id !== user.id) {
                    ctx.status = 403;
                    ctx.body = { error: 'Forbidden: You do not own this project' };
                    return;
                }

                // 更新项目
                await ProjectModel.update(id, projectData);
            } else {
                // 创建新项目
                await ProjectModel.create({
                    ...projectData,
                    id,
                    user_id: user.id,
                    username: user.username || user.email
                });
            }

            ctx.body = {
                success: true,
                data: { id }
            };
        } catch (err) {
            console.error('[ProjectController] CreateOrUpdate error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    /**
     * 获取单个项目
     * GET /api/projects/:id
     */
    async getById(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        const { id } = ctx.params;

        try {
            const project = await ProjectModel.getById(id);

            if (!project) {
                ctx.status = 404;
                ctx.body = { error: 'Project not found' };
                return;
            }

            if (project.user_id !== user.id) {
                ctx.status = 403;
                ctx.body = { error: 'Forbidden: You do not own this project' };
                return;
            }

            ctx.body = {
                success: true,
                data: project
            };
        } catch (err) {
            console.error('[ProjectController] GetById error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    /**
     * 根据 driveid 获取项目
     * GET /api/projects/by-driveid/:driveid
     */
    async getByDriveid(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        const { driveid } = ctx.params;

        try {
            const project = await ProjectModel.getByDriveid(driveid);

            if (!project) {
                ctx.status = 404;
                ctx.body = { error: 'Project not found' };
                return;
            }

            if (project.user_id !== user.id) {
                ctx.status = 403;
                ctx.body = { error: 'Forbidden: You do not own this project' };
                return;
            }

            ctx.body = {
                success: true,
                data: project
            };
        } catch (err) {
            console.error('[ProjectController] GetByDriveid error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    /**
     * 获取用户的项目列表
     * GET /api/projects
     */
    async getList(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        try {
            const { status, limit, offset } = ctx.query;

            const options = {};
            if (status) options.status = status;
            if (limit) options.limit = parseInt(limit);
            if (offset) options.offset = parseInt(offset);

            const projects = await ProjectModel.getByUserId(user.id, options);

            ctx.body = {
                success: true,
                data: projects
            };
        } catch (err) {
            console.error('[ProjectController] GetList error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    /**
     * 删除项目
     * DELETE /api/projects/:id
     */
    async delete(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        const { id } = ctx.params;

        try {
            // 验证项目是否存在以及用户权限
            const existingProject = await ProjectModel.getById(id);

            if (!existingProject) {
                ctx.status = 404;
                ctx.body = { error: 'Project not found' };
                return;
            }

            if (existingProject.user_id !== user.id) {
                ctx.status = 403;
                ctx.body = { error: 'Forbidden: You do not own this project' };
                return;
            }

            await ProjectModel.delete(id);

            ctx.body = { success: true };
        } catch (err) {
            console.error('[ProjectController] Delete error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    },

    /**
     * 批量迁移项目（从前端 localStorage 到数据库）
     * POST /api/projects/migrate
     */
    async migrate(ctx) {
        const user = ctx.state.user;
        if (!user) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }

        try {
            const { projects } = ctx.request.body;

            if (!Array.isArray(projects)) {
                ctx.status = 400;
                ctx.body = { error: 'Projects must be an array' };
                return;
            }

            const results = {
                success: 0,
                failed: 0,
                errors: []
            };

            for (const project of projects) {
                try {
                    const id = project.id || project.driveid || uuidv4();

                    // 检查项目是否已存在
                    const existing = await ProjectModel.getById(id);

                    if (!existing) {
                        // 只创建不存在的项目
                        await ProjectModel.create({
                            ...project,
                            id,
                            user_id: user.id,
                            username: user.username || user.email,
                            model_label: project.model?.label,
                            model_value: project.model?.value
                        });
                        results.success++;
                    } else {
                        // 项目已存在，跳过
                        results.success++;
                    }
                } catch (err) {
                    results.failed++;
                    results.errors.push({
                        project: project.id || project.driveid,
                        error: err.message
                    });
                }
            }

            ctx.body = {
                success: true,
                data: results
            };
        } catch (err) {
            console.error('[ProjectController] Migrate error:', err);
            ctx.status = 500;
            ctx.body = { error: err.message };
        }
    }
};
