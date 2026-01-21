import { v4 as uuidv4 } from 'uuid';
import { DeploymentModel } from '../models/DeploymentModel.js';
import { AppModel } from '../models/AppModel.js';
import { BuildService } from '../services/BuildService.js';
import { PORT } from '../config/constants.js';

export const DeployController = {
    /**
     * Trigger a new deployment
     * Supports either { files: ... } OR { appId: ... }
     */
    async deploy(ctx) {
        let { files, appId } = ctx.request.body;
        
        // Mode 2: Deploy from App ID
        if (appId && !files) {
            const app = await AppModel.get(appId);
            if (!app) {
                ctx.status = 404;
                ctx.body = { error: 'App not found' };
                return;
            }
            files = app.files;
        }

        if (!files) {
            ctx.status = 400;
            ctx.body = { error: 'No files or appId provided' };
            return;
        }

        const deployId = uuidv4();
        
        // 1. Create Record (Snapshot)
        await DeploymentModel.create(deployId, files, appId);

        // Update App's latest deploy link
        if (appId) {
            await AppModel.updateLatestDeploy(appId, deployId);
        }

        // 2. Trigger Async Build (No await)
        // Note: In a real message queue system, we'd push to queue here.
        // Since we have a polling worker, creating the DB record with 'pending' status IS the trigger.
        // We do NOT need to call BuildService directly anymore, the Worker will pick it up.
        // Wait, did we remove direct call in previous step?
        // Let's check logic:
        // Worker polls DB for 'pending'.
        // So just creating the record is enough.
        // BUT, if we want immediate feedback or if worker is slow, we might want to kick it?
        // No, stick to the pattern: API writes to DB, Worker reads from DB.
        
        // 3. Return immediate response
        ctx.body = { 
            success: true, 
            id: deployId,
            status: 'pending',
            url: `preview?id=${deployId}`
        };
    },

    /**
     * Get deployment status
     */
    async getStatus(ctx) {
        const id = ctx.params.id;
        const state = await DeploymentModel.getStatus(id);
        
        if (!state) {
            ctx.status = 404;
            ctx.body = { error: 'Deployment not found' };
            return;
        }
        
        ctx.body = state;
    }
};
